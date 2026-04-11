import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();

  log("─────────────────────────────────────────────────");
  log(`Deploying ConfidentialPayroll on network: ${network.name}`);
  log(`Deployer address: ${deployer}`);

  const result = await deploy("ConfidentialPayroll", {
    from: deployer,
    args: [],
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
