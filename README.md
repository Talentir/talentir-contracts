# Talentir Smart Contracts

## 1. NFT Contract Spec
### Standard
The NFT Contract adheres to the following standards:

- [ERC-1155](https://eips.ethereum.org/EIPS/eip-1155)

  The Multi Token Standard is used to enable fractional NFT owning.
- [ERC-2981](https://eips.ethereum.org/EIPS/eip-2981)
  
  The royalty standard enables creators of NFTs to receive royalties on different marketplaces.
- [Ownable](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/access/Ownable.sol)
  
    The contract implements the `Ownable` protocol. This enables us to set royalties on OpenSea, while they don't support the ERC2981 royalty standard. [Source1](https://support.opensea.io/hc/en-us/articles/4403934341907-How-do-I-import-my-contract-automatically-
) [Source2](https://www.youtube.com/watch?v=LHZC9wX3r0I)

### Features
- The ID of a Token is its `keccak256` hash of the unique `content ID` provided during mint.

- Minting is allowed for a single address, settable by the `Owner`. The `Owner` can be set to a null address, to kill all admin functionality.

- A Token is minted as 1M fungible parts. This property cannot be changed.

- The Token Contract contains a set of approved marketplaces that can be changed by the `Owner`

- Royalty percentage can be set by owner.

- Contract can be paused by owner. This is useful for socially upgrading the contract.

Note: Long-term, all admin functionality should be handled by a DAO and all mint functionality should be handled by a contract that uses oracles for decentrally verifying ownership.

## 2. Marketplace Contract (Order Book)

### Notes
- Supports ERC1155 Tokens
- Can be used with multiple NFT contracts
- Native currency: ETH

## Development
This project contains the Talentir Smart Contracts written in Solidity and tested in Typescript using Hardhat.
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
### Talentir Deploy Process
- Deploy TalentirNFT
```shell
npx hardhat run scripts/deployTalentirNft.ts --network goerli
npx hardhat run scripts/deployTalentirNft.ts --network localhost
```

- Deploy TalentirMarketplace
```shell
npx hardhat run scripts/deployTalentirMarketplace.ts --network goerli
npx hardhat run scripts/deployTalentirMarketplace.ts --network localhost
```

- Interact
Edit `scripts/interact.ts` to make sure you are interacting with the correct deployment
```shell
npx hardhat run scripts/interact.ts --network goerli
npx hardhat run scripts/interact.ts --network localhost
```

### Performance optimizations

For faster runs of your tests and scripts, consider skipping ts-node's type checking by setting the environment variable `TS_NODE_TRANSPILE_ONLY` to `1` in hardhat's environment. For more details see [the documentation](https://hardhat.org/guides/typescript.html#performance-optimizations).
