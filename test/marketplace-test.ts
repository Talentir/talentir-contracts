import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { ethers } from 'hardhat'
// eslint-disable-next-line
import { TalentirTokenV1, TalentirMarketplaceV1 } from "../typechain-types";

describe('Marketplace Tests', function () {
  let talentirNFT: TalentirTokenV1
  let marketplace: TalentirMarketplaceV1
  let owner: SignerWithAddress
  let buyer: SignerWithAddress
  let seller: SignerWithAddress
  let royaltyReceiver: SignerWithAddress
  let talentirFeeReceiver: SignerWithAddress
  let sellAgent: SignerWithAddress
  const BUY = 0
  const SELL = 1
  const oneEther = ethers.utils.parseEther('0.0000000001') // full Ether causes overflow in etherBalanceToChange function

  beforeEach(async function () {
    [owner, buyer, seller, royaltyReceiver, talentirFeeReceiver, sellAgent] =
      await ethers.getSigners()
    const TalentirNFTFactory = await ethers.getContractFactory(
      'TalentirTokenV1'
    )
    talentirNFT = await TalentirNFTFactory.deploy()
    await talentirNFT.deployed()
    const MarketplaceFactory = await ethers.getContractFactory(
      'TalentirMarketplaceV1'
    )
    await expect(MarketplaceFactory.deploy(owner.address)).to.be.reverted
    marketplace = await MarketplaceFactory.deploy(talentirNFT.address)
    await marketplace.deployed()

    await talentirNFT.setMarketplace(marketplace.address)

    // Can't mint token before minter role is set
    await expect(
      talentirNFT.mint(seller.address, 'abc', 'abc', royaltyReceiver.address, false)
    ).to.be.revertedWith('Not allowed')
    // Set minter role to owner
    await talentirNFT.setMinterRole(owner.address)
  })

  it.only('should open and close a single order (no fees)', async function () {
    // Set royalties to 0 (will be tested later)
    await expect(talentirNFT.setRoyalty(0)).to.emit(
      talentirNFT,
      'RoyaltyPercentageChanged'
    )
    // Non-token owner can't place sell order
    await expect(
      marketplace.connect(seller).makeSellOrder(seller.address, 1, 1, 1, true)
    ).to.be.revertedWith('ERC1155: caller is not token owner or approved')
    // Mint token to seller
    await talentirNFT.mint(
      seller.address,
      'abcd',
      'abc',
      royaltyReceiver.address,
      false
    )
    const tokenId = await talentirNFT.contentIdToTokenId('abc')
    expect(await talentirNFT.balanceOf(seller.address, tokenId)).to.equal(
      1_000_000
    )

    // Can't add orders with 0 quantity or price
    await expect(
      marketplace
        .connect(seller)
        .makeSellOrder(seller.address, tokenId, oneEther, 0, true)
    ).to.be.revertedWith('Token quantity must be positive')
    await expect(
      marketplace
        .connect(seller)
        .makeSellOrder(seller.address, tokenId, 0, 1, true)
    ).to.be.revertedWith('Price must be positive')
    await expect(
      marketplace
        .connect(seller)
        .makeSellOrder(seller.address, tokenId, 0, 0, true)
    ).to.be.revertedWith('Price must be positive')
    await expect(
      marketplace
        .connect(buyer)
        .makeBuyOrder(buyer.address, tokenId, 0, false, { value: 1000 })
    ).to.be.revertedWith('Token quantity must be positive')
    await expect(
      marketplace
        .connect(buyer)
        .makeBuyOrder(buyer.address, tokenId, 1, false, { value: 0 })
    ).to.be.revertedWith('Price must be positive')
    await expect(
      marketplace
        .connect(buyer)
        .makeBuyOrder(buyer.address, tokenId, 0, false, { value: 0 })
    ).to.be.revertedWith('Price must be positive')
    // Can't add order with rounding problem
    await expect(
      marketplace
        .connect(seller)
        .makeSellOrder(seller.address, tokenId, 1, 2, true)
    ).to.be.revertedWith('Rounding problem')
    // Add order to orderbook
    await expect(
      marketplace
        .connect(seller)
        .makeSellOrder(seller.address, tokenId, oneEther, 1, true)
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
      999_999
    )
    expect(await talentirNFT.balanceOf(marketplace.address, tokenId)).to.equal(
      1
    )
    // Buyer makes a buy order with too low price, not added to order book -> nothing happens
    await expect(
      async () =>
        await marketplace
          .connect(buyer)
          .makeBuyOrder(buyer.address, tokenId, 1, false, { value: 1000 })
    ).to.changeEtherBalances([buyer, marketplace], [0, 0])
    orderID = await marketplace.getBestOrder(tokenId, BUY)
    order = await marketplace.orders(orderID[0])
    expect(orderID[0]).to.equal(0)
    expect(orderID[1]).to.equal(0)
    expect(order.side).to.equal(0)
    expect(order.price).to.equal(0)
    expect(order.quantity).to.equal(0)
    // Buyer makes a buy order with too low price, added to order book
    await expect(
      async () =>
        await marketplace
          .connect(buyer)
          .makeBuyOrder(buyer.address, tokenId, 1, true, { value: 1000 })
    ).to.changeEtherBalances([buyer, marketplace], [-1000, 1000])
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
    const buyTransaction = marketplace
      .connect(buyer)
      .makeBuyOrder(buyer.address, tokenId, 1, false, {
        value: oneEther.mul(2)
      })

    await expect(buyTransaction).to.emit(marketplace, 'OrderExecuted')

    await expect(await buyTransaction).to.changeEtherBalance(
      buyer, -oneEther
    )

    await expect(await marketplace.withdrawPayments(seller.address)).to.changeEtherBalance(
      seller, oneEther
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
    const transaction = marketplace
      .connect(seller)
      .makeSellOrder(seller.address, tokenId, 1000, 1, false)

    await expect(transaction).to.emit(marketplace, 'OrderExecuted')

    await expect(await transaction).to.changeEtherBalances(
      [marketplace, seller],
      [-1000, 1000]
    )
    // // Order is removed
    orderID = await marketplace.getBestOrder(tokenId, BUY)
    order = await marketplace.orders(orderID[0])
    expect(orderID[0]).to.equal(0)
    expect(orderID[1]).to.equal(0)
    expect(order.side).to.equal(0)
    expect(order.price).to.equal(0)
    expect(order.quantity).to.equal(0)

    // Withdraw tokens for buyer
    await expect(marketplace.withdrawTokens(buyer.address, tokenId)).to.emit(
      marketplace,
      'ERC1155Withdrawn'
    ).withNamedArgs({
      wallet: buyer.address,
      tokenId,
      quantity: 1
    })

    // Balances are updated
    expect(await talentirNFT.balanceOf(seller.address, tokenId)).to.equal(
      999998
    )
    expect(await talentirNFT.balanceOf(buyer.address, tokenId)).to.equal(2)
  })

  it('should distribute fees correctly', async function () {
    // Mint token to seller
    await talentirNFT.mint(
      seller.address,
      'abcd',
      'abc',
      royaltyReceiver.address,
      false
    )
    const tokenId = await talentirNFT.contentIdToTokenId('abc')
    expect(await talentirNFT.balanceOf(seller.address, tokenId)).to.equal(
      1000000
    )
    // Non-owner can't set fees
    await expect(
      marketplace.connect(buyer).setTalentirFee(1, talentirFeeReceiver.address)
    ).to.be.revertedWith('Ownable: caller is not the owner')
    await expect(talentirNFT.connect(buyer).setRoyalty(1)).to.be.revertedWith(
      'Ownable: caller is not the owner'
    )
    // Can't set too high fees
    await expect(
      marketplace.setTalentirFee(10001, talentirFeeReceiver.address)
    ).to.be.revertedWith('Must be <=10k')
    // Set fees
    await expect(
      marketplace.setTalentirFee(10000, talentirFeeReceiver.address)
    ).to.emit(marketplace, 'TalentirFeeSet')
    await expect(talentirNFT.setRoyalty(100)).to.emit(
      talentirNFT,
      'RoyaltyPercentageChanged'
    )
    await expect(talentirNFT.setRoyalty(5000)).to.emit(
      talentirNFT,
      'RoyaltyPercentageChanged'
    )
    // Non-royalty-receiver can't update royalties
    await expect(
      talentirNFT.updateTalent(tokenId, seller.address)
    ).to.be.revertedWith('Talent must update')
    // Royalty-receiver can update royalties
    await expect(
      talentirNFT.connect(royaltyReceiver).updateTalent(tokenId, seller.address)
    ).to.emit(talentirNFT, 'TalentChanged')
    await expect(
      talentirNFT.connect(seller).updateTalent(tokenId, royaltyReceiver.address)
    ).to.emit(talentirNFT, 'TalentChanged')
    // Execute order, check that fees are distributed
    await expect(
      marketplace
        .connect(seller)
        .makeSellOrder(seller.address, tokenId, 1000, 1, true)
    ).to.emit(marketplace, 'OrderAdded')
    const transaction = marketplace
      .connect(buyer)
      .makeBuyOrder(buyer.address, tokenId, 1, true, { value: 1000 })

    await expect(transaction).to.emit(marketplace, 'OrderExecuted')

    await expect(await transaction).to.changeEtherBalances(
      [buyer, seller, talentirFeeReceiver, royaltyReceiver],
      [-1000, 850, 100, 50]
    )
  })

  it('should handle multiple orders', async function () {
    // Set royalties to 0 (tested separately)
    await expect(talentirNFT.setRoyalty(0)).to.emit(
      talentirNFT,
      'RoyaltyPercentageChanged'
    )
    // Mint token to seller
    await talentirNFT.mint(
      seller.address,
      'abcd',
      'abc',
      royaltyReceiver.address,
      false
    )
    const tokenId = await talentirNFT.contentIdToTokenId('abc')
    expect(await talentirNFT.balanceOf(seller.address, tokenId)).to.equal(
      1000000
    )
    // Add multiple buy and sell orders
    for (let i = 5; i <= 10; i++) {
      await expect(
        marketplace
          .connect(seller)
          .makeSellOrder(
            seller.address,
            tokenId,
            oneEther.mul(2 * i).add(oneEther.mul(20)),
            2,
            true
          )
      ).to.emit(marketplace, 'OrderAdded')

      const transaction = marketplace
        .connect(buyer)
        .makeBuyOrder(buyer.address, tokenId, 2, true, {
          value: oneEther.mul(i * 2)
        })

      await expect(transaction).to.emit(marketplace, 'OrderAdded')

      await expect(await transaction).to.changeEtherBalances(
        [marketplace, buyer],
        [oneEther.mul(i * 2), -oneEther.mul(i * 2)]
      )
    }
    // Add another order at the best price
    let transaction = marketplace.makeBuyOrder(
      owner.address,
      tokenId,
      2,
      true,
      {
        value: oneEther.mul(20)
      }
    )

    await expect(transaction).to.emit(marketplace, 'OrderAdded')

    await expect(await transaction).to.changeEtherBalances(
      [marketplace, owner],
      [oneEther.mul(20), -oneEther.mul(20)]
    )
    // Check FIFO: best order should be the one added first, and that one shuld be executed
    let bestOrderId = await marketplace.getBestOrder(tokenId, BUY)
    let bestOrder = await marketplace.orders(bestOrderId[0])
    expect(bestOrder.sender).to.equal(buyer.address)
    transaction = marketplace
      .connect(seller)
      .makeSellOrder(seller.address, tokenId, oneEther.mul(10), 2, true)

    await expect(transaction).to.emit(marketplace, 'OrderExecuted')

    await expect(await transaction).to.changeEtherBalances(
      [marketplace, seller],
      [-oneEther.mul(20), oneEther.mul(20)]
    )

    // New best order is the second one
    bestOrderId = await marketplace.getBestOrder(tokenId, BUY)
    bestOrder = await marketplace.orders(bestOrderId[0])
    expect(bestOrder.sender).to.equal(owner.address)

    // Partially fill the buy orders
    transaction = marketplace
      .connect(seller)
      .makeSellOrder(seller.address, tokenId, oneEther, 1, false)

    await expect(transaction).to.emit(marketplace, 'OrderExecuted')

    await expect(await transaction).to.changeEtherBalances(
      [marketplace, seller],
      [-oneEther.mul(10), oneEther.mul(10)]
    )

    bestOrderId = await marketplace.getBestOrder(tokenId, BUY)
    bestOrder = await marketplace.orders(bestOrderId[0])
    expect(await bestOrder.quantity).to.equal(1)

    // Partially fill the sell orders
    transaction = marketplace
      .connect(buyer)
      .makeBuyOrder(buyer.address, tokenId, 1, false, {
        value: oneEther.mul(15)
      })

    await expect(transaction).to.emit(marketplace, 'OrderExecuted')

    await expect(await transaction).to.changeEtherBalances(
      [buyer, seller],
      [-oneEther.mul(15), oneEther.mul(15)]
    )

    bestOrderId = await marketplace.getBestOrder(tokenId, SELL)
    bestOrder = await marketplace.orders(bestOrderId[0])
    expect(await bestOrder.quantity).to.equal(1)

    // Overfill the buy orders
    transaction = marketplace
      .connect(seller)
      .makeSellOrder(seller.address, tokenId, oneEther, 2, false)

    await expect(transaction).to.emit(marketplace, 'OrderExecuted')

    await expect(await transaction).to.changeEtherBalances(
      [marketplace, seller],
      [-oneEther.mul(19), oneEther.mul(19)] // 10+9=19
    )

    bestOrderId = await marketplace.getBestOrder(tokenId, BUY)
    bestOrder = await marketplace.orders(bestOrderId[0])
    expect(await bestOrder.quantity).to.equal(1)

    // Overfill the sell orders
    transaction = marketplace
      .connect(buyer)
      .makeBuyOrder(buyer.address, tokenId, 2, false, {
        value: oneEther.mul(50)
      })

    await expect(transaction).to.emit(marketplace, 'OrderExecuted')

    await expect(await transaction).to.changeEtherBalances(
      [buyer, seller],
      [-oneEther.mul(31), oneEther.mul(31)] // 15+16=31
    )

    bestOrderId = await marketplace.getBestOrder(tokenId, SELL)
    bestOrder = await marketplace.orders(bestOrderId[0])
    expect(await bestOrder.quantity).to.equal(1)
  })

  it('should pause and cancel', async function () {
    const user = seller

    // Make sell order
    await talentirNFT.mint(
      user.address,
      'abcd',
      'abc',
      royaltyReceiver.address,
      false
    )
    const tokenId = await talentirNFT.contentIdToTokenId('abc')
    expect(await talentirNFT.balanceOf(user.address, tokenId)).to.equal(
      1000000
    )

    await expect(
      marketplace.connect(user).makeSellOrder(user.address, tokenId, oneEther, 1, true)
    ).to.emit(marketplace, 'OrderAdded')

    // Make buy order
    let transaction = marketplace.connect(user).makeBuyOrder(
      user.address,
      tokenId,
      1,
      true,
      {
        value: 1
      }
    )

    await expect(transaction).to.emit(marketplace, 'OrderAdded')

    await expect(await transaction).to.changeEtherBalances(
      [marketplace, user],
      [1, -1]
    )

    // Non-owner can't pause
    await expect(marketplace.connect(buyer).pause()).to.be.revertedWith(
      'Ownable: caller is not the owner'
    )
    // Pause contract
    await expect(marketplace.pause()).to.emit(marketplace, 'Paused')
    // Can't make buy or sell orders
    await expect(
      marketplace.connect(user).makeBuyOrder(owner.address, tokenId, 1, true, {
        value: oneEther
      })
    ).to.be.revertedWith('Pausable: paused')
    await expect(
      marketplace.connect(user).makeSellOrder(owner.address, tokenId, oneEther, 1, true)
    ).to.be.revertedWith('Pausable: paused')
    // Other user can't cancel order on behalf of others
    await expect(
      marketplace.connect(buyer).cancelOrders([1])
    ).to.be.revertedWith('Wrong user')
    // Can still cancel orders
    transaction = marketplace.connect(user).cancelOrders([1, 2])

    await expect(transaction).to.emit(marketplace, 'OrderCancelled')

    await expect(await transaction).to.changeEtherBalances(
      [marketplace, user],
      [-1, 1]
    )
    // // Order is removed
    let orderID = await marketplace.getBestOrder(tokenId, SELL)
    let order = await marketplace.orders(orderID[0])
    expect(orderID[0]).to.equal(0)
    expect(orderID[1]).to.equal(0)
    expect(order.side).to.equal(0)
    expect(order.price).to.equal(0)
    expect(order.quantity).to.equal(0)

    orderID = await marketplace.getBestOrder(tokenId, BUY)
    order = await marketplace.orders(orderID[0])
    expect(orderID[0]).to.equal(0)
    expect(orderID[1]).to.equal(0)
    expect(order.side).to.equal(0)
    expect(order.price).to.equal(0)
    expect(order.quantity).to.equal(0)

    order = await marketplace.orders(1)
    expect(order.side).to.equal(0)
    expect(order.price).to.equal(0)
    expect(order.quantity).to.equal(0)

    order = await marketplace.orders(2)
    expect(order.side).to.equal(0)
    expect(order.price).to.equal(0)
    expect(order.quantity).to.equal(0)

    // Non-owner can't unpause
    await expect(marketplace.connect(buyer).unpause()).to.be.revertedWith(
      'Ownable: caller is not the owner'
    )
    // Unpause contract
    await expect(marketplace.unpause()).to.emit(marketplace, 'Unpaused')
    // Can make orders again
    await expect(
      marketplace.connect(user).makeSellOrder(user.address, tokenId, oneEther, 1, true)
    ).to.emit(marketplace, 'OrderAdded')
    transaction = marketplace.connect(user).makeBuyOrder(user.address, tokenId, 1, true, {
      value: 1
    })

    await expect(transaction).to.emit(marketplace, 'OrderAdded')

    await expect(await transaction).to.changeEtherBalances(
      [marketplace, user],
      [1, -1]
    )
  })

  it('make orders on behalf of other accounts', async function () {
    // Set royalties to 0 (tested separately)
    await expect(talentirNFT.setRoyalty(0)).to.emit(
      talentirNFT,
      'RoyaltyPercentageChanged'
    )
    await talentirNFT.mint(
      seller.address,
      'abcd',
      'abc',
      royaltyReceiver.address,
      false
    )
    const tokenId = await talentirNFT.contentIdToTokenId('abc')
    expect(await talentirNFT.balanceOf(seller.address, tokenId)).to.equal(
      1_000_000
    )

    // Add order to orderbook
    await expect(
      marketplace
        .connect(seller)
        .makeSellOrder(seller.address, tokenId, oneEther, 1, true)
    ).to.emit(marketplace, 'OrderAdded')
    // Other account can't add order
    await expect(
      marketplace.connect(sellAgent).makeSellOrder(seller.address, tokenId, oneEther, 1, true)
    ).to.be.revertedWith('Not allowed')
    // Approve owner
    await expect(
      talentirNFT.connect(seller).setApprovalForAll(sellAgent.address, true)
    ).to.emit(talentirNFT, 'ApprovalForAll')
    // Owner can make sell offer on behalf of seller
    await expect(
      marketplace.connect(sellAgent).makeSellOrder(seller.address, tokenId, oneEther, 1, true)
    ).to.emit(marketplace, 'OrderAdded')
    // Revoke approval
    await expect(
      talentirNFT.connect(seller).setApprovalForAll(sellAgent.address, false)
    ).to.emit(talentirNFT, 'ApprovalForAll')
    // Can't add order again
    await expect(
      marketplace.connect(sellAgent).makeSellOrder(seller.address, tokenId, oneEther, 1, true)
    ).to.be.revertedWith('Not allowed')
  })
})
