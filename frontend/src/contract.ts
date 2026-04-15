// ─── Factory ──────────────────────────────────────────────────────────────────
export const FACTORY_ADDRESS = "0xC860cb3eafaE1ebeB6E7A40EF7DE576f39681326";

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
  // token: 1=cUSDC, 2=cUSDT
  "function addEmployee(address employee, uint8 token, uint256 salaryWei, bytes32 encSalary, bytes calldata inputProof)",
  "function updateSalary(address employee, uint8 token, uint256 newSalaryWei, bytes32 encNewSalary, bytes calldata inputProof)",
  "function removeEmployee(address employee)",
  "function paySalary(address employee)",
  "function payAll()",
  "function getMySalary() view returns (bytes32)",
  "function getMyTotalPaid() view returns (bytes32)",
  "function getEmployeeList() view returns (address[])",
  "function getEmployeeInfo(address employee) view returns (bool active, uint256 lastPaidAt, uint8 salaryToken)",
  "function getEmployeeSalary(address employee) view returns (bytes32)",
  "event EmployeeAdded(address indexed employee)",
  "event EmployeeRemoved(address indexed employee)",
  "event SalaryUpdated(address indexed employee)",
  "event SalaryPaid(address indexed employee, uint256 amount, uint256 timestamp)",
  "event PayrollClosed(address indexed employer, uint256 refunded)",
] as const;

// ─── Tokens ───────────────────────────────────────────────────────────────────

export const MOCK_USDC_ADDRESS = "0x18d3cB901F4715f51C8E252b92fec7F430359066";
export const MOCK_USDT_ADDRESS = "0x0935D261D85478d7AaF62Bc6da902a219aA04E0E";
export const CONF_USDC_ADDRESS = "0xD50988540B8808ccC9b102009B4282B433E1ff2D";
export const CONF_USDT_ADDRESS = "0x7B57AdDf2361f0C1D7BB6CC342572954c1a56888";

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
  // Two-step async unwrap (Zama protocol pattern)
  "function requestUnwrap(address from, address to, bytes32 encAmount, bytes calldata inputProof) returns (bytes32 requestId)",
  "function finalizeUnwrap(bytes32 requestId, bytes32[] calldata handles, bytes calldata abiEncodedCleartexts, bytes calldata decryptionProof)",
  "function unwrapRequests(bytes32 requestId) view returns (address receiver, bytes32 encHandle, bool finalized)",
  "function transfer(address to, bytes32 encAmount, bytes calldata inputProof)",
  "function approveOperator(address operator, bool approved)",
  "function isOperatorApproved(address operator, address owner) view returns (bool)",
  "function operatorTransfer(address from, address to, bytes32 amount)",
  "function balanceOf(address account) view returns (bytes32)",
  "event Wrap(address indexed account, uint256 amount)",
  "event UnwrapRequested(address indexed receiver, bytes32 indexed requestId, bytes32 encHandle)",
  "event UnwrapFinalized(address indexed receiver, bytes32 indexed requestId, uint64 amount)",
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
