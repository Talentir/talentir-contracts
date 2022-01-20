import * as dotenv from "dotenv";

import { HardhatUserConfig, task } from "hardhat/config";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";
import { artifacts } from "hardhat";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// task("typechain-deploy", "Exports all typechain definitions", async (taskArgs, hre) => {
//   const typechain = hre.config.typechain;
//   const cwd = process.cwd();

//   const { runTypeChain } = await import ("TypeChain");
  
//   const deploymentsPath = hre.config.paths.root + "/deployments";
//   fs.readdirSync(deploymentsPath).forEach(network => {
//     let fullPath = path.join(deploymentsPath, network);
//     fs.readdirSync(fullPath).forEach(index => {
//       let deploymentPath = path.join(fullPath, index);
//       const contractsPath = path.join(deploymentPath, "contracts");
//       fs.readdirSync(contractsPath).forEach(contract => {
//         let contractPath = path.join(contractsPath, contract);
//         const jsons = fs.readdirSync(contractPath);
//         console.log(jsons);
//         // runTypeChain(    {
//         //   cwd: cwd, 
//         //   target: "ethers-v5",
//         //   filesToProcess: [path.join(contractPath, contract.name)],
//         //   outDir: "abcd",
//         //   allFiles: [],
//         // });
//       })
      
//     })

//   })


  
//   // npx typechain --target=ethers-v5 artifacts/contracts/Talentir.sol/Talentir.json --out-dir typetest
// });

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.4",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    rinkeby: {
      url: process.env.RINKEBY_URL ?? "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    arbitrumTestnet: {
      url: process.env.ARBITRUM_RINKEBY_URL ?? "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    }
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "EUR",
  },
  typechain: {
    outDir: "./artifacts/typechain"
  },
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY,
      rinkeby: process.env.ETHERSCAN_API_KEY,
      arbitrumOne: process.env.ARBISCAN_API_KEY,
      arbitrumTestnet: process.env.ARBISCAN_API_KEY
    }
  },
};

export default config;
