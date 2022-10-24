import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { BytesLike } from "ethers";

// eslint-disable-next-line
import { TalentirNFT } from "../typechain-types";

// Reference : https://ethereum-waffle.readthedocs.io/en/latest/matchers.html
describe("TalentirNFT", function () {
  let admin: SignerWithAddress;
  let account1: SignerWithAddress;
  let account2: SignerWithAddress;
  let account3: SignerWithAddress;
  let talentir: TalentirNFT;

  beforeEach(async function () {
    const Talentir = await ethers.getContractFactory("TalentirNFT");
    talentir = await Talentir.deploy();
    await talentir.deployed();

    [admin, account1, account2, account3] = await ethers.getSigners();
  });
});
