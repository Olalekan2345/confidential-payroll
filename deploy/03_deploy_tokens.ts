import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();

  log("─────────────────────────────────────────────────");
  log(`Deploying tokens on network: ${network.name}`);

  // ── Mock USDC (6 decimals) ──────────────────────────────────────────────────
  const usdc = await deploy("MockUSDC", {
    contract: "MockERC20",
    from: deployer,
    args: ["Mock USD Coin", "USDC", 6],
    log: true,
    waitConfirmations: network.name === "hardhat" ? 0 : 2,
  });
  log(`MockUSDC deployed at: ${usdc.address}`);

  // ── Mock USDT (6 decimals) ──────────────────────────────────────────────────
  const usdt = await deploy("MockUSDT", {
    contract: "MockERC20",
    from: deployer,
    args: ["Mock Tether USD", "USDT", 6],
    log: true,
    waitConfirmations: network.name === "hardhat" ? 0 : 2,
  });
  log(`MockUSDT deployed at: ${usdt.address}`);

  // ── cUSDC — Confidential USDC wrapper ──────────────────────────────────────
  const cUsdc = await deploy("ConfidentialUSDC", {
    contract: "ConfidentialERC20Wrapper",
    from: deployer,
    args: [usdc.address, "Confidential USD Coin", "cUSDC", 6],
    log: true,
    waitConfirmations: network.name === "hardhat" ? 0 : 2,
  });
  log(`ConfidentialUSDC (cUSDC) deployed at: ${cUsdc.address}`);

  // ── cUSDT — Confidential USDT wrapper ──────────────────────────────────────
  const cUsdt = await deploy("ConfidentialUSDT", {
    contract: "ConfidentialERC20Wrapper",
    from: deployer,
    args: [usdt.address, "Confidential Tether USD", "cUSDT", 6],
    log: true,
    waitConfirmations: network.name === "hardhat" ? 0 : 2,
  });
  log(`ConfidentialUSDT (cUSDT) deployed at: ${cUsdt.address}`);

  log("─────────────────────────────────────────────────");
  log("Update frontend/src/contract.ts with these addresses:");
  log(`  MOCK_USDC:  ${usdc.address}`);
  log(`  MOCK_USDT:  ${usdt.address}`);
  log(`  CONF_USDC:  ${cUsdc.address}`);
  log(`  CONF_USDT:  ${cUsdt.address}`);

  // Mint some test tokens to the deployer for initial testing
  if (network.name !== "hardhat") {
    const MockERC20 = await ethers.getContractAt("MockERC20", usdc.address);
    const MockERC20_usdt = await ethers.getContractAt("MockERC20", usdt.address);
    const mintAmount = ethers.parseUnits("10000", 6); // 10,000 USDC/USDT
    await (await MockERC20.mint(deployer, mintAmount)).wait();
    await (await MockERC20_usdt.mint(deployer, mintAmount)).wait();
    log(`Minted 10,000 USDC and 10,000 USDT to deployer: ${deployer}`);
  }
};

func.tags = ["Tokens"];
export default func;
