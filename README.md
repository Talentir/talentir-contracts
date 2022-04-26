# Talentir Smart Contracts - Using Hardhat

This project contains the Talentir Smart Contracts written in Solidity and tested in Typescript.
Here are some commands to get started.

```shell
npx hardhat accounts
npx hardhat compile
npx hardhat clean
npx hardhat test
npx hardhat node
npx hardhat help
TS_NODE_FILES=true npx ts-node scripts/deploy.ts
```
# Talentir Deploy Process
- Deploy TalentirNFT
```shell
npx hardhat run scripts/deployTalentirNft.ts --network rinkeby
npx hardhat run scripts/deployTalentirNft.ts --network localhost
```

- Deploy TalentirMarketplace
```shell
npx hardhat run scripts/deployTalentirMarketplace.ts --network rinkeby
npx hardhat run scripts/deployTalentirMarketplace.ts --network localhost
```

- Interact
Edit `scripts/interact.ts` to make sure you are interacting with the correct deployment
```shell
npx hardhat run scripts/interact.ts --network rinkeby
npx hardhat run scripts/interact.ts --network localhost
```


# Etherscan verification

To try out Etherscan verification, you first need to deploy a contract to an Ethereum network that's supported by Etherscan, such as Ropsten.

In this project, copy the .env.example file to a file named .env, and then edit it to fill in the details. Enter your Etherscan API key, your Ropsten node URL (eg from Alchemy), and the private key of the account which will send the deployment transaction. With a valid .env file in place, first deploy your contract:

```shell
hardhat run --network ropsten scripts/sample-script.ts
```

Then, copy the deployment address and paste it in to replace `DEPLOYED_CONTRACT_ADDRESS` in this command:

```shell
npx hardhat verify --network ropsten DEPLOYED_CONTRACT_ADDRESS "Hello, Hardhat!"
```

# Performance optimizations

For faster runs of your tests and scripts, consider skipping ts-node's type checking by setting the environment variable `TS_NODE_TRANSPILE_ONLY` to `1` in hardhat's environment. For more details see [the documentation](https://hardhat.org/guides/typescript.html#performance-optimizations).



