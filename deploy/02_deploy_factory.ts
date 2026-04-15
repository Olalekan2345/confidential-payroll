import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const CONF_USDC = "0xC4D1f2Dc5929D79c20AC4A2bfc6dae5403f5B102";
const CONF_USDT = "0x5eEaf21b6b4c7EE21970c7C8ffB428C5f7c70c56";

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
