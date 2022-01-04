import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { Talentir } from "../typechain"

// Reference : https://ethereum-waffle.readthedocs.io/en/latest/matchers.html
describe("Talentir", function () {
  let admin: SignerWithAddress;
  let account1: SignerWithAddress;
  let account2: SignerWithAddress;
  let talentir: Talentir;

  beforeEach(async function () {
    const Talentir = await ethers.getContractFactory("Talentir");
    talentir = await Talentir.deploy();
    await talentir.deployed();

    [admin, account1, account2] = await ethers.getSigners();
  });

  it("Roles", async function () {
    const minterRole = await talentir.MINTER_ROLE();
    const adminRole = await talentir.DEFAULT_ADMIN_ROLE();
    await talentir.grantRole(minterRole, account1.address);

    // Minter
    expect(await talentir.hasRole(minterRole, account1.address)).to.equal(true);
    expect(await talentir.hasRole(adminRole, account1.address)).to.equal(false);

    // Admin
    expect(await talentir.hasRole(adminRole, admin.address)).to.be.equal(true);
    expect(await talentir.hasRole(minterRole, admin.address)).to.equal(true);

    expect(await talentir.hasRole(adminRole, account2.address)).to.equal(false);
    expect(await talentir.hasRole(minterRole, account2.address)).to.equal(false);
  });

  it("Minting", async function () {
    const uri = "QmbWqxBEKC3P8tqsKc98xmWNzrzDtRLMiMPL8wBuTGsMnR";
    const tokenID = ethers.utils.sha256(ethers.utils.toUtf8Bytes(uri));
    
    await expect(talentir.safeMint(account1.address, uri))
      .to.emit(talentir, "Transfer")
      .withArgs(ethers.constants.AddressZero, account1.address, tokenID)
      .to.not.emit(talentir, "Approval");

    expect(await talentir.tokenURI(tokenID)).to.equal("ipfs://" + uri);

    await expect(talentir.safeMint(account1.address, uri)).to.be.revertedWith(
      "ERC721: token already minted"
    );
  });
});
