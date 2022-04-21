import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { BigNumber } from 'ethers'
import { ethers } from 'hardhat'

// eslint-disable-next-line
import { TalentirMarketplace, TalentirNFT, IERC721__factory } from "../typechain-types";

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

    // Talentir NFT
    const TalentirNFT = await ethers.getContractFactory('TalentirNFT')
    talentirNFT = await TalentirNFT.deploy()
    await talentirNFT.deployed()

    // Create Marketplace
    const TalentirMarketplace = await ethers.getContractFactory('TalentirMarketplace')
    talentirMarketplace = await TalentirMarketplace.deploy()
    await talentirMarketplace.deployed()

    // They should approve each other
    await talentirMarketplace.setNftContractApproval(talentirNFT.address, true)
    await talentirNFT.setNftMarketplaceApproval(talentirMarketplace.address, true)

    // Mint 3 NFTs
    nftContentIds = ['LukisNFT', 'DavesNFT', 'JohnnysNFT']
    nftTokenIds = await Promise.all(nftContentIds.map(async (value) => {
      return await talentirNFT.contentIdToTokenId(value)
    }))

    await talentirNFT.mint(luki.address, '', nftContentIds[0], johnny.address)
    await talentirNFT.mint(dave.address, '', nftContentIds[1], luki.address)
    await talentirNFT.mint(johnny.address, '', nftContentIds[2], luki.address)
  })

  it('Admin functions: Test functionality', async function () {
    const owner = await talentirMarketplace.owner()
    const adminAddress = await admin.getAddress()
    expect(owner).to.equal(adminAddress)

    await talentirMarketplace.setMarketPlaceFee(50)
    expect(await talentirMarketplace.marketplaceFeePerMill()).to.equal(50)
  })

  it('Admin functions: Can only be called by Owner', async function () {
    await expect(
      talentirMarketplace.connect(johnny).setNftContractApproval(luki.address, true)
    ).to.be.reverted

    await expect(
      talentirMarketplace.connect(johnny).setMarketPlaceFee(50)
    ).to.be.reverted

    await expect(
      talentirMarketplace.connect(johnny).withdrawFees(johnny.address)
    ).to.be.reverted
  })

  it('Contract paused / NFT Contract not approved.', async function () {
    async function testToRevert (revertMessage: string): Promise<void> {
      await expect(
        talentirMarketplace.connect(johnny).makeSellOffer(talentirNFT.address, nftTokenIds[0], 1)
      ).to.be.revertedWith(revertMessage)

      await expect(
        talentirMarketplace.connect(johnny).purchase(talentirNFT.address, nftTokenIds[0])
      ).to.be.revertedWith(revertMessage)

      await expect(
        talentirMarketplace.connect(johnny).makeBuyOffer(talentirNFT.address, nftTokenIds[0])
      ).to.be.revertedWith(revertMessage)

      await expect(
        talentirMarketplace.connect(johnny).acceptBuyOffer(talentirNFT.address, nftTokenIds[0])
      ).to.be.revertedWith(revertMessage)
    }

    await talentirMarketplace.setPause(true)
    await testToRevert('Pausable: paused')

    await talentirMarketplace.setPause(false)
    await talentirMarketplace.setNftContractApproval(talentirNFT.address, false)
    await testToRevert('NFT Contract not approved')
  })

  it('Marketplace not approved', async function () {
    await talentirNFT.setNftMarketplaceApproval(talentirMarketplace.address, false)

    await expect(
      talentirMarketplace.connect(luki).makeSellOffer(talentirNFT.address, nftTokenIds[0], 5)
    )
      .to.be.revertedWith('Marketplace not approved')

    await expect(
      talentirMarketplace.connect(johnny).makeBuyOffer(talentirNFT.address, nftTokenIds[0], { value: 1000 })
    )
      .to.be.revertedWith('Marketplace not approved')
  })

  it('Sell Offer: Create And Withdraw', async function () {
    // Owner can't make a Sell Offer
    await expect(
      talentirMarketplace.connect(admin).makeSellOffer(talentirNFT.address, nftTokenIds[0], 5)
    ).to.be.reverted

    // Royalty receiver can't make Sell Offer
    await expect(
      talentirMarketplace.connect(johnny).makeSellOffer(talentirNFT.address, nftTokenIds[0], 5)
    ).to.be.reverted

    // Owner can make a Sell Offer
    await expect(
      talentirMarketplace.connect(luki).makeSellOffer(talentirNFT.address, nftTokenIds[0], 5)
    )
      .to.emit(talentirMarketplace, 'NewSellOffer')
      .withArgs(talentirNFT.address, nftTokenIds[0], luki.address, 5)

    // Check if Sell Offer exists
    const offer = await talentirMarketplace.activeSellOffers(talentirNFT.address, nftTokenIds[0])
    expect(offer.seller).to.equal(luki.address)

    // Owner can't withdraw Sell Offer
    await expect(
      talentirMarketplace.withdrawSellOffer(talentirNFT.address, nftTokenIds[0])
    ).to.be.reverted

    // Seller can withdraw Sell Offer
    await expect(talentirMarketplace.connect(luki).withdrawSellOffer(talentirNFT.address, nftTokenIds[0]))
      .to.emit(talentirMarketplace, 'SellOfferWithdrawn')
      .withArgs(talentirNFT.address, nftTokenIds[0], luki.address)
  })

  it('Sell Offer: Purchase', async function () {
    // Create a Sell Offer
    await talentirMarketplace.connect(luki).makeSellOffer(talentirNFT.address, nftTokenIds[0], 1000)

    // The owner of the token can't purchase
    await expect(
      talentirMarketplace.connect(luki).purchase(talentirNFT.address, nftTokenIds[0], { value: 1000 })
    )
      .to.be.revertedWith('Token owner not allowed')

    // Can't purchase if there's no Sell Offer
    await expect(
      talentirMarketplace.connect(johnny).purchase(talentirNFT.address, nftTokenIds[1], { value: 1000 })
    )
      .to.be.revertedWith('No active sell offer')

    // Amount needs to be at least the requested amount
    await expect(
      talentirMarketplace.connect(dave).purchase(talentirNFT.address, nftTokenIds[0], { value: 999 })
    )
      .to.be.revertedWith('Amount sent too low')

    await expect(
      talentirMarketplace.connect(dave).purchase(talentirNFT.address, nftTokenIds[0], { value: 1000 })
    )
      .to.emit(talentirMarketplace, 'Sale')
      .withArgs(talentirNFT.address, nftTokenIds[0], luki.address, dave.address, 1000)
      .to.emit(talentirMarketplace, 'RoyaltiesPaid')
      .withArgs(talentirNFT.address, nftTokenIds[0], 100, johnny.address)

    expect(await talentirNFT.ownerOf(nftTokenIds[0])).to.equal(dave.address)
  })

  it('Sell Offer: Change owner after posting', async function () {
    await talentirMarketplace.connect(luki).makeSellOffer(talentirNFT.address, nftTokenIds[0], 2000)

    // Test: owner changes after posting SellOffer
    await talentirNFT.connect(luki).transferFrom(luki.address, johnny.address, nftTokenIds[0])

    await expect(
      talentirMarketplace.connect(dave).purchase(talentirNFT.address, nftTokenIds[0], { value: 2000 })
    )
      .to.be.revertedWith('ERC721: transfer from incorrect owner')

    // TODO: call and test cleanup function
  })

  it('Sell Offer: Check Balances, Withdrawal', async function () {
    await talentirMarketplace.connect(luki).makeSellOffer(talentirNFT.address, nftTokenIds[0], 1000)

    // Sales Price is 1000. Buyer should pay 1000 but pays more: 2000 (100%)
    // RoyaltyReceiver gets 200 (10%)
    // Market gets 50 (2,5%)
    // and Seller gets 1750 (87,5%)
    await expect(async () =>
      await talentirMarketplace.connect(dave).purchase(talentirNFT.address, nftTokenIds[0], { value: 2000 })
    )
      .to.changeEtherBalances([dave, luki, talentirMarketplace, johnny], [-2000, 1750, 50, 200])

    expect(await talentirMarketplace.getFeeBalance()).to.equal(50)

    await expect(async () => await talentirMarketplace.withdrawFees(luki.address))
      .to.changeEtherBalance(luki, 50)
  })

  it('Sell Offer: Edge Case Zero Price', async function () {
    await expect(
      talentirMarketplace.connect(luki).makeSellOffer(talentirNFT.address, nftTokenIds[0], 0)
    )
      .to.be.revertedWith('Price is zero')
  })

  it('Buy Offer: Create and Withdraw', async function () {
    // The owner can't make a buy offer to themselves
    await expect(
      talentirMarketplace.connect(luki).makeBuyOffer(talentirNFT.address, nftTokenIds[0], { value: 1000 })
    ).to.be.revertedWith('Token owner not allowed')

    // Create a Sell Offer
    await talentirMarketplace.connect(luki).makeSellOffer(talentirNFT.address, nftTokenIds[0], 1000)

    // Doesn't make much sense to buy at a higher price. Buyer can just purchase.
    await expect(
      talentirMarketplace.connect(dave).makeBuyOffer(talentirNFT.address, nftTokenIds[0], { value: 2000 })
    )
      .to.be.revertedWith('Sell order at this price or lower exists')

    await expect(
      talentirMarketplace.connect(dave).makeBuyOffer(talentirNFT.address, nftTokenIds[0], { value: 1000 })
    )
      .to.be.revertedWith('Sell order at this price or lower exists')

    // Buy offer should be now possible at 500
    await expect(async () =>
      await talentirMarketplace.connect(dave).makeBuyOffer(talentirNFT.address, nftTokenIds[0], { value: 500 })
    )
      .to.changeEtherBalances([dave, talentirMarketplace], [-500, 500])

    // There should be 500 in Escrow
    expect(await talentirMarketplace.totalAmountInEscrow()).to.equal(500)

    // But no fees to withdraw
    expect(await talentirMarketplace.getFeeBalance()).to.equal(0)

    // Buy Offer with same or lower price should fail.
    await expect(
      talentirMarketplace.connect(johnny).makeBuyOffer(talentirNFT.address, nftTokenIds[0], { value: 500 })
    )
      .to.be.revertedWith('Price too low')

    await expect(
      talentirMarketplace.connect(johnny).makeBuyOffer(talentirNFT.address, nftTokenIds[0], { value: 499 })
    )
      .to.be.revertedWith('Price too low')

    // New BuyOffer that's lower than SellOffer and higher than previous BuyOffer will work.
    // 500 should be refunded to Dave
    await expect(async () =>
      await talentirMarketplace.connect(johnny).makeBuyOffer(talentirNFT.address, nftTokenIds[0], { value: 600 })
    )
      .to.changeEtherBalances([johnny, dave, talentirMarketplace], [-600, 500, 100])

    // Total amount in escrow should be 600
    expect(await talentirMarketplace.totalAmountInEscrow()).to.equal(600)

    // Still no fees to withdraw
    expect(await talentirMarketplace.getFeeBalance()).to.equal(0)

    // Original Buy Offer by Dave was already refunded, can't be withdrawn.
    await expect(
      talentirMarketplace.connect(dave).withdrawBuyOffer(talentirNFT.address, nftTokenIds[0])
    )
      .to.be.revertedWith('Not buyer')

    // Current Buy Offer is by Johnny. Let him withdraw.
    await expect(async () =>
      await talentirMarketplace.connect(johnny).withdrawBuyOffer(talentirNFT.address, nftTokenIds[0])
    )
      .to.changeEtherBalances([johnny, talentirMarketplace], [600, -600])

    // Escrow should be empty again
    expect(await talentirMarketplace.totalAmountInEscrow()).to.equal(0)

    // Still no fees to withdraw
    expect(await talentirMarketplace.getFeeBalance()).to.equal(0)
  })

  it('Buy Offer: Create and Accept', async function () {
    // Also create a Sell Offer to check it's deleted
    await talentirMarketplace.connect(luki).makeSellOffer(talentirNFT.address, nftTokenIds[0], 2000)

    // Create Buy Offer
    await talentirMarketplace.connect(dave).makeBuyOffer(talentirNFT.address, nftTokenIds[0], { value: 1000 })

    // Can't accept for non-existing BuyOffer
    await expect(
      talentirMarketplace.connect(dave).acceptBuyOffer(talentirNFT.address, nftTokenIds[1])
    )
      .to.be.revertedWith('No buy offer')

    // Only Token Owner can accept Buy Offer
    await expect(
      talentirMarketplace.connect(dave).acceptBuyOffer(talentirNFT.address, nftTokenIds[0])
    )
      .to.be.revertedWith('Not token owner')

    // Buy Price is 1000 (100%)
    // RoyaltyReceiver gets 100 (10%)
    // Market gets 25 (2,5%)
    // and Seller gets 875 (87,5%)
    await expect(async () =>
      await talentirMarketplace.connect(luki).acceptBuyOffer(talentirNFT.address, nftTokenIds[0])
    )
      .to.changeEtherBalances([talentirMarketplace, luki, johnny], [-975, 875, 100])

    // Make sure SellOffer is deleted as well
    expect((await talentirMarketplace.activeSellOffers(talentirNFT.address, nftTokenIds[0])).seller)
      .to.equal(ethers.constants.AddressZero)
  })

  it('Buy Offer: Edge Case Zero Price', async function () {
    // // Create Buy Offer
    await expect(
      talentirMarketplace.connect(dave).makeBuyOffer(talentirNFT.address, nftTokenIds[0], { value: 200 })
    )
      .not.to.be.reverted

    await expect(
      talentirMarketplace.connect(johnny).makeBuyOffer(talentirNFT.address, nftTokenIds[1], { value: 0 })
    )
      .to.be.revertedWith('Price too low')
  })

  // TODO: test to check Buy Offer refund if Sell offer is purchased
})

describe('TalentirMarketplace + Mock', function () {

})
