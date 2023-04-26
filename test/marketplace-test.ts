import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { ethers } from 'hardhat'
// eslint-disable-next-line
import { TalentirTokenV1, TalentirMarketplaceV1 } from "../typechain-types";

describe('Talentir Marketplace Tests', function () {
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

    marketplace = await MarketplaceFactory.deploy(talentirNFT.address)
    await marketplace.deployed()

    await talentirNFT.setMarketplace(marketplace.address, [])

    // Can't mint token before minter role is set
    await expect(
      talentirNFT.mint(seller.address, 'abc', 'abc', royaltyReceiver.address, false)
    ).to.be.revertedWith('Not allowed')
    // Set minter role to owner
    await talentirNFT.setMinterRole(owner.address, [])
  })

  it('deploy', async function () {
    const MarketplaceFactory = await ethers.getContractFactory(
      'TalentirMarketplaceV1'
    )

    // Can't deploy if it's not a IERC2981 or ERC1155 contract
    await expect(MarketplaceFactory.deploy(owner.address)).to.be.reverted

    await expect(MarketplaceFactory.deploy(ethers.constants.AddressZero))
      .to.be.revertedWith('Invalid address')

    // Mint test token
    await talentirNFT.mint(
      seller.address,
      'abc',
      'abc',
      royaltyReceiver.address,
      false
    )

    const tokenId = await talentirNFT.contentIdToTokenId('abc')

    // Contract can't receive batch transfers.
    await expect(talentirNFT.safeBatchTransferFrom(
      seller.address,
      marketplace.address,
      [tokenId],
      [1],
      '0x00'
    )).to.be.revertedWith('ERC1155: ERC1155Receiver rejected tokens')

    // Contract can't receive regular transfers
    await expect(talentirNFT.safeTransferFrom(
      seller.address,
      marketplace.address,
      tokenId,
      1,
      '0x00'
    )).to.be.revertedWith('Cannot receive')
  })

  it('should open and close a single order (no fees)', async function () {
    // Set royalties to 0 (will be tested later)
    await expect(talentirNFT.setRoyalty(0)).to.emit(
      talentirNFT,
      'RoyaltyPercentageChanged'
    )
    // Non-token owner can't place sell order
    await expect(
      marketplace.connect(seller).makeSellOrder(seller.address, 1, 1, 1, true, false)
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
        .makeSellOrder(seller.address, tokenId, oneEther, 0, true, false)
    ).to.be.revertedWith('Token quantity must be positive')
    await expect(
      marketplace
        .connect(seller)
        .makeSellOrder(seller.address, tokenId, oneEther, 1_000_001, true, false)
    ).to.be.revertedWith('Token quantity too high')
    await expect(
      marketplace
        .connect(seller)
        .makeSellOrder(seller.address, tokenId, 0, 1, true, false)
    ).to.be.revertedWith('Price must be positive')
    await expect(
      marketplace
        .connect(seller)
        .makeSellOrder(seller.address, tokenId, 0, 0, true, false)
    ).to.be.revertedWith('Price must be positive')
    await expect(
      marketplace
        .connect(buyer)
        .makeBuyOrder(buyer.address, tokenId, 0, false, false, { value: 1000 })
    ).to.be.revertedWith('Token quantity must be positive')
    await expect(
      marketplace
        .connect(buyer)
        .makeBuyOrder(buyer.address, tokenId, 1, false, false, { value: 0 })
    ).to.be.revertedWith('Price must be positive')
    await expect(
      marketplace
        .connect(buyer)
        .makeBuyOrder(buyer.address, tokenId, 0, false, false, { value: 0 })
    ).to.be.revertedWith('Price must be positive')
    // Can't add order with rounding problem
    await expect(
      marketplace
        .connect(seller)
        .makeSellOrder(seller.address, tokenId, 1, 2, true, false)
    ).to.be.revertedWith('Rounding problem')
    // Add order to orderbook
    await expect(
      marketplace
        .connect(seller)
        .makeSellOrder(seller.address, tokenId, oneEther, 1, true, false)
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
          .makeBuyOrder(buyer.address, tokenId, 1, false, false, { value: 1000 })
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
          .makeBuyOrder(buyer.address, tokenId, 1, true, false, { value: 1000 })
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
      .makeBuyOrder(buyer.address, tokenId, 1, false, false, {
        value: oneEther.mul(2)
      })

    await expect(buyTransaction).to.emit(marketplace, 'OrderExecuted')

    await expect(await buyTransaction).to.changeEtherBalances(
      [buyer, seller],
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
    const transaction = marketplace
      .connect(seller)
      .makeSellOrder(seller.address, tokenId, 1000, 1, false, false)

    await expect(transaction).to.emit(marketplace, 'OrderExecuted')

    await expect(await transaction).to.changeEtherBalances(
      [marketplace, seller],
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
    // Can't set zero wallet
    await expect(
      marketplace.setTalentirFee(10000, ethers.constants.AddressZero)
    ).to.be.revertedWith('Wallet is zero')
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
        .makeSellOrder(seller.address, tokenId, 1000, 1, true, false)
    ).to.emit(marketplace, 'OrderAdded')
    const transaction = marketplace
      .connect(buyer)
      .makeBuyOrder(buyer.address, tokenId, 1, true, false, { value: 1000 })

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
            true,
            false
          )
      ).to.emit(marketplace, 'OrderAdded')

      const transaction = marketplace
        .connect(buyer)
        .makeBuyOrder(buyer.address, tokenId, 2, true, false, {
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
      false,
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
      .makeSellOrder(seller.address, tokenId, oneEther.mul(10), 2, true, false)

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
      .makeSellOrder(seller.address, tokenId, oneEther, 1, false, false)

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
      .makeBuyOrder(buyer.address, tokenId, 1, false, false, {
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
      .makeSellOrder(seller.address, tokenId, oneEther, 2, false, false)

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
      .makeBuyOrder(buyer.address, tokenId, 2, false, false, {
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
      marketplace.connect(user).makeSellOrder(user.address, tokenId, oneEther, 1, true, false)
    ).to.emit(marketplace, 'OrderAdded')

    // Make buy order
    let transaction = marketplace.connect(user).makeBuyOrder(
      user.address,
      tokenId,
      1,
      true,
      false,
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
      marketplace.connect(user).makeBuyOrder(owner.address, tokenId, 1, true, false, {
        value: oneEther
      })
    ).to.be.revertedWith('Pausable: paused')
    await expect(
      marketplace.connect(user).makeSellOrder(owner.address, tokenId, oneEther, 1, true, false)
    ).to.be.revertedWith('Pausable: paused')
    // Other user can't cancel order on behalf of others
    await expect(
      marketplace.connect(buyer).cancelOrders([1], false)
    ).to.be.revertedWith('Wrong user')
    // Can still cancel orders
    transaction = marketplace.connect(user).cancelOrders([1, 2], false)

    await expect(transaction).to.emit(marketplace, 'OrderCancelled').withNamedArgs({
      orderId: 1,
      from: user.address,
      tokenId,
      side: SELL,
      price: oneEther,
      quantity: 1
    })

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
      marketplace.connect(user).makeSellOrder(user.address, tokenId, oneEther, 1, true, false)
    ).to.emit(marketplace, 'OrderAdded')
    transaction = marketplace.connect(user).makeBuyOrder(user.address, tokenId, 1, true, false, {
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
        .makeSellOrder(seller.address, tokenId, oneEther, 1, true, false)
    ).to.emit(marketplace, 'OrderAdded')
    // Other account can't add order
    await expect(
      marketplace.connect(sellAgent).makeSellOrder(seller.address, tokenId, oneEther, 1, true, false)
    ).to.be.revertedWith('Not allowed')
    // Approve owner
    await expect(
      talentirNFT.connect(seller).setApprovalForAll(sellAgent.address, true)
    ).to.emit(talentirNFT, 'ApprovalForAll')
    // Owner can make sell offer on behalf of seller
    await expect(
      marketplace.connect(sellAgent).makeSellOrder(seller.address, tokenId, oneEther, 1, true, false)
    ).to.emit(marketplace, 'OrderAdded')
    // Revoke approval
    await expect(
      talentirNFT.connect(seller).setApprovalForAll(sellAgent.address, false)
    ).to.emit(talentirNFT, 'ApprovalForAll')
    // Can't add order again
    await expect(
      marketplace.connect(sellAgent).makeSellOrder(seller.address, tokenId, oneEther, 1, true, false)
    ).to.be.revertedWith('Not allowed')
  })

  it('async transfer / pull payment', async function () {
    const royaltyPercent = 7
    const talentirFeePercent = 9

    await talentirNFT.setRoyalty(royaltyPercent * 1000)
    await marketplace.setTalentirFee(talentirFeePercent * 1000, talentirFeeReceiver.address)

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

    const initialSellOrderQuantity = 1_000

    // Add sell order to orderbook
    await expect(
      marketplace
        .connect(seller)
        .makeSellOrder(seller.address, tokenId, oneEther, initialSellOrderQuantity, true, true)
    ).to.emit(marketplace, 'OrderAdded')

    const initialBuyOrderQuantity = 1_000

    // Add cheaper buy order to orderbook
    await expect(
      marketplace
        .connect(buyer)
        .makeBuyOrder(buyer.address, tokenId, initialBuyOrderQuantity, true, true, {
          value: oneEther.div(2)
        })
    ).to.emit(marketplace, 'OrderAdded')

    // Execute partial Sell Order. Seller is caller.
    {
      const quantity = 500
      const cost = oneEther.div(4)
      const price = cost.div(quantity)
      const royalties = cost.mul(royaltyPercent).div(100)
      const fee = cost.mul(talentirFeePercent).div(100)
      const paidToSeller = cost.sub(royalties).sub(fee)

      // sell into order
      await expect(
        marketplace
          .connect(seller)
          .makeSellOrder(seller.address, tokenId, cost, quantity, true, true)
      ).to.emit(marketplace, 'OrderExecuted').withNamedArgs({
        orderId: 2,
        buyer: buyer.address,
        seller: seller.address,
        paidToSeller,
        price,
        royalties,
        royaltiesReceiver: royaltyReceiver.address,
        quantity,
        remainingQuantity: initialBuyOrderQuantity - quantity,
        asyncTransfer: true
      })

      // Royalty Receiver can withdraw correct amount
      await expect(await marketplace.withdrawPayments(royaltyReceiver.address)).to.changeEtherBalance(
        royaltyReceiver,
        royalties
      )

      // Seller can withdraw correct amount
      await expect(await marketplace.withdrawPayments(seller.address)).to.changeEtherBalance(
        seller,
        paidToSeller
      )

      // Fee Receiver can withdraw correct amount
      await expect(await marketplace.withdrawPayments(talentirFeeReceiver.address)).to.changeEtherBalance(
        talentirFeeReceiver,
        fee
      )

      // Buyer can withdraw correct amount
      await marketplace.withdrawTokens(buyer.address, tokenId)
      expect(await talentirNFT.balanceOf(buyer.address, tokenId)).to.equal(quantity)

      // Withdrawing again doesn't work
      await expect(marketplace.withdrawTokens(buyer.address, tokenId)).to.be.revertedWith(
        'No tokens to withdraw'
      )
    }

    // Execute partial Buy Order. Buyer is caller.
    {
      const quantity = 500
      const cost = oneEther.div(2)
      const price = cost.div(quantity)
      const royalties = cost.mul(royaltyPercent).div(100)
      const fee = cost.mul(talentirFeePercent).div(100)
      const paidToSeller = cost.sub(royalties).sub(fee)

      await expect(
        marketplace
          .connect(buyer)
          .makeBuyOrder(buyer.address, tokenId, quantity, true, true, {
            value: cost
          })
      ).to.emit(marketplace, 'OrderExecuted')
        .withNamedArgs({
          orderId: 1,
          buyer: buyer.address,
          seller: seller.address,
          paidToSeller,
          price,
          royalties,
          royaltiesReceiver: royaltyReceiver.address,
          quantity,
          remainingQuantity: initialSellOrderQuantity - quantity,
          asyncTransfer: true
        })

      // Royalty Receiver can withdraw correct amount
      await expect(await marketplace.withdrawPayments(royaltyReceiver.address)).to.changeEtherBalance(
        royaltyReceiver,
        royalties
      )

      // Seller can withdraw correct amount
      await expect(await marketplace.withdrawPayments(seller.address)).to.changeEtherBalance(
        seller,
        paidToSeller
      )

      // Fee Receiver can withdraw correct amount
      await expect(await marketplace.withdrawPayments(talentirFeeReceiver.address)).to.changeEtherBalance(
        talentirFeeReceiver,
        fee
      )

      // Buyer can withdraw correct amount
      const buyerBalanceBefore = await talentirNFT.balanceOf(buyer.address, tokenId)
      await marketplace.withdrawTokens(buyer.address, tokenId)
      const buyerBalanceAfter = await talentirNFT.balanceOf(buyer.address, tokenId)
      expect(buyerBalanceAfter.sub(buyerBalanceBefore)).to.equal(quantity)
    }

    // Cancel Remaining Sell Order
    {
      const orderId = 1
      const remainingQuantity = 500

      await expect(
        marketplace
          .connect(seller)
          .cancelOrders([1], true)
      ).to.emit(marketplace, 'OrderCancelled')
        .withNamedArgs({
          orderId,
          from: seller.address,
          asyncTransfer: true
        })

      // Seller can withdraw correct token amount
      const sellerBalanceBefore = await talentirNFT.balanceOf(seller.address, tokenId)
      await marketplace.withdrawTokens(seller.address, tokenId)
      const sellerBalanceAfter = await talentirNFT.balanceOf(seller.address, tokenId)
      expect(sellerBalanceAfter.sub(sellerBalanceBefore)).to.equal(remainingQuantity)
    }

    // Cancel Remaining Buy Order
    {
      const orderId = 2

      await expect(
        marketplace
          .connect(buyer)
          .cancelOrders([2], true)
      ).to.emit(marketplace, 'OrderCancelled')
        .withNamedArgs({
          orderId,
          from: buyer.address,
          asyncTransfer: true
        })

      // Buyer can withdraw correct ether amount
      await expect(await marketplace.withdrawPayments(buyer.address)).to.changeEtherBalance(
        buyer,
        oneEther.div(4)
      )
    }
  })

  it('owner can cancel orders', async function () {
    await talentirNFT.mint(
      seller.address,
      'abcd',
      'abc',
      royaltyReceiver.address,
      false
    )

    const tokenId = await talentirNFT.contentIdToTokenId('abc')

    await marketplace.connect(seller).makeSellOrder(
      seller.address,
      tokenId,
      oneEther,
      1_000,
      true,
      false
    )

    // Owner can cancel order
    await expect(
      marketplace
        .connect(owner)
        .cancelOrders([1], true)
    ).to.emit(marketplace, 'OrderCancelled')
      .withNamedArgs({
        orderId: 1,
        from: seller.address,
        asyncTransfer: true
      })

    // Token is refunded to seller, not the owner
    const balanceBefore = await talentirNFT.balanceOf(seller.address, tokenId)
    await marketplace.withdrawTokens(seller.address, tokenId)
    const balanceAfter = await talentirNFT.balanceOf(seller.address, tokenId)
    expect(balanceAfter.sub(balanceBefore)).to.equal(1_000)
  })

  it('order removed in the correct order', async function () {
    // Mint token to seller
    await talentirNFT.mint(
      seller.address,
      'abcd',
      'abc',
      royaltyReceiver.address,
      false
    )

    const tokenId = await talentirNFT.contentIdToTokenId('abc')

    // Order with ID 1 created
    await expect(
      marketplace
        .connect(seller)
        .makeSellOrder(seller.address, tokenId, oneEther, 1, true, false)
    ).to.emit(marketplace, 'OrderAdded')
      .withArgs(1, seller.address, tokenId, SELL, oneEther, 1)

    // Order with ID 2 created
    await expect(
      marketplace
        .connect(seller)
        .makeSellOrder(seller.address, tokenId, oneEther, 1, true, false)
    ).to.emit(marketplace, 'OrderAdded')
      .withArgs(2, seller.address, tokenId, SELL, oneEther, 1)

    // Order with ID 3 created
    await expect(
      marketplace
        .connect(seller)
        .makeSellOrder(seller.address, tokenId, oneEther, 1, true, false)
    ).to.emit(marketplace, 'OrderAdded')
      .withArgs(3, seller.address, tokenId, SELL, oneEther, 1)

    // Order ID 1 is the best order (posted first)
    const [orderId1] = await marketplace.getBestOrder(tokenId, 1)
    expect(orderId1).to.equal(1)

    // Cancelling order with ID 2
    await marketplace.connect(seller).cancelOrders([2], false)

    // Order ID 1 is still the best order
    const [orderId2] = await marketplace.getBestOrder(tokenId, 1)
    expect(orderId2).to.equal(1)

    // Cancelling order with ID 1
    await marketplace.connect(seller).cancelOrders([1], false)

    // Order ID 3 is now the best order
    const [orderId3] = await marketplace.getBestOrder(tokenId, 1)
    expect(orderId3).to.equal(3)

    // Cancelling order with ID 3
    await marketplace.connect(seller).cancelOrders([3], false)

    // No best order
    const [orderId4] = await marketplace.getBestOrder(tokenId, 1)
    expect(orderId4).to.equal(0)
  })
})
