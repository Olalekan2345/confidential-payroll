// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { FHE, euint64, externalEuint64 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title ConfidentialPayroll
 * @notice On-chain payroll with Zama FHEVM encrypted salaries.
 *
 * Privacy model:
 *  - Salary RATES are stored as FHE ciphertexts — never readable on-chain.
 *  - paySalary() makes ZERO ETH transfers and emits NO amount — the payment
 *    transaction reveals nothing about the salary on Etherscan.
 *  - Encrypted pendingBalance accumulates per employee each pay cycle.
 *  - claimSalary(amount) lets employees withdraw their earned ETH. The employee
 *    first calls getMyPendingBalance() + userDecrypt (off-chain) to learn their
 *    amount, then submits that amount to claim. This claim step is visible, but
 *    it is fully decoupled from the employer's salary decisions.
 *  - totalPaid is an encrypted running total — only employer/employee can read it.
 */
contract ConfidentialPayroll is ZamaEthereumConfig {

    // ─── Roles ────────────────────────────────────────────────────────────────

    address public employer;
    bool    public closed;

    modifier onlyEmployer() {
        require(msg.sender == employer, "ConfidentialPayroll: not employer");
        _;
    }

    modifier notClosed() {
        require(!closed, "ConfidentialPayroll: payroll is closed");
        _;
    }

    // ─── Data ─────────────────────────────────────────────────────────────────

    struct Employee {
        bool     active;
        euint64  salary;          // encrypted monthly salary rate (in wei)
        euint64  pendingBalance;  // encrypted accumulated unclaimed salary
        euint64  totalPaid;       // encrypted lifetime total paid
        uint256  lastPaidAt;      // timestamp of last paySalary call
    }

    mapping(address => Employee) private _employees;
    address[] private _employeeList;

    // ─── Events ───────────────────────────────────────────────────────────────

    event EmployeeAdded(address indexed employee);
    event EmployeeRemoved(address indexed employee);
    event SalaryUpdated(address indexed employee);
    event PayrollFunded(address indexed funder, uint256 amount);
    /// @dev Intentionally contains NO amount — this keeps the payment confidential.
    event SalaryPaid(address indexed employee, uint256 timestamp);
    /// @dev Emitted when an employee withdraws earned ETH. Amount is visible here.
    event SalaryClaimed(address indexed employee, uint256 amount);
    event PayrollWithdrawn(address indexed employer, uint256 amount);
    event PayrollClosed(address indexed employer, uint256 refunded);

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address _employer) {
        require(_employer != address(0), "ConfidentialPayroll: zero employer");
        employer = _employer;
    }

    // ─── Fund ─────────────────────────────────────────────────────────────────

    function fundPayroll() external payable onlyEmployer notClosed {
        require(msg.value > 0, "ConfidentialPayroll: zero deposit");
        emit PayrollFunded(msg.sender, msg.value);
    }

    // ─── Manage employees ─────────────────────────────────────────────────────

    /**
     * @notice Add a new employee with a confidential salary.
     * @param  employee   Wallet address of the employee.
     * @param  encSalary  Salary in wei, encrypted client-side via the FHEVM SDK.
     * @param  inputProof ZK proof from the relayer.
     *
     * No plaintext salary is ever stored or emitted — only the FHE ciphertext.
     */
    function addEmployee(
        address employee,
        externalEuint64 encSalary,
        bytes calldata inputProof
    ) external onlyEmployer notClosed {
        require(employee != address(0), "ConfidentialPayroll: zero address");
        require(!_employees[employee].active, "ConfidentialPayroll: already registered");

        euint64 salary  = FHE.fromExternal(encSalary, inputProof);
        euint64 pending = FHE.asEuint64(0);
        euint64 total   = FHE.asEuint64(0);

        _employees[employee] = Employee({
            active:         true,
            salary:         salary,
            pendingBalance: pending,
            totalPaid:      total,
            lastPaidAt:     0
        });

        _grantAccess(salary,  employer, employee);
        _grantAccess(pending, employer, employee);
        _grantAccess(total,   employer, employee);

        _employeeList.push(employee);
        emit EmployeeAdded(employee);
    }

    /**
     * @notice Update an employee's salary (confidential — no plaintext on-chain).
     */
    function updateSalary(
        address employee,
        externalEuint64 encNewSalary,
        bytes calldata inputProof
    ) external onlyEmployer notClosed {
        require(_employees[employee].active, "ConfidentialPayroll: not registered");

        euint64 newSalary = FHE.fromExternal(encNewSalary, inputProof);
        _employees[employee].salary = newSalary;
        _grantAccess(newSalary, employer, employee);

        emit SalaryUpdated(employee);
    }

    /**
     * @notice Deactivate an employee.
     */
    function removeEmployee(address employee) external onlyEmployer notClosed {
        require(_employees[employee].active, "ConfidentialPayroll: not registered");
        _employees[employee].active = false;
        emit EmployeeRemoved(employee);
    }

    // ─── Pay ──────────────────────────────────────────────────────────────────

    /**
     * @notice Record a salary payment for one employee.
     *
     * This function performs ONLY FHE arithmetic — no ETH is transferred,
     * and the event contains no amount. The transaction is fully confidential:
     * Etherscan shows a contract call with 0 ETH value and no visible salary figure.
     *
     * The employee's pendingBalance (encrypted) increases by their salary.
     * When ready to collect, the employee calls claimSalary().
     */
    function paySalary(address employee) public onlyEmployer notClosed {
        Employee storage emp = _employees[employee];
        require(emp.active, "ConfidentialPayroll: not registered");

        // All arithmetic in FHE encrypted space — no plaintext leaves the contract.
        emp.pendingBalance = FHE.add(emp.pendingBalance, emp.salary);
        emp.totalPaid      = FHE.add(emp.totalPaid,      emp.salary);
        emp.lastPaidAt     = block.timestamp;

        _grantAccess(emp.pendingBalance, employer, employee);
        _grantAccess(emp.totalPaid,      employer, employee);

        emit SalaryPaid(employee, block.timestamp);
    }

    /**
     * @notice Pay all active employees in one transaction.
     */
    function payAll() external onlyEmployer notClosed {
        for (uint256 i = 0; i < _employeeList.length; i++) {
            address emp = _employeeList[i];
            if (_employees[emp].active) {
                paySalary(emp);
            }
        }
    }

    // ─── Claim ────────────────────────────────────────────────────────────────

    /**
     * @notice Employee withdraws their earned ETH.
     * @param  amountWei  Amount to claim (employee learns this via userDecrypt on
     *                    getMyPendingBalance() in the front-end before calling).
     *
     * Security note: the claim amount is not validated against the encrypted
     * pendingBalance on-chain because doing so requires the Zama decryption oracle
     * (async gateway), which is out of scope for this demo. The employer can audit
     * via their own userDecrypt call on getEmployeePendingBalance().
     */
    function claimSalary(uint64 amountWei) external notClosed {
        Employee storage emp = _employees[msg.sender];
        require(emp.active, "ConfidentialPayroll: not registered");
        require(amountWei > 0, "ConfidentialPayroll: zero claim");
        require(address(this).balance >= amountWei, "ConfidentialPayroll: insufficient pool");

        // Subtract from encrypted pending balance
        euint64 amt = FHE.asEuint64(amountWei);
        emp.pendingBalance = FHE.sub(emp.pendingBalance, amt);
        _grantAccess(emp.pendingBalance, employer, msg.sender);

        (bool ok,) = payable(msg.sender).call{value: amountWei}("");
        require(ok, "ConfidentialPayroll: ETH transfer failed");

        emit SalaryClaimed(msg.sender, amountWei);
    }

    // ─── Employee views ───────────────────────────────────────────────────────

    function getMySalary() external view returns (euint64) {
        require(_employees[msg.sender].active, "ConfidentialPayroll: not registered");
        return _employees[msg.sender].salary;
    }

    function getMyPendingBalance() external view returns (euint64) {
        require(_employees[msg.sender].active, "ConfidentialPayroll: not registered");
        return _employees[msg.sender].pendingBalance;
    }

    function getMyTotalPaid() external view returns (euint64) {
        require(_employees[msg.sender].active, "ConfidentialPayroll: not registered");
        return _employees[msg.sender].totalPaid;
    }

    // ─── Shared views ─────────────────────────────────────────────────────────

    function getEmployeeInfo(address employee)
        external view
        returns (bool active, uint256 lastPaidAt)
    {
        return (_employees[employee].active, _employees[employee].lastPaidAt);
    }

    function getEmployeeList() external view returns (address[] memory) {
        return _employeeList;
    }

    // ─── Employer views ───────────────────────────────────────────────────────

    function getEmployeeSalary(address employee) external view onlyEmployer returns (euint64) {
        return _employees[employee].salary;
    }

    function getEmployeePendingBalance(address employee) external view onlyEmployer returns (euint64) {
        return _employees[employee].pendingBalance;
    }

    // ─── Withdraw surplus ─────────────────────────────────────────────────────

    function withdrawSurplus(uint256 amount) external onlyEmployer notClosed {
        require(address(this).balance >= amount, "ConfidentialPayroll: insufficient ETH");
        payable(employer).transfer(amount);
        emit PayrollWithdrawn(employer, amount);
    }

    // ─── Close payroll ────────────────────────────────────────────────────────

    function closePayroll() external onlyEmployer notClosed {
        closed = true;
        uint256 bal = address(this).balance;
        if (bal > 0) {
            payable(employer).transfer(bal);
        }
        emit PayrollClosed(employer, bal);
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _grantAccess(euint64 val, address a, address b) internal {
        FHE.allowThis(val);
        FHE.allow(val, a);
        FHE.allow(val, b);
    }

    receive() external payable {}
}
