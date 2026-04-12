// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { FHE, euint64, ebool, externalEuint64 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import { IConfidentialERC20 } from "./IConfidentialERC20.sol";

/**
 * @title ConfidentialPayroll
 * @notice On-chain payroll with Zama FHEVM encrypted salaries.
 *
 * Supports three salary tokens:
 *   0 = ETH   — paid from the contract's ETH pool
 *   1 = cUSDC — confidential USDC; transferred from employer's cUSDC balance
 *   2 = cUSDT — confidential USDT; transferred from employer's cUSDT balance
 *
 * For cUSDC / cUSDT payments the employer must first:
 *   1. Wrap USDC/USDT → cUSDC/cUSDT using the Swap tab.
 *   2. Approve this payroll contract as an operator on the cToken contract.
 *      (approveOperator(payrollAddress, true) — one-time per token)
 */
contract ConfidentialPayroll is ZamaEthereumConfig {

    // ─── Token enum ───────────────────────────────────────────────────────────

    enum SalaryToken { ETH, cUSDC, cUSDT }

    // ─── Roles ────────────────────────────────────────────────────────────────

    address public employer;
    address public confUsdcAddress;
    address public confUsdtAddress;
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
        bool        active;
        SalaryToken salaryToken;  // ETH, cUSDC, or cUSDT
        uint256     salaryWei;    // used only for ETH salary (for pool check)
        euint64     salary;       // encrypted salary amount (all token types)
        euint64     totalPaid;    // encrypted running total
        uint256     lastPaidAt;
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

    constructor(address _employer, address _confUsdc, address _confUsdt) {
        require(_employer != address(0), "ConfidentialPayroll: zero employer");
        employer          = _employer;
        confUsdcAddress   = _confUsdc;
        confUsdtAddress   = _confUsdt;
    }

    // ─── Fund (ETH pool) ──────────────────────────────────────────────────────

    function fundPayroll() external payable onlyEmployer notClosed {
        require(msg.value > 0, "ConfidentialPayroll: zero deposit");
        emit PayrollFunded(msg.sender, msg.value);
    }

    // ─── Manage employees ─────────────────────────────────────────────────────

    /**
     * @notice Add an employee with a chosen salary token.
     * @param employee    Wallet address.
     * @param token       0=ETH, 1=cUSDC, 2=cUSDT
     * @param salaryWei   Plaintext amount — required only when token==ETH (for pool
     *                    balance check). Pass 0 for cUSDC/cUSDT.
     * @param encSalary   Salary encrypted client-side via the FHEVM SDK.
     * @param inputProof  ZK proof from the relayer.
     */
    function addEmployee(
        address         employee,
        SalaryToken     token,
        uint256         salaryWei,
        externalEuint64 encSalary,
        bytes calldata  inputProof
    ) external onlyEmployer notClosed {
        require(employee != address(0),            "ConfidentialPayroll: zero address");
        require(!_employees[employee].active,       "ConfidentialPayroll: already registered");
        require(token == SalaryToken.ETH ? salaryWei > 0 : true, "ConfidentialPayroll: zero salary");

        euint64 salary = FHE.fromExternal(encSalary, inputProof);

        _employees[employee] = Employee({
            active:      true,
            salaryToken: token,
            salaryWei:   salaryWei,
            salary:      salary,
            totalPaid:   FHE.asEuint64(0),
            lastPaidAt:  0
        });

        _allowAll(salary,                           employer, employee);
        _allowAll(_employees[employee].totalPaid,   employer, employee);
        if (token != SalaryToken.ETH) {
            FHE.allow(salary, _tokenAddr(token)); // allow cToken contract to use the handle
        }

        _employeeList.push(employee);
        emit EmployeeAdded(employee);
    }

    /**
     * @notice Update an employee's salary and/or token type.
     */
    function updateSalary(
        address         employee,
        SalaryToken     token,
        uint256         newSalaryWei,
        externalEuint64 encNewSalary,
        bytes calldata  inputProof
    ) external onlyEmployer notClosed {
        require(_employees[employee].active, "ConfidentialPayroll: not registered");
        require(token == SalaryToken.ETH ? newSalaryWei > 0 : true, "ConfidentialPayroll: zero salary");

        euint64 newSalary = FHE.fromExternal(encNewSalary, inputProof);

        _employees[employee].salaryToken = token;
        _employees[employee].salaryWei   = newSalaryWei;
        _employees[employee].salary      = newSalary;

        _allowAll(newSalary, employer, employee);
        if (token != SalaryToken.ETH) {
            FHE.allow(newSalary, _tokenAddr(token));
        }

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
     * @notice Pay one employee in their designated salary token.
     *
     * - ETH: transfers ETH from the contract pool to the employee.
     * - cUSDC/cUSDT: calls operatorTransfer on the wrapper contract, moving
     *   encrypted tokens from the employer's balance to the employee's balance.
     *   No plaintext amount appears anywhere in the transaction.
     *
     * @dev For token salaries the employer must have approved this contract as
     *      an operator on the relevant cToken contract before calling paySalary.
     */
    function paySalary(address employee) public onlyEmployer notClosed {
        Employee storage emp = _employees[employee];
        require(emp.active, "ConfidentialPayroll: not registered");

        if (emp.salaryToken == SalaryToken.ETH) {
            require(address(this).balance >= emp.salaryWei, "ConfidentialPayroll: insufficient pool");
            emp.totalPaid  = FHE.add(emp.totalPaid, emp.salary);
            emp.lastPaidAt = block.timestamp;
            FHE.allowThis(emp.totalPaid);
            FHE.allow(emp.totalPaid, employer);
            FHE.allow(emp.totalPaid, employee);
            (bool ok,) = payable(employee).call{value: emp.salaryWei}("");
            require(ok, "ConfidentialPayroll: ETH transfer failed");
            emit SalaryPaid(employee, emp.salaryWei, block.timestamp);
        } else {
            address tokenAddr = _tokenAddr(emp.salaryToken);
            // Grant the cToken contract access to the salary handle so it can
            // perform FHE.sub on the employer's encrypted balance.
            FHE.allow(emp.salary, tokenAddr);
            IConfidentialERC20(tokenAddr).operatorTransfer(employer, employee, emp.salary);
            emp.totalPaid  = FHE.add(emp.totalPaid, emp.salary);
            emp.lastPaidAt = block.timestamp;
            FHE.allowThis(emp.totalPaid);
            FHE.allow(emp.totalPaid, employer);
            FHE.allow(emp.totalPaid, employee);
            emit SalaryPaid(employee, 0, block.timestamp);
        }
    }

    function payAll() external onlyEmployer notClosed {
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
        returns (bool active, uint256 lastPaidAt, uint8 salaryToken)
    {
        Employee storage emp = _employees[employee];
        return (emp.active, emp.lastPaidAt, uint8(emp.salaryToken));
    }

    function getEmployeeList() external view returns (address[] memory) {
        return _employeeList;
    }

    // ─── Employer views ───────────────────────────────────────────────────────

    function getEmployeeSalary(address employee) external view onlyEmployer returns (euint64) {
        return _employees[employee].salary;
    }

    // ─── Employer: withdraw ETH surplus ──────────────────────────────────────

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

    function _tokenAddr(SalaryToken token) internal view returns (address) {
        return token == SalaryToken.cUSDC ? confUsdcAddress : confUsdtAddress;
    }

    function _allowAll(euint64 val, address a, address b) internal {
        FHE.allowThis(val);
        FHE.allow(val, a);
        FHE.allow(val, b);
    }

    receive() external payable {}
}
