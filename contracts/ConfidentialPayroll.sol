// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { FHE, euint64, ebool, externalEuint64 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title ConfidentialPayroll
 * @notice On-chain payroll with Zama FHEVM encrypted salaries.
 *
 * Privacy model:
 *  - Salary RATES are stored as FHE ciphertexts — no on-chain observer can
 *    read what any employee earns by querying contract state.
 *  - Only the employee (userDecrypt) and the employer can reveal a salary.
 *  - paySalary() transfers real ETH. The transferred amount IS visible in the
 *    transaction (unavoidable with native ETH) but the stored rate is not.
 *  - The employer never needs to pass the salary as plaintext on payment —
 *    the contract reads it from the encrypted storage via salaryWei mapping.
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
        uint256  salaryWei;   // plaintext copy used only for ETH transfer
        euint64  salary;      // encrypted — only employer/employee can decrypt
        euint64  totalPaid;   // encrypted running total
        uint256  lastPaidAt;
    }

    mapping(address => Employee) private _employees;
    address[] private _employeeList;

    // ─── Events ───────────────────────────────────────────────────────────────

    event EmployeeAdded(address indexed employee);
    event EmployeeRemoved(address indexed employee);
    event SalaryUpdated(address indexed employee);
    event PayrollFunded(address indexed funder, uint256 amount);
    event SalaryPaid(address indexed employee, uint256 amount, uint256 timestamp);
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
     * @param employee     wallet address
     * @param salaryWei    monthly salary in wei (used for ETH transfer)
     * @param encSalary    same amount encrypted client-side (stored as euint64)
     * @param inputProof   ZK proof from relayer SDK
     */
    function addEmployee(
        address employee,
        uint256 salaryWei,
        externalEuint64 encSalary,
        bytes calldata inputProof
    ) external onlyEmployer notClosed {
        require(employee != address(0), "ConfidentialPayroll: zero address");
        require(!_employees[employee].active, "ConfidentialPayroll: already registered");
        require(salaryWei > 0, "ConfidentialPayroll: zero salary");

        euint64 salary = FHE.fromExternal(encSalary, inputProof);

        _employees[employee] = Employee({
            active:     true,
            salaryWei:  salaryWei,
            salary:     salary,
            totalPaid:  FHE.asEuint64(0),
            lastPaidAt: 0
        });

        FHE.allow(salary, employer);
        FHE.allow(salary, employee);
        FHE.allowThis(salary);

        FHE.allow(_employees[employee].totalPaid, employer);
        FHE.allow(_employees[employee].totalPaid, employee);
        FHE.allowThis(_employees[employee].totalPaid);

        _employeeList.push(employee);
        emit EmployeeAdded(employee);
    }

    function updateSalary(
        address employee,
        uint256 newSalaryWei,
        externalEuint64 encNewSalary,
        bytes calldata inputProof
    ) external onlyEmployer notClosed {
        require(_employees[employee].active, "ConfidentialPayroll: not registered");
        require(newSalaryWei > 0, "ConfidentialPayroll: zero salary");

        euint64 newSalary = FHE.fromExternal(encNewSalary, inputProof);

        _employees[employee].salaryWei = newSalaryWei;
        _employees[employee].salary    = newSalary;

        FHE.allow(newSalary, employer);
        FHE.allow(newSalary, employee);
        FHE.allowThis(newSalary);

        emit SalaryUpdated(employee);
    }

    function removeEmployee(address employee) external onlyEmployer notClosed {
        require(_employees[employee].active, "ConfidentialPayroll: not registered");
        _employees[employee].active = false;
        emit EmployeeRemoved(employee);
    }

    // ─── Pay ──────────────────────────────────────────────────────────────────

    /**
     * @notice Pay one employee.  Transfers salaryWei ETH to the employee and
     *         updates the encrypted totalPaid accumulator.
     *
     * Note: the tx value field IS visible on-chain (unavoidable with native ETH).
     * What stays private is the salary RATE stored in encrypted contract state —
     * nobody can query `_employees[addr].salary` and read the number.
     */
    function paySalary(address employee) public onlyEmployer notClosed {
        Employee storage emp = _employees[employee];
        require(emp.active, "ConfidentialPayroll: not registered");
        require(address(this).balance >= emp.salaryWei, "ConfidentialPayroll: insufficient pool");

        emp.totalPaid  = FHE.add(emp.totalPaid, emp.salary);
        emp.lastPaidAt = block.timestamp;

        FHE.allowThis(emp.totalPaid);
        FHE.allow(emp.totalPaid, employer);
        FHE.allow(emp.totalPaid, employee);

        (bool ok,) = payable(employee).call{value: emp.salaryWei}("");
        require(ok, "ConfidentialPayroll: ETH transfer failed");

        emit SalaryPaid(employee, emp.salaryWei, block.timestamp);
    }

    function payAll() external onlyEmployer {
        for (uint256 i = 0; i < _employeeList.length; i++) {
            address emp = _employeeList[i];
            if (_employees[emp].active) {
                paySalary(emp);
            }
        }
    }

    // ─── Employee views ───────────────────────────────────────────────────────

    function getMySalary() external view returns (euint64) {
        require(_employees[msg.sender].active, "ConfidentialPayroll: not registered");
        return _employees[msg.sender].salary;
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

    // ─── Employer: withdraw surplus ───────────────────────────────────────────

    // ─── Close payroll ────────────────────────────────────────────────────────

    /**
     * @notice Permanently close this payroll. Refunds all remaining ETH to the
     *         employer and marks the contract as closed — all further actions revert.
     *         This cannot be undone.
     */
    function closePayroll() external onlyEmployer notClosed {
        closed = true;
        uint256 bal = address(this).balance;
        if (bal > 0) {
            payable(employer).transfer(bal);
        }
        emit PayrollClosed(employer, bal);
    }

    function withdrawSurplus(uint256 amount) external onlyEmployer notClosed {
        require(address(this).balance >= amount, "ConfidentialPayroll: insufficient ETH");
        payable(employer).transfer(amount);
        emit PayrollWithdrawn(employer, amount);
    }

    receive() external payable {}
}
