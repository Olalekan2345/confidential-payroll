import "dotenv/config";
import "@fhevm/hardhat-plugin";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";
import "@typechain/hardhat";
import "hardhat-deploy";
import "hardhat-gas-reporter";
import "solidity-coverage";

import { HardhatUserConfig } from "hardhat/config";

const MNEMONIC = process.env.MNEMONIC || "test test test test test test test test test test test junk";
const INFURA_API_KEY = process.env.INFURA_API_KEY || "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz";
// SEPOLIA_RPC_URL takes priority — set this to use Alchemy, QuickNode, or any other provider
const SEPOLIA_RPC_URL =
  process.env.SEPOLIA_RPC_URL || `https://sepolia.infura.io/v3/${INFURA_API_KEY}`;

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  namedAccounts: {
    deployer: 0,
    employer: 1,
    employee1: 2,
    employee2: 3,
    employee3: 4,
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    anvil: {
      chainId: 31337,
      url: "http://127.0.0.1:8545",
      accounts: {
        mnemonic: MNEMONIC,
        count: 10,
      },
    },
    sepolia: {
      chainId: 11155111,
      url: SEPOLIA_RPC_URL,
      accounts: {
        mnemonic: MNEMONIC,
        count: 10,
      },
    },
  },
  solidity: {
    version: "0.8.27",
    settings: {
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 800,
      },
      metadata: {
        bytecodeHash: "none",
      },
    },
  },
  paths: {
    artifacts: "./artifacts",
    cache: "./cache",
    sources: "./contracts",
    tests: "./test",
  },
  typechain: {
    outDir: "types",
    target: "ethers-v6",
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API_KEY || "",
    },
  },
};

export default config;
