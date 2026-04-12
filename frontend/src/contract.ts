// ─── Factory ──────────────────────────────────────────────────────────────────
// One global deployment. Anyone calls create() to deploy their own payroll.
export const FACTORY_ADDRESS = "0xF37Bb26297dd2B6B21eCb33dD3C7C7878D2eD7f0";

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
  "function closed() view returns (bool)",

  // Employer actions
  "function fundPayroll() payable",
  "function closePayroll()",
  // No plaintext salary — salary is encrypted-only
  "function addEmployee(address employee, bytes32 encSalary, bytes calldata inputProof)",
  "function updateSalary(address employee, bytes32 encNewSalary, bytes calldata inputProof)",
  "function removeEmployee(address employee)",
  "function paySalary(address employee)",
  "function payAll()",
  "function withdrawSurplus(uint256 amount)",

  // Employee reads
  "function getMySalary() view returns (bytes32)",
  "function getMyPendingBalance() view returns (bytes32)",
  "function getMyTotalPaid() view returns (bytes32)",

  // Employee action — claim accumulated ETH salary
  "function claimSalary(uint64 amountWei)",

  // Shared reads
  "function getEmployeeList() view returns (address[])",
  "function getEmployeeInfo(address employee) view returns (bool active, uint256 lastPaidAt)",

  // Employer reads
  "function getEmployeeSalary(address employee) view returns (bytes32)",
  "function getEmployeePendingBalance(address employee) view returns (bytes32)",

  // Events
  "event EmployeeAdded(address indexed employee)",
  "event EmployeeRemoved(address indexed employee)",
  "event SalaryUpdated(address indexed employee)",
  "event PayrollFunded(address indexed funder, uint256 amount)",
  // SalaryPaid has NO amount — confidential payment
  "event SalaryPaid(address indexed employee, uint256 timestamp)",
  "event SalaryClaimed(address indexed employee, uint256 amount)",
  "event PayrollWithdrawn(address indexed employer, uint256 amount)",
  "event PayrollClosed(address indexed employer, uint256 refunded)",
] as const;
