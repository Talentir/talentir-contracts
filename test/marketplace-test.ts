import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
// eslint-disable-next-line
import { TalentirNFT, TalentirMarketplaceV0 } from "../typechain-types";

describe("Marketplace Tests", function () {
  let talentirNFT: TalentirNFT;
  let marketplace: TalentirMarketplaceV0;
  let owner: SignerWithAddress;
  let buyer: SignerWithAddress;
  let seller: SignerWithAddress;
  let royaltyReceiver: SignerWithAddress;
  const BUY = 0;
  const SELL = 1;
  const oneEther = ethers.utils.parseEther("1.0");

  beforeEach(async function () {
    [owner, buyer, seller, royaltyReceiver] = await ethers.getSigners();
    const TalentirNFTFactory = await ethers.getContractFactory("TalentirNFT");
    talentirNFT = await TalentirNFTFactory.deploy();
    await talentirNFT.deployed();
    const MarketplaceFactory = await ethers.getContractFactory(
      "TalentirMarketplaceV0"
    );
    marketplace = await MarketplaceFactory.deploy(talentirNFT.address, 1);
    await marketplace.deployed();
  });

  it("should open and close a single order (no fees, no rounding)", async function () {
    // Non-token owner can't place sell order
    expect(
      marketplace.connect(seller).makeSellOrder(1, 1, 1, true)
    ).to.be.revertedWith("ERC1155: caller is not token owner nor approved");
    // Can't mint token before minter role is set
    expect(
      talentirNFT.mint(seller.address, "abc", "abc", royaltyReceiver.address)
    ).to.be.revertedWith("Not allowed");
    // Mint token to seller
    await talentirNFT.setMinterRole(owner.address);
    await talentirNFT.mint(
      seller.address,
      "abc",
      "abc",
      royaltyReceiver.address
    );
    const tokenId = await talentirNFT.contentIdToTokenId("abc");
    expect(await talentirNFT.balanceOf(seller.address, tokenId)).to.equal(
      1000000
    );
    // Still can't make sell order because of missing allowance
    expect(
      marketplace.connect(seller).makeSellOrder(1, 1, 1, true)
    ).to.be.revertedWith("ERC1155: caller is not token owner nor approved");
    // Grant allowance and make sell order, add to orderbook
    expect(
      talentirNFT.connect(seller).setApprovalForAll(marketplace.address, true)
    ).to.emit(talentirNFT, "ApprovalForAll");
    await marketplace.connect(seller).makeSellOrder(tokenId, oneEther, 1, true);
    let orderID = await marketplace.getBestOrder(tokenId, SELL);
    let order = await marketplace.orders(orderID[0]);
    expect(orderID[0]).to.equal(1);
    expect(orderID[1]).to.equal(oneEther);
    expect(order.tokenId).to.equal(tokenId);
    expect(order.side).to.equal(SELL);
    expect(order.sender).to.equal(seller.address);
    expect(order.price).to.equal(oneEther);
    expect(order.quantity).to.equal(1);
    // Balances are updated
    expect(await talentirNFT.balanceOf(seller.address, tokenId)).to.equal(
      999999
    );
    expect(await talentirNFT.balanceOf(marketplace.address, tokenId)).to.equal(
      1
    );
    // Buyer makes a buy order with too low price, not added to order book -> nothing happens
    await marketplace
      .connect(buyer)
      .makeBuyOrder(tokenId, 1, false, { value: 1 });
    orderID = await marketplace.getBestOrder(tokenId, BUY);
    order = await marketplace.orders(orderID[0]);
    expect(orderID[0]).to.equal(0);
    expect(orderID[1]).to.equal(0);
    expect(order.side).to.equal(0);
    expect(order.price).to.equal(0);
    expect(order.quantity).to.equal(0);
    // Buyer makes a buy order with too low price, added to order book
    await marketplace
      .connect(buyer)
      .makeBuyOrder(tokenId, 1, true, { value: 1 });
    orderID = await marketplace.getBestOrder(tokenId, BUY);
    order = await marketplace.orders(orderID[0]);
    expect(orderID[0]).to.equal(2);
    expect(orderID[1]).to.equal(1);
    expect(order.tokenId).to.equal(tokenId);
    expect(order.side).to.equal(BUY);
    expect(order.sender).to.equal(buyer.address);
    expect(order.price).to.equal(1);
    expect(order.quantity).to.equal(1);
    // Buyer makes a buy order with matching price, executes, removes order
    expect(
      await marketplace
        .connect(buyer)
        .makeBuyOrder(tokenId, 1, true, { value: oneEther })
    ).to.emit(marketplace, "OrderExecuted");
    orderID = await marketplace.getBestOrder(tokenId, SELL);
    order = await marketplace.orders(orderID[0]);
    expect(orderID[0]).to.equal(0);
    expect(orderID[1]).to.equal(0);
    expect(order.side).to.equal(0);
    expect(order.price).to.equal(0);
    expect(order.quantity).to.equal(0);
    // Balances are updated
    expect(await talentirNFT.balanceOf(seller.address, tokenId)).to.equal(
      999999
    );
    expect(await talentirNFT.balanceOf(buyer.address, tokenId)).to.equal(1);
    expect(await talentirNFT.balanceOf(marketplace.address, tokenId)).to.equal(
      0
    );
    // Second buy order is still open on the order book
    orderID = await marketplace.getBestOrder(tokenId, BUY);
    order = await marketplace.orders(orderID[0]);
    expect(orderID[0]).to.equal(2);
    expect(orderID[1]).to.equal(1);
    expect(order.tokenId).to.equal(tokenId);
    expect(order.side).to.equal(BUY);
    expect(order.sender).to.equal(buyer.address);
    expect(order.price).to.equal(1);
    expect(order.quantity).to.equal(1);
  });

  it("should handle multiple orders in FIFO order, allow cancelling", async function () {});

  it("should distribute fees correctly", async function () {});

  it("should handle rounding correctly", async function () {});

  it("should allow pausing", async function () {});
});
