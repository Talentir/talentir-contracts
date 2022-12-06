import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { ethers } from 'hardhat'
// eslint-disable-next-line
import { TalentirTokenV0, TalentirMarketplaceV0 } from "../typechain-types";

describe('Marketplace Tests', function () {
  let talentirNFT: TalentirTokenV0
  let marketplace: TalentirMarketplaceV0
  let owner: SignerWithAddress
  let buyer: SignerWithAddress
  let seller: SignerWithAddress
  let royaltyReceiver: SignerWithAddress
  let talentirFeeReceiver: SignerWithAddress
  const BUY = 0
  const SELL = 1
  const oneEther = ethers.utils.parseEther('1.0')

  beforeEach(async function () {
    [owner, buyer, seller, royaltyReceiver, talentirFeeReceiver] =
      await ethers.getSigners()
    const TalentirNFTFactory = await ethers.getContractFactory('TalentirTokenV0')
    talentirNFT = await TalentirNFTFactory.deploy()
    await talentirNFT.deployed()
    const MarketplaceFactory = await ethers.getContractFactory(
      'TalentirMarketplaceV0'
    )
    marketplace = await MarketplaceFactory.deploy(talentirNFT.address, 1)
    await marketplace.deployed()
    // Can't mint token before minter role is set
    expect(
      talentirNFT.mint(seller.address, 'abc', 'abc', royaltyReceiver.address)
    ).to.be.revertedWith('Not allowed')
    // Set minter role to owner
    await talentirNFT.setMinterRole(owner.address)
  })

  it('should open and close a single order (no fees, no rounding)', async function () {
    // Non-token owner can't place sell order
    expect(
      marketplace.connect(seller).makeSellOrder(1, 1, 1, true)
    ).to.be.revertedWith('ERC1155: caller is not token owner nor approved')
    // Mint token to seller
    await talentirNFT.mint(
      seller.address,
      'abcd',
      'abc',
      royaltyReceiver.address
    )
    const tokenId = await talentirNFT.contentIdToTokenId('abc')
    expect(await talentirNFT.balanceOf(seller.address, tokenId)).to.equal(
      1000000
    )
    // Still can't make sell order because of missing allowance
    expect(
      marketplace.connect(seller).makeSellOrder(1, 1, 1, true)
    ).to.be.revertedWith('ERC1155: caller is not token owner nor approved')
    // Grant allowance and make sell order, add to orderbook
    expect(
      talentirNFT.setNftMarketplaceApproval(marketplace.address, true)
    ).to.emit(talentirNFT, 'MarketplaceApproved')
    expect(
      await marketplace
        .connect(seller)
        .makeSellOrder(tokenId, oneEther, 1, true)
    ).to.emit(marketplace, 'OrderAdded')
    let orderID = await marketplace.getBestOrder(tokenId, SELL)
    let order = await marketplace.orders(orderID[0])
    expect(orderID[0]).to.equal(1)
    expect(orderID[1]).to.equal(oneEther)
    expect(order.tokenId).to.equal(tokenId)
    expect(order.side).to.equal(SELL)
    expect(order.sender).to.equal(seller.address)
    expect(order.price).to.equal(oneEther)
    expect(order.quantity).to.equal(1)
    // Balances are updated
    expect(await talentirNFT.balanceOf(seller.address, tokenId)).to.equal(
      999999
    )
    expect(await talentirNFT.balanceOf(marketplace.address, tokenId)).to.equal(
      1
    )
    // Buyer makes a buy order with too low price, not added to order book -> nothing happens
    expect(
      await marketplace
        .connect(buyer)
        .makeBuyOrder(tokenId, 1, false, { value: 1000 })
    ).to.changeEtherBalances(
      [buyer.address, marketplace.address],
      [-oneEther, oneEther]
    )
    orderID = await marketplace.getBestOrder(tokenId, BUY)
    order = await marketplace.orders(orderID[0])
    expect(orderID[0]).to.equal(0)
    expect(orderID[1]).to.equal(0)
    expect(order.side).to.equal(0)
    expect(order.price).to.equal(0)
    expect(order.quantity).to.equal(0)
    // Buyer makes a buy order with too low price, added to order book
    expect(
      await marketplace
        .connect(buyer)
        .makeBuyOrder(tokenId, 1, true, { value: 1000 })
    ).to.changeEtherBalances(
      [buyer.address, marketplace.address],
      [-1000, 1000]
    )
    orderID = await marketplace.getBestOrder(tokenId, BUY)
    order = await marketplace.orders(orderID[0])
    expect(orderID[0]).to.equal(2)
    expect(orderID[1]).to.equal(1000)
    expect(order.tokenId).to.equal(tokenId)
    expect(order.side).to.equal(BUY)
    expect(order.sender).to.equal(buyer.address)
    expect(order.price).to.equal(1000)
    expect(order.quantity).to.equal(1)
    // Buyer makes a buy order with higher price than asked, executes, removes executed order and refunds the excess Ether
    expect(
      await marketplace
        .connect(buyer)
        .makeBuyOrder(tokenId, 1, false, { value: oneEther.mul(2) })
    )
      .to.emit(marketplace, 'OrderExecuted')
      .to.changeEtherBalances(
        [marketplace.address, seller.address],
        [-oneEther, oneEther]
      )
    orderID = await marketplace.getBestOrder(tokenId, SELL)
    order = await marketplace.orders(orderID[0])
    expect(orderID[0]).to.equal(0)
    expect(orderID[1]).to.equal(0)
    expect(order.side).to.equal(0)
    expect(order.price).to.equal(0)
    expect(order.quantity).to.equal(0)
    // Balances are updated
    expect(await talentirNFT.balanceOf(seller.address, tokenId)).to.equal(
      999999
    )
    expect(await talentirNFT.balanceOf(buyer.address, tokenId)).to.equal(1)
    expect(await talentirNFT.balanceOf(marketplace.address, tokenId)).to.equal(
      0
    )
    // Second buy order is still open on the order book
    orderID = await marketplace.getBestOrder(tokenId, BUY)
    order = await marketplace.orders(orderID[0])
    expect(orderID[0]).to.equal(2)
    expect(orderID[1]).to.equal(1000)
    expect(order.tokenId).to.equal(tokenId)
    expect(order.side).to.equal(BUY)
    expect(order.sender).to.equal(buyer.address)
    expect(order.price).to.equal(1000)
    expect(order.quantity).to.equal(1)
    // Create a sell order that fills the buy order
    expect(
      await marketplace.connect(seller).makeSellOrder(tokenId, 1000, 1, false)
    )
      .to.emit(marketplace, 'OrderExecuted')
      .to.changeEtherBalances(
        [marketplace.address, seller.address],
        [-1000, 1000]
      )
    // Order is removed
    orderID = await marketplace.getBestOrder(tokenId, BUY)
    order = await marketplace.orders(orderID[0])
    expect(orderID[0]).to.equal(0)
    expect(orderID[1]).to.equal(0)
    expect(order.side).to.equal(0)
    expect(order.price).to.equal(0)
    expect(order.quantity).to.equal(0)
    // Balances are updated
    expect(await talentirNFT.balanceOf(seller.address, tokenId)).to.equal(
      999998
    )
    expect(await talentirNFT.balanceOf(buyer.address, tokenId)).to.equal(2)
  })

  it('should distribute fees correctly', async function () {
    // Grant marketplace approval
    expect(
      talentirNFT.setNftMarketplaceApproval(marketplace.address, true)
    ).to.emit(talentirNFT, 'MarketplaceApproved')
    // Mint token to seller
    await talentirNFT.mint(
      seller.address,
      'abcd',
      'abc',
      royaltyReceiver.address
    )
    const tokenId = await talentirNFT.contentIdToTokenId('abc')
    expect(await talentirNFT.balanceOf(seller.address, tokenId)).to.equal(
      1000000
    )
    // Non-owner can't set fees
    expect(
      marketplace.connect(buyer).setTalentirFee(1, talentirFeeReceiver.address)
    ).to.be.revertedWith('Ownable: caller is not the owner')
    expect(talentirNFT.connect(buyer).setRoyalty(1)).to.be.revertedWith(
      'Ownable: caller is not the owner'
    )
    // Can't set too high fees
    expect(
      marketplace.setTalentirFee(10001, talentirFeeReceiver.address)
    ).to.be.revertedWith('Must be <=10k')
    expect(
      marketplace.setTalentirFee(101, talentirFeeReceiver.address)
    ).to.be.revertedWith('Must be <=100')
    // Set fees
    expect(
      await marketplace.setTalentirFee(10000, talentirFeeReceiver.address)
    ).to.emit(marketplace, 'TalentirFeeSet')
    expect(await talentirNFT.setRoyalty(100)).to.emit(
      talentirNFT,
      'RoyaltyPercentageChanged'
    )
    expect(await talentirNFT.setRoyalty(50)).to.emit(
      talentirNFT,
      'RoyaltyPercentageChanged'
    )
    // Non-royalty-receiver can't update royalties
    expect(
      talentirNFT.updateTalent(tokenId, seller.address)
    ).to.be.revertedWith('Royalty receiver must update')
    // Royalty-receiver can update royalties
    expect(
      await talentirNFT
        .connect(royaltyReceiver)
        .updateTalent(tokenId, seller.address)
    ).to.emit(talentirNFT, 'TalentChange')
    expect(
      await talentirNFT
        .connect(seller)
        .updateTalent(tokenId, royaltyReceiver.address)
    ).to.emit(talentirNFT, 'TalentChange')
    // Execute order, check that fees are distributed
    expect(
      await marketplace.connect(seller).makeSellOrder(tokenId, 1000, 1, true)
    ).to.emit(marketplace, 'OrderAdded')
    expect(
      await marketplace
        .connect(buyer)
        .makeBuyOrder(tokenId, 1, true, { value: 1000 })
    )
      .to.emit(marketplace, 'OrderExecuted')
      .to.changeEtherBalances(
        [
          buyer.address,
          seller.address,
          talentirFeeReceiver.address,
          royaltyReceiver.address
        ],
        [-1000, 850, 100, 50]
      )
  })

  it('should handle multiple orders', async function () {
    // Mint token to seller
    await talentirNFT.mint(
      seller.address,
      'abcd',
      'abc',
      royaltyReceiver.address
    )
    const tokenId = await talentirNFT.contentIdToTokenId('abc')
    expect(await talentirNFT.balanceOf(seller.address, tokenId)).to.equal(
      1000000
    )
    // Grant allowance
    expect(
      talentirNFT.setNftMarketplaceApproval(marketplace.address, true)
    ).to.emit(talentirNFT, 'MarketplaceApproved')
    // Add multiple buy and sell orders
    for (let i = 5; i <= 10; i++) {
      expect(
        await marketplace
          .connect(seller)
          .makeSellOrder(
            tokenId,
            oneEther.mul(i).add(oneEther.mul(10)),
            2,
            true
          )
      ).to.emit(marketplace, 'OrderAdded')
      expect(
        await marketplace
          .connect(buyer)
          .makeBuyOrder(tokenId, 2, true, { value: oneEther.mul(i) })
      )
        .to.emit(marketplace, 'OrderAdded')
        .to.changeEtherBalances(
          [marketplace.address, buyer.address],
          [oneEther.mul(i), -oneEther.mul(i)]
        )
    }
    // Add another order at the best price
    expect(
      await marketplace.makeBuyOrder(tokenId, 2, true, {
        value: oneEther.mul(10)
      })
    )
      .to.emit(marketplace, 'OrderAdded')
      .to.changeEtherBalances(
        [marketplace.address, owner.address],
        [oneEther.mul(10), -oneEther.mul(10)]
      )
    // Check FIFO: best order should be the one added first, and that one shuld be executed
    let bestOrderId = await marketplace.getBestOrder(tokenId, BUY)
    let bestOrder = await marketplace.orders(bestOrderId[0])
    expect(bestOrder.sender).to.equal(buyer.address)
    expect(
      await marketplace
        .connect(seller)
        .makeSellOrder(tokenId, oneEther.mul(10), 2, true)
    )
      .to.emit(marketplace, 'OrderExecuted')
      .to.changeEtherBalances(
        [marketplace.address, seller.address],
        [-oneEther.mul(10), oneEther.mul(10)]
      )
    // New best order is the second one
    bestOrderId = await marketplace.getBestOrder(tokenId, BUY)
    bestOrder = await marketplace.orders(bestOrderId[0])
    expect(bestOrder.sender).to.equal(owner.address)
    // Partially fill the buy orders
    // expect(
    await marketplace
      .connect(seller)
      .makeSellOrder(tokenId, oneEther, 1, false)
    // )
    //   .to.emit(marketplace, "OrderExecuted")
    //   .to.changeEtherBalances(
    //     [marketplace.address, seller.address],
    //     [-oneEther, oneEther]
    //   );
    // bestOrderId = await marketplace.getBestOrder(tokenId, BUY);
    // bestOrder = await marketplace.orders(bestOrderId[0]);
    // expect(await bestOrder.quantity).to.equal(0);
    // console.log(bestOrder);
  })

  it('should pause and cancel', async function () {
    // Make buy orders
    const tokenId = await talentirNFT.contentIdToTokenId('abc')
    expect(
      await marketplace.makeBuyOrder(tokenId, 1, true, {
        value: oneEther
      })
    )
      .to.emit(marketplace, 'OrderAdded')
      .to.changeEtherBalances(
        [marketplace.address, owner.address],
        [oneEther, -oneEther]
      )
    // Non-owner can't pause
    expect(marketplace.connect(seller).pause()).to.be.revertedWith(
      'Ownable: caller is not the owner'
    )
    // Pause contract
    expect(await marketplace.pause()).to.emit(marketplace, 'Paused')
    // Can't make buy or sell orders
    expect(
      marketplace.makeBuyOrder(tokenId, 1, true, {
        value: oneEther
      })
    ).to.be.revertedWith('Pausable: paused')
    expect(
      marketplace.makeSellOrder(tokenId, oneEther, 1, true)
    ).to.be.revertedWith('Pausable: paused')
    // Other user can't cancel order on behalf of others
    expect(marketplace.connect(seller).cancelOrders([1])).to.be.revertedWith(
      'Wrong user'
    )
    // Can still cancel order
    expect(await marketplace.cancelOrders([1]))
      .to.emit(marketplace, 'OrderCancelled')
      .to.changeEtherBalances(
        [marketplace.address, owner.address],
        [-oneEther, oneEther]
      )
    // Order is removed
    const orderID = await marketplace.getBestOrder(tokenId, SELL)
    let order = await marketplace.orders(orderID[0])
    expect(orderID[0]).to.equal(0)
    expect(orderID[1]).to.equal(0)
    expect(order.side).to.equal(0)
    expect(order.price).to.equal(0)
    expect(order.quantity).to.equal(0)

    order = await marketplace.orders(1)
    expect(order.side).to.equal(0)
    expect(order.price).to.equal(0)
    expect(order.quantity).to.equal(0)
  })
})
