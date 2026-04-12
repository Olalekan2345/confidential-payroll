// ─── Factory ──────────────────────────────────────────────────────────────────
export const FACTORY_ADDRESS = "0x616F1e291E77F518D7E6f0706c3473FF18ACF3bB";

export const FACTORY_ABI = [
  "function create() returns (address)",
  "function userPayroll(address user) view returns (address)",
  "function totalPayrolls() view returns (uint256)",
  "event PayrollCreated(address indexed employer, address indexed payroll)",
] as const;

// ─── Per-employer Payroll ─────────────────────────────────────────────────────
// SalaryToken enum: 0=ETH, 1=cUSDC, 2=cUSDT
export const PAYROLL_ABI = [
  "function employer() view returns (address)",
  "function closed() view returns (bool)",
  "function confUsdcAddress() view returns (address)",
  "function confUsdtAddress() view returns (address)",
  "function fundPayroll() payable",
  "function closePayroll()",
  // token: 0=ETH, 1=cUSDC, 2=cUSDT
  "function addEmployee(address employee, uint8 token, uint256 salaryWei, bytes32 encSalary, bytes calldata inputProof)",
  "function updateSalary(address employee, uint8 token, uint256 newSalaryWei, bytes32 encNewSalary, bytes calldata inputProof)",
  "function removeEmployee(address employee)",
  "function paySalary(address employee)",
  "function payAll()",
  "function withdrawSurplus(uint256 amount)",
  "function getMySalary() view returns (bytes32)",
  "function getMyTotalPaid() view returns (bytes32)",
  "function getEmployeeList() view returns (address[])",
  "function getEmployeeInfo(address employee) view returns (bool active, uint256 lastPaidAt, uint8 salaryToken)",
  "function getEmployeeSalary(address employee) view returns (bytes32)",
  "event EmployeeAdded(address indexed employee)",
  "event EmployeeRemoved(address indexed employee)",
  "event SalaryUpdated(address indexed employee)",
  "event PayrollFunded(address indexed funder, uint256 amount)",
  "event SalaryPaid(address indexed employee, uint256 amount, uint256 timestamp)",
  "event PayrollWithdrawn(address indexed employer, uint256 amount)",
  "event PayrollClosed(address indexed employer, uint256 refunded)",
] as const;

// ─── Tokens ───────────────────────────────────────────────────────────────────

export const MOCK_USDC_ADDRESS = "0xaF56671C880550241bDB5EAE1A3Fa8C4035E3e06";
export const MOCK_USDT_ADDRESS = "0x1777F3f0a806Dfb9eda860dF4C2267Fd45F6D69b";
export const CONF_USDC_ADDRESS = "0x38E95FcD94A48DB23B0Cc809478aA7fc35B9Fe76";
export const CONF_USDT_ADDRESS = "0x98F9E847057c2918E234504c70d950B60E8a9416";

export const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function mint(address to, uint256 amount)",
] as const;

export const CONF_ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function underlying() view returns (address)",
  "function wrap(uint64 amount)",
  "function unwrap(uint64 amount)",
  "function transfer(address to, bytes32 encAmount, bytes calldata inputProof)",
  "function approveOperator(address operator, bool approved)",
  "function isOperatorApproved(address operator, address owner) view returns (bool)",
  "function operatorTransfer(address from, address to, bytes32 amount)",
  "function balanceOf(address account) view returns (bytes32)",
  "event Wrap(address indexed account, uint256 amount)",
  "event Unwrap(address indexed account, uint256 amount)",
  "event Transfer(address indexed from, address indexed to)",
] as const;

// ─── Token registry ───────────────────────────────────────────────────────────

export type TokenInfo = {
  symbol:      string;
  name:        string;
  address:     string;
  confAddress: string;
  confSymbol:  string;
  decimals:    number;
  color:       string;
  tokenIndex:  number; // matches SalaryToken enum: 1=cUSDC, 2=cUSDT
};

export const SUPPORTED_TOKENS: TokenInfo[] = [
  {
    symbol:      "USDC",
    name:        "USD Coin",
    address:     MOCK_USDC_ADDRESS,
    confAddress: CONF_USDC_ADDRESS,
    confSymbol:  "cUSDC",
    decimals:    6,
    color:       "#2775ca",
    tokenIndex:  1,
  },
  {
    symbol:      "USDT",
    name:        "Tether USD",
    address:     MOCK_USDT_ADDRESS,
    confAddress: CONF_USDT_ADDRESS,
    confSymbol:  "cUSDT",
    decimals:    6,
    color:       "#26a17b",
    tokenIndex:  2,
  },
];

// Token index 0 = ETH (no entry in SUPPORTED_TOKENS)
export const SALARY_TOKEN_LABEL: Record<number, string> = {
  0: "ETH",
  1: "cUSDC",
  2: "cUSDT",
};
