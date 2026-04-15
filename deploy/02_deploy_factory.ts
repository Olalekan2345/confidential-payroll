import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const CONF_USDC = "0xD50988540B8808ccC9b102009B4282B433E1ff2D";
const CONF_USDT = "0x7B57AdDf2361f0C1D7BB6CC342572954c1a56888";

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
