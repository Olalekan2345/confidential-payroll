# ConfidentialPayroll

> On-chain payroll with fully encrypted salaries, built with [Zama FHEVM](https://zama.ai).  
> Submitted to the **Zama Developer Program Mainnet Season 2 — Builder Track**.

---

## The Problem

Traditional on-chain payroll is broken for real-world use: **every salary amount is public** on a blockchain. No institution, no HR department, and no employee wants their compensation visible to every competing employee, competitor, or data harvester in the world.

## The Solution

**ConfidentialPayroll** uses Fully Homomorphic Encryption (FHE) via the Zama Protocol to keep every salary amount encrypted — on-chain, in storage, and during computation.

| What's encrypted | Who can read it |
|-----------------|----------------|
| Employee salary | Employer + that employee only |
| Total paid | Employer + that employee only |
| Payroll pool balance | Employer only |
| "Sufficient funds" check | Nobody — computed on ciphertexts |

No salary is ever visible on-chain. Not to other employees, not to block explorers, not to anyone without the correct decryption key.

---

## Architecture

```
Frontend (React + fhevmjs)
  │  encrypts salary client-side before sending tx
  │  re-encrypts handles for local decryption (employee view)
  ▼
ConfidentialPayroll.sol  (Solidity 0.8.27, FHEVM)
  │  stores euint64 salary handles
  │  FHE.select() for fund-check without revealing amounts
  │  FHE.allow() for per-address ACL
  ▼
Zama Coprocessor + KMS
  │  executes FHE operations off-chain
  │  threshold decryption (9-of-13 MPC nodes)
  ▼
Sepolia Testnet
```

---

## Features

- **Encrypted salary storage** — salaries are `euint64` ciphertexts, never plaintext
- **Encrypted fund-sufficiency check** — `FHE.select` picks `salary` or `0` without leaking either
- **Per-employee ACL** — `FHE.allow(handle, employee)` lets only the right address decrypt
- **Employer audit access** — employer can decrypt all salaries for payroll accounting
- **Pay one / pay all** — single employee or entire roster in one tx
- **Salary update** — re-encrypt and replace salary without downtime
- **Employee self-service UI** — employees decrypt only their own salary, locally, via re-encryption

---

## Project Structure

```
zama/
├── contracts/
│   └── ConfidentialPayroll.sol      # Core contract
├── deploy/
│   └── 01_deploy_confidential_payroll.ts
├── test/
│   └── ConfidentialPayroll.test.ts  # Hardhat tests (mock FHE)
├── frontend/
│   ├── src/
│   │   ├── App.tsx                  # Main UI
│   │   ├── useFhevm.ts              # FHEVM + wallet hook
│   │   ├── contract.ts              # ABI + address
│   │   └── index.css
│   └── package.json
├── hardhat.config.ts
├── package.json
└── .env.example
```

---

## Quick Start

### Prerequisites

- Node.js >= 20
- MetaMask with Sepolia ETH (get some from a faucet)
- An Infura API key

### 1. Install dependencies

```bash
# Root (contracts + tests)
npm install

# Frontend
cd frontend && npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — add your MNEMONIC and INFURA_API_KEY
```

### 3. Run tests (local mock FHE)

```bash
npm test
```

### 4. Deploy to Sepolia

```bash
npm run deploy:sepolia
```

Copy the deployed address and paste it into `frontend/src/contract.ts`:

```ts
export const CONTRACT_ADDRESS = "0xYourDeployedAddress";
```

### 5. Run the frontend

```bash
cd frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in MetaMask-enabled browser.

---

## Key FHE Patterns Used

### Encrypted input from user

```solidity
function addEmployee(
    address employee,
    externalEuint64 encSalary,   // ciphertext from client
    bytes calldata inputProof    // ZK proof from coprocessor
) external onlyEmployer {
    euint64 salary = FHE.fromExternal(encSalary, inputProof);
    // ...
}
```

### Fund-sufficiency check without revealing amounts

```solidity
ebool hasFunds = FHE.ge(_payrollBalance, emp.salary);
euint64 payment = FHE.select(hasFunds, emp.salary, FHE.asEuint64(0));
```

### Access control so only the right address can decrypt

```solidity
FHE.allow(salary, employer);   // employer can decrypt
FHE.allow(salary, employee);   // employee can decrypt their own
FHE.allowThis(salary);         // contract retains access for future ops
```

### Client-side re-encryption for employee view

```ts
const { publicKey, privateKey } = instance.generateKeypair();
const eip712 = instance.createEIP712(publicKey, CONTRACT_ADDRESS);
const signature = await signer.signTypedData(...eip712);
const decrypted = await instance.reencrypt(handle, privateKey, publicKey, signature, ...);
```

---

## License

MIT
