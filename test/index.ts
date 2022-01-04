import { expect } from "chai";
import { ethers } from "hardhat";

describe("Talentir", function () {
  it("Test, async function ()", async function() {
    const Talentir = await ethers.getContractFactory("Talentir");
    const talentir = await Talentir.deploy();
    await talentir.deployed();

    const signers = await ethers.getSigners();
    const adminAddress = await signers[0].getAddress();
    const minterAddress = await signers[1].getAddress();
    const user1Address = await signers[2].getAddress();
    

    // const mintTx = await talentir.safeMint(user1Address, "abcd");
    const uri = "sdlkfje";
    const tokenID = ethers.utils.sha256(ethers.utils.toUtf8Bytes(uri));

    await expect(talentir.safeMint(user1Address, uri))
      .to.emit(talentir, "Transfer").withArgs(ethers.constants.AddressZero, user1Address, tokenID)
      .to.not.emit(talentir, "Approval");
  
    expect(await talentir.tokenURI(tokenID)).to.equal("ipfs://" + uri);
    expect(await talentir.tokenOfOwnerByIndex(user1Address, 0)).to.equal(tokenID);

    // expect(await greeter.greet()).to.equal("Hello, world!");

    // const setGreetingTx = await greeter.setGreeting("Hola, mundo!");

    // // wait until the transaction is mined
    // await setGreetingTx.wait();

    // expect(await greeter.greet()).to.equal("Hola, mundo!");
  });
});
