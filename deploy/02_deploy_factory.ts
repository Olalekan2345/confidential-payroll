import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();

  log("─────────────────────────────────────────────────");
  log(`Deploying ConfidentialPayrollFactory on network: ${network.name}`);
  log(`Deployer address: ${deployer}`);

  const result = await deploy("ConfidentialPayrollFactory", {
    from: deployer,
    args: [],
    log: true,
    waitConfirmations: network.name === "hardhat" ? 0 : 2,
  });

  log(`ConfidentialPayrollFactory deployed at: ${result.address}`);
  log(`Update FACTORY_ADDRESS in frontend/src/contract.ts with this address.`);

  if (
    network.name === "sepolia" &&
    process.env.ETHERSCAN_API_KEY &&
    process.env.ETHERSCAN_API_KEY !== "your_etherscan_api_key_here"
  ) {
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

func.tags = ["ConfidentialPayrollFactory"];
func.dependencies = ["ConfidentialPayroll"]; // ensure ConfidentialPayroll artifact exists first
export default func;
