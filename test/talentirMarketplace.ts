import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { BigNumber } from 'ethers'
import { ethers } from 'hardhat'

// eslint-disable-next-line
import { TalentirMarketplace, TalentirNFT } from "../typechain-types";

describe('TalentirMarketplace', function () {
  let admin: SignerWithAddress
  let johnny: SignerWithAddress
  let luki: SignerWithAddress
  let dave: SignerWithAddress
  let talentirMarketplace: TalentirMarketplace
  let talentirNFT: TalentirNFT
  let nftContentIds: string[]
  let nftTokenIds: BigNumber[]

  beforeEach(async function () {
    [admin, johnny, luki, dave] = await ethers.getSigners()

    const TalentirNFT = await ethers.getContractFactory('TalentirNFT')
    talentirNFT = await TalentirNFT.deploy()
    await talentirNFT.deployed()

    const TalentirMarketplace = await ethers.getContractFactory('TalentirMarketplace')
    talentirMarketplace = await TalentirMarketplace.deploy(talentirNFT.address)
    await talentirMarketplace.deployed()

    await talentirNFT.setMarketplaceAddress(talentirMarketplace.address)

    nftContentIds = ['nft0', 'nft1', 'nft2']
    nftTokenIds = await Promise.all(nftContentIds.map(async (value) => {
      return await talentirNFT.contentIdToTokenId(value)
    }))

    await talentirNFT.mint(luki.address, nftContentIds[0], johnny.address)
    await talentirNFT.mint(dave.address, nftContentIds[1], luki.address)
    await talentirNFT.mint(johnny.address, nftContentIds[2], luki.address)
  })

  it('Check owner is admin', async function () {
    const owner = await talentirMarketplace.owner()
    const adminAddress = await admin.getAddress()
    expect(owner).to.equal(adminAddress)
  })

  it('Make Sell Offer And Withdraw', async function () {
    // Owner can't make a Sell Offer
    await expect(talentirMarketplace.connect(admin).makeSellOffer(nftTokenIds[0], 5)).to.be.reverted

    // Royalty receiver can't make Sell Offer
    await expect(talentirMarketplace.connect(johnny).makeSellOffer(nftTokenIds[0], 5)).to.be.reverted

    // Owner can make a Sell Offer
    await expect(talentirMarketplace.connect(luki).makeSellOffer(nftTokenIds[0], 5))
      .to.emit(talentirMarketplace, 'NewSellOffer')
      .withArgs(nftTokenIds[0], luki.address, 5)

    // Check if Sell Offer exists
    const offer = await talentirMarketplace.activeSellOffers(nftTokenIds[0])
    expect(offer.seller).to.equal(luki.address)

    // Owner can't withdraw Sell Offer
    await expect(talentirMarketplace.withdrawSellOffer(nftTokenIds[0])).to.be.reverted

    await expect(talentirMarketplace.connect(luki).withdrawSellOffer(nftTokenIds[0]))
      .to.emit(talentirMarketplace, 'SellOfferWithdrawn')
      .withArgs(nftTokenIds[0], luki.address)
  })

  it('Make Sell Offer And Purchase', async function () {
    await talentirMarketplace.connect(luki).makeSellOffer(nftTokenIds[0], 100)

    const overrides = {
      value: 100
    }

    await expect(talentirMarketplace.connect(dave).purchase(nftTokenIds[0], overrides))
      .to.emit(talentirMarketplace, 'Sale')
      .withArgs(nftTokenIds[0], luki.address, dave.address, 100)
      .to.emit(talentirMarketplace, 'RoyaltiesPaid')
      .withArgs(nftTokenIds[0], 10, johnny.address)

    expect(await talentirNFT.ownerOf(nftTokenIds[0])).to.equal(dave.address)
  })
})
