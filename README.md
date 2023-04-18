# Talentir Smart Contracts

## 1. Talentir Token Contract

### Standards

The Talentir Token Contract adheres to the following standards:

- [ERC-1155](https://eips.ethereum.org/EIPS/eip-1155): This Multi-Token Standard enables fractional NFT ownership.
- [ERC-2981](https://eips.ethereum.org/EIPS/eip-2981): The royalty standard enables NFT creators to receive royalties on different marketplaces.
- [Ownable](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/access/Ownable.sol): The contract implements the `Ownable` protocol, which allows us to collect royalties for the artists.
- [Operator Filter Registry](https://github.com/ProjectOpenSea/operator-filter-registry): Currently, some marketplaces don't respect royalties. An independent committee ([Creator Ownership Research Institute](https://corinstitute.co/)) identifies such marketplaces and adds them to a list that we block. We can always turn off the blocking if it's abused.

### Features

- The Token ID is its `keccak256` hash of the unique `content ID` provided during minting.
- Minting is allowed for a single address, which is settable by the `Owner`. This address is pre-approved to transfer freshly minted tokens on behalf of the initial owner so the minter role can post an initial sale on behalf of the owner.
- The `Owner` can be set to a null address to kill all admin functionality.
- A Token is minted as 1 million fungible parts, and this property cannot be changed.
- The Token Contract contains the address of an approved marketplace that can be changed by the `Owner`. This address is pre-approved to transfer freshly minted tokens on behalf of the initial owner, so the owner can directly post their first sale.
- The owner can set the royalty percentage.
- The owner can pause the contract. This is useful for socially upgrading the contract.
- The contract adds global and per-token pre-sale functionality. The minter address can add addresses to these lists and end the presale. Once the presale is over, it can't be re-enabled.

Note: In the long term, all admin functionality should be handled by a DAO, and all mint functionality should be handled by a contract that uses oracles for decentrally verifying ownership.

## 2. Talentir Marketplace Contract (Order Book)

### Standards

- The Talentir Marketplace Contract supports trading of tokens of one ERC1155 contract.
- The contract respects the ERC2981 Royalty Standard.

### Features

- The contract allows adding limit orders to an order book, and each token in the corresponding ERC1155 can be traded vs ETH.
- It uses the native currency of the EVM as the currency for buying and selling.
- The marketplace fee can be set by the owner, but it can never be more than 10%.

## Development

This project contains the Talentir Smart Contracts written in Solidity and tested in TypeScript using Hardhat. Please refer to the `package.json` file for commands to run.

### Getting Started
```shell
npm install
npm run test
```

### Talentir Deploy Process

```shell
npm run deploy
```
