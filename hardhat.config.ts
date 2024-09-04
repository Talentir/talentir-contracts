import { type HardhatUserConfig, vars } from "hardhat/config";
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
        "base-sepolia": {
            url: `https://base-sepolia.g.alchemy.com/v2/${vars.get("ALCHEMY_API_KEY")}}`,
            ledgerAccounts: ["0x6480B75A63995ba4748b44A6179fAEC2DcdCf378"]
        },
        base: {
            url: `https://base-mainnet.g.alchemy.com/v2/${vars.get("ALCHEMY_API_KEY")}}`,
            ledgerAccounts: ["0x6480B75A63995ba4748b44A6179fAEC2DcdCf378"]
        }
    },
    etherscan: {
        apiKey: {
            "base-sepolia": vars.get("BASESCAN_API_KEY"),
            base: vars.get("BASESCAN_API_KEY"),
        },
        customChains: [
            {
                network: "base-sepolia",
                chainId: 84532,
                urls: {
                    apiURL: "https://api-sepolia.basescan.org/api",
                    browserURL: "https://sepolia.basescan.org/"
                }
            },
            {
                network: "base",
                chainId: 8453,
                urls: {
                    apiURL: "https://api.basescan.org/api",
                    browserURL: "https://basescan.org/"
                }
            }
        ]
    }

};

export default config;
