# Talentir Smart Contracts

## 1. Talentir Token Contract Spec
### Standard
The Token Contract adheres to the following standards:

- [ERC-1155](https://eips.ethereum.org/EIPS/eip-1155)

  The Multi Token Standard is used to enable fractional NFT owning.
- [ERC-2981](https://eips.ethereum.org/EIPS/eip-2981)
  
  The royalty standard enables creators of NFTs to receive royalties on different marketplaces.
- [Ownable](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/access/Ownable.sol)
  
  The contract implements the `Ownable` protocol. This enables us to collect royalties for the artists

- [Operator Filter Registry](https://github.com/ProjectOpenSea/operator-filter-registry)

  Currently some marketplaces don't respect royalties. An independent committee ([Creator Ownership Research Institute](https://corinstitute.co/)) identifies marketplaces that don't enforce royalties and adds them to a list that we block. We can always turn the blocking off if it's abused.

### Features
- The ID of a Token is its `keccak256` hash of the unique `content ID` provided during mint.

- Minting is allowed for a single address, settable by the `Owner`. The `Owner` can be set to a null address, to kill all admin functionality.

- A Token is minted as 1M fungible parts. This property cannot be changed.

- The Token Contract contains a set of approved marketplaces that can be changed by the `Owner`

- Royalty percentage can be set by owner.

- Contract can be paused by owner. This is useful for socially upgrading the contract.

- Contract adds a global and per-token pre-sale functionality. The minter address can add addresses to these lists and end the presale. Once the presale is over, it can't be reenabled.

Note: Long-term, all admin functionality should be handled by a DAO and all mint functionality should be handled by a contract that uses oracles for decentrally verifying ownership.

## 2. Talentir Marketplace Contract (Order Book)

### Notes
- Supports ERC1155 Tokens
- Can only be used with a single ERC1155 contract
- Supports ERC2981 royalties
- Native currency: ETH

## Development
This project contains the Talentir Smart Contracts written in Solidity and tested in Typescript using Hardhat.
See package.json for commands to run.

### Talentir Deploy Process
```shell
npm run deploy
```