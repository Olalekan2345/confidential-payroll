import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy, log, get } = deployments;
  const { deployer } = await getNamedAccounts();

  // Read cUSDC / cUSDT addresses from the token deployment (03_deploy_tokens.ts)
  const cUsdcDeployment = await get("ConfidentialUSDC");
  const cUsdtDeployment = await get("ConfidentialUSDT");
  const CONF_USDC = cUsdcDeployment.address;
  const CONF_USDT = cUsdtDeployment.address;

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
func.dependencies = ["ConfidentialPayroll", "Tokens"];
export default func;
