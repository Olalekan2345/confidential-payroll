export const CONTRACT_ADDRESS = "0x69524c0a6eB59558F5A85ff9b87D9532B5B9EeB0";

export const ABI = [
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
