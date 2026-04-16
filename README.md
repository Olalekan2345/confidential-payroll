# ZecurePay — Confidential Payroll on Zama FHEVM

> On-chain payroll with fully encrypted salaries, powered by [Zama FHEVM](https://zama.ai).

🔗 **Live demo:** [confidential-payroll-alpha.vercel.app](https://confidential-payroll-alpha.vercel.app)

---

## The Problem

Traditional on-chain payroll is incompatible with real-world employment: **every salary amount is permanently public** on a blockchain. No HR department, no employee, and no institution wants compensation data visible to competitors, colleagues, or data harvesters.

Existing "private payroll" solutions either move computation off-chain (trusted server, defeats the point) or use ZK proofs that only verify correctness without enabling computation on hidden values.

## The Solution

**ZecurePay** uses Fully Homomorphic Encryption (FHE) via the Zama Protocol to keep every salary amount encrypted at rest, in transit, and during computation — entirely on-chain.

| What is encrypted | Who can read it |
|---|---|
| Employee salary amount | Employer + that employee only |
| Total salary paid to date | Employer + that employee only |
| cUSDC / cUSDT balances | Token holder only |

No salary is ever visible in a transaction, in contract storage, or on a block explorer — to anyone without the correct decryption key.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Frontend  (React + Vite + @zama-fhe/relayer-sdk)       │
│  • Encrypts salary client-side before sending tx        │
│  • Re-encrypts handles for local wallet decryption      │
│  • Two-step async unwrap flow with publicDecrypt        │
└────────────────────┬────────────────────────────────────┘
                     │  encrypted inputs + ZK proofs
                     ▼
┌─────────────────────────────────────────────────────────┐
│  ConfidentialPayrollFactory.sol                         │
│  • One deploy per employer wallet                       │
│  • Creates ConfidentialPayroll instances                │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  ConfidentialPayroll.sol                                │
│  • euint64 salary handles (FHE ciphertexts)             │
│  • FHE.allow() per-address ACL                          │
│  • operatorTransfer() for confidential salary payment   │
└──────────┬──────────────────────────┬───────────────────┘
           │                          │
           ▼                          ▼
┌──────────────────┐      ┌──────────────────────────────┐
│  cUSDC wrapper   │      │  cUSDT wrapper               │
│  (conf. USDC)    │      │  (conf. USDT)                │
│                  │      │                              │
│  wrap / unwrap   │      │  wrap / unwrap               │
│  transfer (FHE)  │      │  transfer (FHE)              │
└──────────────────┘      └──────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Zama Coprocessor + KMS (Sepolia)                       │
│  • Executes FHE operations off-chain                    │
│  • Threshold decryption (9-of-13 MPC nodes)             │
│  • publicDecrypt for unwrap finalization                │
└─────────────────────────────────────────────────────────┘
```

---

## Features

### Employer
- **Deploy a private payroll** — one contract per employer, deployed via factory
- **Add employees** — encrypted salary set client-side, never plaintext on-chain
- **Pay one or pay all** — salary transfers are confidential cUSDC/cUSDT `operatorTransfer` calls
- **Update salary** — re-encrypt and replace salary without downtime
- **Remove employees** — deactivates without data loss; re-adding reuses slot
- **Decrypt salary** — employer can reveal any employee's salary locally via re-encryption
- **Share employee link** — one-click link pre-fills contract address for employees

### Employee
- **View own salary** — local re-encryption; amount never leaves device
- **View total paid** — running encrypted total, decryptable only by holder
- **Unwrap salary** — two-step async flow: `requestUnwrap` → `publicDecrypt` → `finalizeUnwrap`

### Token Flow (Swap tab)
- **Wrap USDC → cUSDC** / **Wrap USDT → cUSDT** — deposit plain tokens, receive FHE-encrypted balance
- **Unwrap cUSDC → USDC** / **Unwrap cUSDT → USDT** — two-step async with KMS decryption proof
- **Free mint** — employer can mint test USDC/USDT on Sepolia (development only)

---

## Contracts

All contracts deployed on **Sepolia testnet**.

| Contract | Address |
|---|---|
| `ConfidentialPayrollFactory` | `0x4a1D18579C988D577120189E9E4FB21d935D1E14` |
| `ConfidentialERC20Wrapper` (cUSDC) | `0xB02bA4ad008aA6627AAaF39d11f33c6011bF3F58` |
| `ConfidentialERC20Wrapper` (cUSDT) | `0x56796BD1d3F3C767a1EA59155468eE2129066C68` |
| `MockUSDC` | `0x71632025fF08b298b2741984280214D18d40e80d` |
| `MockUSDT` | `0xDb4596092450aF25b06E1A73FaAc3C22F249A54D` |

---

## Project Structure

```
zama/
├── contracts/
│   ├── ConfidentialPayroll.sol          # Core payroll logic (euint64 salaries, operatorTransfer)
│   ├── ConfidentialPayrollFactory.sol   # One-per-employer factory
│   ├── ConfidentialERC20Wrapper.sol     # Wrap/unwrap USDC/USDT ↔ cUSDC/cUSDT (two-step async)
│   ├── IConfidentialERC20.sol           # Interface for wrapper
│   └── MockERC20.sol                    # Test USDC/USDT with free mint
├── deploy/
│   ├── 01_deploy_confidential_payroll.ts  # Deploys template/implementation
│   ├── 02_deploy_factory.ts               # Deploys factory (reads token addresses from artifacts)
│   └── 03_deploy_tokens.ts                # Deploys MockUSDC/USDT + cUSDC/cUSDT wrappers
├── test/
│   └── ConfidentialPayroll.test.ts
├── frontend/
│   └── src/
│       ├── App.tsx          # Main UI — employer + employee views
│       ├── SwapTab.tsx      # Wrap / unwrap confidential tokens
│       ├── TxHistory.tsx    # On-chain event log
│       ├── useFhevm.ts      # MetaMask + FHEVM instance hook
│       └── contract.ts      # ABIs + deployed addresses
├── hardhat.config.ts
└── .env.example
```

---

## Key FHE Patterns

### 1. Encrypted salary input from client

The salary is encrypted in the browser before the transaction is sent. The contract never sees the plaintext.

```solidity
function addEmployee(
    address         employee,
    SalaryToken     token,
    uint256         salaryWei,       // 0 for cUSDC/cUSDT
    externalEuint64 encSalary,       // ciphertext from client
    bytes calldata  inputProof       // ZK proof from relayer
) external onlyEmployer {
    euint64 salary = FHE.fromExternal(encSalary, inputProof);
    _employees[employee].salary = salary;
    FHE.allow(salary, employer);
    FHE.allow(salary, employee);
    FHE.allow(salary, _tokenAddr(token)); // wrapper needs ACL to move it
}
```

### 2. Confidential salary payment via operator transfer

No plaintext amount appears anywhere in the payment transaction.

```solidity
function paySalary(address employee) public onlyEmployer {
    Employee storage emp = _employees[employee];
    address tokenAddr = _tokenAddr(emp.salaryToken);

    // Grant cToken contract access to the salary handle
    FHE.allow(emp.salary, tokenAddr);

    // Move encrypted tokens from employer → employee
    IConfidentialERC20(tokenAddr).operatorTransfer(employer, employee, emp.salary);

    emp.totalPaid  = FHE.add(emp.totalPaid, emp.salary);
    emp.lastPaidAt = block.timestamp;
}
```

### 3. Per-address ACL — only the right wallets can decrypt

```solidity
FHE.allowThis(salary);          // contract retains access for FHE ops
FHE.allow(salary, employer);    // employer can decrypt all salaries
FHE.allow(salary, employee);    // employee can decrypt only their own
```

### 4. Two-step async unwrap (ConfidentialERC20Wrapper)

Unwrapping requires the KMS to publicly decrypt an FHE result. The flow spans two transactions and an off-chain polling step.

```
Step 1 — requestUnwrap()
  • FHE.min(amount, balance)          caps amount to prevent underflow exploit
  • FHE.makePubliclyDecryptable()     marks capped amount for KMS decryption
  • emits UnwrapRequested(requestId, encHandle)

Step 2 — off-chain polling
  • instance.publicDecrypt([encHandle])
  • retries until KMS returns { abiEncodedClearValues, decryptionProof }

Step 3 — finalizeUnwrap()
  • FHE.checkSignatures(handles, cleartexts, proof)   verifies KMS signatures
  • underlying.transfer(receiver, clearAmount)        releases real tokens
```

### 5. Client-side re-encryption for wallet decryption

```typescript
const input = instance.createEncryptedInput(contractAddress, userAddress);
const zkProof = input.add64(salaryAmount).generateZKProof();
const { handles, inputProof } = await instance.requestZKProofVerification(zkProof);
```

---

## Local Development

### Prerequisites

- Node.js >= 20
- MetaMask with Sepolia ETH ([Alchemy faucet](https://sepoliafaucet.com))
- A wallet mnemonic and Alchemy/Infura RPC URL

### 1. Install dependencies

```bash
# Root (contracts + hardhat)
npm install

# Frontend
cd frontend && npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
MNEMONIC=your twelve word mnemonic phrase here
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
ETHERSCAN_API_KEY=YOUR_KEY   # optional, for verification
```

### 3. Deploy to Sepolia

```bash
npx hardhat deploy --network sepolia
```

The deploy scripts run in order:
1. `01` — deploys the `ConfidentialPayroll` template
2. `03` — deploys `MockUSDC`, `MockUSDT`, `cUSDC`, `cUSDT` wrappers
3. `02` — deploys the factory (reads cUSDC/cUSDT addresses from step 2 artifacts)

Copy the output addresses into `frontend/src/contract.ts`.

### 4. Run the frontend

```bash
cd frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in a MetaMask-enabled browser on Sepolia.

---

## How to Use

### As Employer

1. Connect MetaMask (Sepolia)
2. Click **Deploy New Payroll** — creates your private payroll contract
3. Go to **⇄ Swap** tab → mint test USDC → wrap to cUSDC/cUSDT
4. In **Token Approvals**, approve the payroll contract as operator for cUSDC and/or cUSDT
5. Add employees with an encrypted salary in cUSDC or cUSDT
6. Click **Pay** on any employee (or **Pay All**)
7. Share the employee link so employees can view their salary

### As Employee

1. Open the link shared by your employer (auto-fills contract address)
2. Connect MetaMask
3. View your encrypted salary — decrypted locally in your browser
4. Go to **⇄ Swap** tab to unwrap received cUSDC/cUSDT back to USDC/USDT

---

## Security Notes

- **No plaintext salary on-chain** — salaries are `euint64` FHE ciphertexts throughout their entire lifecycle
- **Underflow protection** — `requestUnwrap` uses `FHE.min(amount, balance)` so a user can never drain more than their actual balance
- **Operator pattern** — the payroll contract can only move tokens it has been explicitly approved for via `approveOperator`
- **ACL enforcement** — FHE handles are only usable by addresses explicitly granted access via `FHE.allow`
- **KMS proof verification** — `finalizeUnwrap` calls `FHE.checkSignatures` to verify the decryption proof before releasing any funds

---

## License

MIT
