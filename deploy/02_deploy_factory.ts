import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const CONF_USDC = "0x38E95FcD94A48DB23B0Cc809478aA7fc35B9Fe76";
const CONF_USDT = "0x98F9E847057c2918E234504c70d950B60E8a9416";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();

  log("─────────────────────────────────────────────────");
  log(`Deploying ConfidentialPayrollFactory on network: ${network.name}`);
  log(`Deployer address: ${deployer}`);
  log(`cUSDC: ${CONF_USDC}`);
  log(`cUSDT: ${CONF_USDT}`);

  const result = await deploy("ConfidentialPayrollFactory", {
    from: deployer,
    args: [CONF_USDC, CONF_USDT],
    log: true,
    waitConfirmations: network.name === "hardhat" ? 0 : 2,
  });

  log(`ConfidentialPayrollFactory deployed at: ${result.address}`);
  log(`Update FACTORY_ADDRESS in frontend/src/contract.ts with this address.`);
};

func.tags = ["ConfidentialPayrollFactory"];
func.dependencies = ["ConfidentialPayroll"];
export default func;
