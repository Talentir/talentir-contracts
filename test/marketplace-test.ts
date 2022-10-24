import { expect } from "chai";
import { ethers } from "hardhat";
// eslint-disable-next-line
import { TalentirNFT } from "../typechain-types";

import { Marketplace } from "../typechain-types";

describe("Marketplace Tests", function () {
  let talentirNFT: TalentirNFT;
  let marketplace: Marketplace;

  beforeEach(async function () {
    const [owner, addr1] = await ethers.getSigners();

    const TalentirNFTFactory = await ethers.getContractFactory("TalentirNFT");
    talentirNFT = await TalentirNFTFactory.deploy();
    await talentirNFT.deployed();
    const MarketplaceFactory = await ethers.getContractFactory("Marketplace");
    marketplace = await MarketplaceFactory.deploy(talentirNFT.address, 1);
    await marketplace.deployed();
  });

  it("should deploy all contracts", async function () {
    marketplace.calcTalentirFee(1);
  });
});
