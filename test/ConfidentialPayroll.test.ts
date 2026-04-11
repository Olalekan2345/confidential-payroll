import { FhevmType } from "@fhevm/hardhat-plugin";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { BytesLike } from "ethers";
import * as hre from "hardhat";

import { ConfidentialPayroll } from "../types";

// Monthly salaries — 6-decimal USDC style
const SALARY_1 = 3000_000000n; // $3,000
const SALARY_2 = 5000_000000n; // $5,000
const FUND_AMOUNT = hre.ethers.parseEther("0.1");

async function deployFixture(employer: HardhatEthersSigner): Promise<ConfidentialPayroll> {
  const factory = await hre.ethers.getContractFactory("ConfidentialPayroll", employer);
  const contract = (await factory.deploy()) as unknown as ConfidentialPayroll;
  await contract.waitForDeployment();
  await hre.fhevm.assertCoprocessorInitialized(contract, "ConfidentialPayroll");
  return contract;
}

async function encryptSalary(
  contractAddress: string,
  signerAddress: string,
  salary: bigint,
): Promise<{ handle: BytesLike; inputProof: BytesLike }> {
  const input = hre.fhevm.createEncryptedInput(contractAddress, signerAddress);
  input.add64(salary);
  const encrypted = await input.encrypt();
  return { handle: encrypted.handles[0], inputProof: encrypted.inputProof };
}

// ─────────────────────────────────────────────────────────────────────────────

describe("ConfidentialPayroll", function () {
  let payroll: ConfidentialPayroll;
  let payrollAddress: string;
  let employer: HardhatEthersSigner;
  let employee1: HardhatEthersSigner;
  let employee2: HardhatEthersSigner;
  let stranger: HardhatEthersSigner;

  before(async function () {
    [employer, employee1, employee2, stranger] = await hre.ethers.getSigners();
    payroll = await deployFixture(employer);
    payrollAddress = await payroll.getAddress();
  });

  // ─── Deployment ─────────────────────────────────────────────────────────────

  describe("deployment", () => {
    it("sets the deployer as employer", async () => {
      expect(await payroll.employer()).to.equal(employer.address);
    });
  });

  // ─── Funding ────────────────────────────────────────────────────────────────

  describe("fundPayroll", () => {
    it("accepts ETH and emits PayrollFunded", async () => {
      await expect(
        payroll.connect(employer).fundPayroll({ value: FUND_AMOUNT }),
      )
        .to.emit(payroll, "PayrollFunded")
        .withArgs(employer.address, FUND_AMOUNT);
    });

    it("reverts if a non-employer calls fundPayroll", async () => {
      await expect(
        payroll.connect(stranger).fundPayroll({ value: FUND_AMOUNT }),
      ).to.be.revertedWith("ConfidentialPayroll: caller is not the employer");
    });

    it("reverts on zero ETH deposit", async () => {
      await expect(
        payroll.connect(employer).fundPayroll({ value: 0n }),
      ).to.be.revertedWith("ConfidentialPayroll: zero deposit");
    });
  });

  // ─── Employee management ─────────────────────────────────────────────────────

  describe("addEmployee", () => {
    it("registers an employee and emits EmployeeAdded", async () => {
      const { handle, inputProof } = await encryptSalary(payrollAddress, employer.address, SALARY_1);

      await expect(
        payroll.connect(employer).addEmployee(employee1.address, handle, inputProof),
      )
        .to.emit(payroll, "EmployeeAdded")
        .withArgs(employee1.address);

      const [active, lastPaidAt] = await payroll.getEmployeeInfo(employee1.address);
      expect(active).to.be.true;
      expect(lastPaidAt).to.equal(0n);
    });

    it("reverts when non-employer adds an employee", async () => {
      const { handle, inputProof } = await encryptSalary(payrollAddress, stranger.address, SALARY_1);
      await expect(
        payroll.connect(stranger).addEmployee(employee2.address, handle, inputProof),
      ).to.be.revertedWith("ConfidentialPayroll: caller is not the employer");
    });

    it("reverts on zero address", async () => {
      const { handle, inputProof } = await encryptSalary(payrollAddress, employer.address, SALARY_1);
      await expect(
        payroll.connect(employer).addEmployee(hre.ethers.ZeroAddress, handle, inputProof),
      ).to.be.revertedWith("ConfidentialPayroll: zero address");
    });

    it("reverts on duplicate registration", async () => {
      // employee1 was already added above
      const { handle, inputProof } = await encryptSalary(payrollAddress, employer.address, SALARY_1);
      await expect(
        payroll.connect(employer).addEmployee(employee1.address, handle, inputProof),
      ).to.be.revertedWith("ConfidentialPayroll: already registered");
    });
  });

  describe("updateSalary", () => {
    it("updates salary and emits SalaryUpdated", async () => {
      const { handle, inputProof } = await encryptSalary(payrollAddress, employer.address, SALARY_2);
      await expect(
        payroll.connect(employer).updateSalary(employee1.address, handle, inputProof),
      )
        .to.emit(payroll, "SalaryUpdated")
        .withArgs(employee1.address);
    });
  });

  describe("removeEmployee", () => {
    it("deactivates an employee and emits EmployeeRemoved", async () => {
      // Add employee2 first
      const { handle, inputProof } = await encryptSalary(payrollAddress, employer.address, SALARY_2);
      await payroll.connect(employer).addEmployee(employee2.address, handle, inputProof);

      await expect(payroll.connect(employer).removeEmployee(employee2.address))
        .to.emit(payroll, "EmployeeRemoved")
        .withArgs(employee2.address);

      const [active] = await payroll.getEmployeeInfo(employee2.address);
      expect(active).to.be.false;
    });
  });

  // ─── Salary payment ──────────────────────────────────────────────────────────

  describe("paySalary", () => {
    it("emits SalaryPaid and updates lastPaidAt", async () => {
      const tx = await payroll.connect(employer).paySalary(employee1.address);
      const receipt = await tx.wait();
      const block = await hre.ethers.provider.getBlock(receipt!.blockNumber);

      await expect(tx)
        .to.emit(payroll, "SalaryPaid")
        .withArgs(employee1.address, block!.timestamp);

      const [, lastPaidAt] = await payroll.getEmployeeInfo(employee1.address);
      expect(lastPaidAt).to.be.gt(0n);
    });

    it("reverts when paying an inactive employee", async () => {
      // employee2 was removed above
      await expect(
        payroll.connect(employer).paySalary(employee2.address),
      ).to.be.revertedWith("ConfidentialPayroll: not registered");
    });
  });

  // ─── Encrypted salary reads ───────────────────────────────────────────────────

  describe("encrypted salary reads", () => {
    it("employee can read their own salary handle", async () => {
      const handle = await payroll.connect(employee1).getMySalary();
      expect(handle).to.not.equal(0n);
    });

    it("employer can read any employee salary handle", async () => {
      const handle = await payroll.connect(employer).getEmployeeSalary(employee1.address);
      expect(handle).to.not.equal(0n);
    });

    it("employee can decrypt their own salary", async () => {
      const handle = await payroll.connect(employee1).getMySalary();
      const decrypted = await hre.fhevm.userDecryptEuint(
        FhevmType.euint64,
        handle,
        payrollAddress,
        employee1,
      );
      // salary was updated to SALARY_2 in updateSalary test
      expect(decrypted).to.equal(SALARY_2);
    });

    it("stranger cannot call getMySalary (not registered)", async () => {
      await expect(
        payroll.connect(stranger).getMySalary(),
      ).to.be.revertedWith("ConfidentialPayroll: not registered");
    });

    it("stranger cannot call getEmployeeSalary (not employer)", async () => {
      await expect(
        payroll.connect(stranger).getEmployeeSalary(employee1.address),
      ).to.be.revertedWith("ConfidentialPayroll: caller is not the employer");
    });
  });

  // ─── Employee list ────────────────────────────────────────────────────────────

  describe("getEmployeeList", () => {
    it("returns all registered employee addresses", async () => {
      const list = await payroll.getEmployeeList();
      expect(list).to.include(employee1.address);
      expect(list).to.include(employee2.address);
    });
  });
});
