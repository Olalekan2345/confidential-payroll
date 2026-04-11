// ─── Factory ──────────────────────────────────────────────────────────────────
// One global deployment. Anyone calls create() to deploy their own payroll.
// Replace FACTORY_ADDRESS with the deployed address after running:
//   npx hardhat deploy --tags ConfidentialPayrollFactory --network sepolia
export const FACTORY_ADDRESS = "0x33947157b0124E4A7a0eaB141fC377e2f593d0A7";

export const FACTORY_ABI = [
  "function create() returns (address)",
  "function userPayroll(address user) view returns (address)",
  "function totalPayrolls() view returns (uint256)",
  "event PayrollCreated(address indexed employer, address indexed payroll)",
] as const;

// ─── Per-employer Payroll ─────────────────────────────────────────────────────
// Deployed via factory — address is different per user.
export const PAYROLL_ABI = [
  // State
  "function employer() view returns (address)",

  // Employer actions
  "function fundPayroll() payable",
  "function addEmployee(address employee, uint256 salaryWei, bytes32 encSalary, bytes calldata inputProof)",
  "function updateSalary(address employee, uint256 newSalaryWei, bytes32 encNewSalary, bytes calldata inputProof)",
  "function removeEmployee(address employee)",
  "function paySalary(address employee)",
  "function payAll()",
  "function withdrawSurplus(uint256 amount)",

  // Employee reads
  "function getMySalary() view returns (bytes32)",
  "function getMyTotalPaid() view returns (bytes32)",

  // Shared reads
  "function getEmployeeList() view returns (address[])",
  "function getEmployeeInfo(address employee) view returns (bool active, uint256 lastPaidAt)",

  // Employer reads
  "function getEmployeeSalary(address employee) view returns (bytes32)",

  // Events
  "event EmployeeAdded(address indexed employee)",
  "event EmployeeRemoved(address indexed employee)",
  "event SalaryUpdated(address indexed employee)",
  "event PayrollFunded(address indexed funder, uint256 amount)",
  "event SalaryPaid(address indexed employee, uint256 amount, uint256 timestamp)",
  "event PayrollWithdrawn(address indexed employer, uint256 amount)",
] as const;
