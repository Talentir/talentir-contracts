import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";
import "@nomicfoundation/hardhat-ledger";
import "@nomicfoundation/hardhat-ignition-viem";

const config: HardhatUserConfig = {
    solidity: "0.8.24",
    ignition: {
        strategyConfig: {
            create2: {
                salt: "0xe32a11d7818cf11208414d61810850515b05acfae2e6dd8a440193de16013718"
            }
        }
    },
    networks: {
        baseTest: {
            url: "https://base-sepolia.g.alchemy.com/v2/",
            ledgerAccounts: ["0xC0e15aFE5DdDA700f45F05d5c94f19d82951BCFE"]
        }
    },
    etherscan: {
        apiKey: {
            baseTest: ""
        },
        customChains: [
            {
                network: "baseTest",
                chainId: 84532,
                urls: {
                    apiURL: "https://api-sepolia.basescan.org/api",
                    browserURL: "https://sepolia.basescan.org/"
                }
            }
        ]
    }

};

export default config;
