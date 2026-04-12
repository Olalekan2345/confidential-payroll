import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();

  log("─────────────────────────────────────────────────");
  log(`Deploying ConfidentialPayroll on network: ${network.name}`);
  log(`Deployer address: ${deployer}`);

  // NOTE: With the factory pattern, ConfidentialPayroll is normally deployed
  // via ConfidentialPayrollFactory.create() which sets the employer correctly.
  // This direct deploy is only for testing — deployer becomes employer.
  const CONF_USDC = "0x38E95FcD94A48DB23B0Cc809478aA7fc35B9Fe76";
  const CONF_USDT = "0x98F9E847057c2918E234504c70d950B60E8a9416";

  const result = await deploy("ConfidentialPayroll", {
    from: deployer,
    args: [deployer, CONF_USDC, CONF_USDT],
    log: true,
    waitConfirmations: network.name === "hardhat" ? 0 : 2,
  });

  log(`ConfidentialPayroll deployed at: ${result.address}`);

  if (network.name === "sepolia" && process.env.ETHERSCAN_API_KEY && process.env.ETHERSCAN_API_KEY !== "your_etherscan_api_key_here") {
    log("Verifying on Etherscan...");
    try {
      await hre.run("verify:verify", {
        address: result.address,
        constructorArguments: [],
      });
      log("Verified.");
    } catch (e) {
      log(`Verification skipped: ${(e as Error).message}`);
    }
  }
};

func.tags = ["ConfidentialPayroll"];
export default func;
