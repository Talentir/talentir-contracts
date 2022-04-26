import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { BigNumber } from 'ethers'
import { ethers } from 'hardhat'
import { smock } from '@defi-wonderland/smock'

// eslint-disable-next-line
import { TalentirMarketplace, TalentirNFT, IERC721 } from "../typechain-types";

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
      .to.be.revertedWith('BuyOffer higher')
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

  it('Buy Offer: Refunded when Sell Offer is happening', async function () {
    await talentirMarketplace.connect(dave).makeBuyOffer(talentirNFT.address, nftTokenIds[0], { value: 500 })

    await expect(
      talentirMarketplace.connect(luki).makeSellOffer(talentirNFT.address, nftTokenIds[0], 400)
    )
      .to.be.revertedWith('BuyOffer higher')

    await expect(
      talentirMarketplace.connect(luki).makeSellOffer(talentirNFT.address, nftTokenIds[0], 600)
    )
      .to.not.be.reverted

    const account = (await ethers.getSigners())[4]
    await expect(async () =>
      await talentirMarketplace.connect(account).purchase(talentirNFT.address, nftTokenIds[0], { value: 600 })
    )
      .to.changeEtherBalances([account, dave, talentirMarketplace, johnny], [-600, 500, -485, 60])

    expect(await talentirMarketplace.getFeeBalance()).to.equal(15)
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

  it('Royalties Zero', async function () {
    await talentirMarketplace.connect(luki).makeSellOffer(talentirNFT.address, nftTokenIds[0], 1000)
    await talentirNFT.setRoyalty(0)

    await expect(async () =>
      await talentirMarketplace.connect(dave).purchase(talentirNFT.address, nftTokenIds[0], { value: 1000 })
    )
      .to.changeEtherBalance(luki, 975)
  })

  it('NFT Contract without Royalties, Fake Contract', async function () {
    const ierc721fake = await smock.fake<IERC721>('IERC721')
    await talentirMarketplace.setNftContractApproval(ierc721fake.address, true)

    ierc721fake.supportsInterface.returns(false)
    ierc721fake.ownerOf.returns(luki.address)
    ierc721fake.getApproved.returns(talentirMarketplace.address)

    await expect(
      talentirMarketplace.connect(luki).makeSellOffer(ierc721fake.address, nftTokenIds[0], 1000)
    )
      .not.to.be.reverted

    await expect(async () =>
      await talentirMarketplace.connect(dave).purchase(ierc721fake.address, nftTokenIds[0], { value: 1000 })
    )
      .to.changeEtherBalance(luki, 975)
  })

  it('Delete orphant Sell Offers', async function () {
    // Create a Sell Offer
    await talentirMarketplace.connect(luki).makeSellOffer(talentirNFT.address, nftTokenIds[0], 1000)

    // Transfer to new owner
    await talentirNFT.connect(luki).transferFrom(luki.address, dave.address, nftTokenIds[0])

    // Sell offer still exists
    const sellOffer = await talentirMarketplace.activeSellOffers(talentirNFT.address, nftTokenIds[0])
    expect(sellOffer.seller).to.not.equal(ethers.constants.AddressZero)

    // Clean up
    await talentirMarketplace.cleanupSelloffers(talentirNFT.address, [nftTokenIds[0], nftTokenIds[1]])

    // Now Sell offer is gone
    const sellOfferNew = await talentirMarketplace.activeSellOffers(talentirNFT.address, nftTokenIds[0])
    expect(sellOfferNew.seller).to.equal(ethers.constants.AddressZero)

    // Make another Sell Offer that should not be deleted
    await talentirMarketplace.connect(dave).makeSellOffer(talentirNFT.address, nftTokenIds[1], 1000)

    await talentirMarketplace.cleanupSelloffers(talentirNFT.address, [nftTokenIds[1]])

    const sellOfferDave = await talentirMarketplace.activeSellOffers(talentirNFT.address, nftTokenIds[1])
    expect(sellOfferDave.seller).to.be.equal(dave.address)
  })

  it('Test when Buyer refuses refund.', async function () {
    const refundBlockedContractFactory = await ethers.getContractFactory('RefundBlockedTest')
    const refundBlockedContract = await refundBlockedContractFactory.deploy()

    // Fund contract with 1 ETH
    await expect(
      johnny.sendTransaction({ to: refundBlockedContract.address, value: ethers.utils.parseEther('1.0') })
    ).to.not.be.reverted

    // Now prevent contract from receving funds
    await refundBlockedContract.enableBlock()

    // Check that contract cannot receive fundes
    await expect(
      johnny.sendTransaction({ to: refundBlockedContract.address, value: 5 })
    ).to.be.reverted

    // Let contract make a buy offer
    await expect(async () =>
      await refundBlockedContract.makeBuyOffer(talentirMarketplace.address, talentirNFT.address, nftTokenIds[0], 500)
    )
      .to.changeEtherBalances([refundBlockedContract, talentirMarketplace], [-500, 500])

    // Withdrawal is not possible, when refund ist rejected
    await expect(
      refundBlockedContract.withdrawBuyOffer(talentirMarketplace.address, talentirNFT.address, nftTokenIds[0])
    )
      .to.be.revertedWith('Refund rejected')

    // But higher BuyOffers from other accounts are always allowed, even when refund is rejected.
    await expect(async () =>
      await talentirMarketplace.connect(dave).makeBuyOffer(talentirNFT.address, nftTokenIds[0], { value: 600 })
    )
      .to.changeEtherBalances([dave, refundBlockedContract, talentirMarketplace], [-600, 0, 600])

    // Funds can still be recovered as part of the fees from Talentir
    expect(await talentirMarketplace.getFeeBalance()).to.equal(500)
  })
})