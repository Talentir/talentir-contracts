import * as dotenv from 'dotenv'

import { HardhatUserConfig, task } from 'hardhat/config'
import '@nomiclabs/hardhat-etherscan'
import '@nomiclabs/hardhat-waffle'
import '@typechain/hardhat'
import 'hardhat-gas-reporter'
import 'solidity-coverage'

require('hardhat-contract-sizer')

dotenv.config()

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task('accounts', 'Prints the list of accounts', async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners()

  for (const account of accounts) {
    console.log(account.address)
  }
})

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.17',
    settings: {
      viaIR: false,
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    goerli: {
      url: process.env.GOERLI_URL ?? '',
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : []
    },
    arbitrumOne: {
      url: process.env.ARBITRUM_URL ?? '',
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : []
    },
    arbitrumGoerli: {
      url: process.env.ARBITRUM_GOERLI_URL ?? '',
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : []
    }
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: 'EUR',
    coinmarketcap: '2dfd2e2c-7816-4596-8a6d-c6faa14697ea',
    token: 'ETH'
  },
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY ?? '',
      goerli: process.env.ETHERSCAN_API_KEY ?? '',
      arbitrumOne: process.env.ARBISCAN_API_KEY ?? '',
      arbitrumGoerli: process.env.ARBISCAN_API_KEY ?? ''
    }
  }
}

export default config
