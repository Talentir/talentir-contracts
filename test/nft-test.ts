import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { BytesLike } from 'ethers'
import { ethers } from 'hardhat'

// eslint-disable-next-line
import { TalentirTokenV0 } from "../typechain-types";

// Reference : https://ethereum-waffle.readthedocs.io/en/latest/matchers.html
describe('TalentirNFT', function () {
  let admin: SignerWithAddress
  let minter: SignerWithAddress
  let luki: SignerWithAddress
  let johnny: SignerWithAddress
  let talentir: TalentirTokenV0

  beforeEach(async function () {
    const Talentir = await ethers.getContractFactory('TalentirTokenV0')
    talentir = await Talentir.deploy()
    await talentir.deployed();

    [admin, minter, luki, johnny] = await ethers.getSigners()

    await talentir.setMinterRole(minter.address)
  })

  it('Uri', async function () {
    const cid1 = 'QmPxtVYgecSPTrnkZxjP3943ue3uizWtywzH7U9QwkLHU1'
    const contentID1 = '1'
    const tokenID1 = await talentir.contentIdToTokenId(contentID1)

    await talentir.setMinterRole(minter.address)
    await talentir
      .connect(minter)
      .mint(luki.address, cid1, contentID1, luki.address)

    const uri = await talentir.uri(tokenID1)
    expect(uri).to.equal(`ipfs://${cid1}`)
  })

  it('Test Minting / Burning', async function () {
    const cid1 = 'QmPxtVYgecSPTrnkZxjP3943ue3uizWtywzH7U9QwkLHU1'
    const contentID1 = '1'
    const tokenID1 = await talentir.contentIdToTokenId(contentID1)

    await expect(
      talentir.mint(luki.address, cid1, contentID1, luki.address)
    ).to.be.revertedWith('Not allowed')

    await expect(
      talentir.connect(luki).setMinterRole(minter.address)
    ).to.be.revertedWith('Ownable: caller is not the owner')
    await talentir.setMinterRole(minter.address)

    await expect(
      talentir
        .connect(minter)
        .mint(luki.address, cid1, contentID1, luki.address)
    ).to.emit(talentir, 'TransferSingle')

    const balance = await talentir.balanceOf(luki.address, tokenID1)
    expect(balance).to.equal(1000000)

    await expect(
      talentir
        .connect(minter)
        .mint(luki.address, cid1, contentID1, luki.address)
    ).to.be.revertedWith('Token already minted')

    await expect(
      talentir.connect(luki).burn(luki.address, tokenID1, 1000)
    ).to.be.revertedWith('Ownable: caller is not the owner')

    await talentir.burn(luki.address, tokenID1, 1000)

    const balance2 = await talentir.balanceOf(luki.address, tokenID1)
    expect(balance2).to.equal(999000)
  })

  it('Marketplace address', async function () {
    const cid1 = 'QmPxtVYgecSPTrnkZxjP3943ue3uizWtywzH7U9QwkLHU1'
    const contentID1 = '1'
    const tokenID1 = await talentir.contentIdToTokenId(contentID1)

    await talentir.setMinterRole(minter.address)
    await talentir
      .connect(minter)
      .mint(luki.address, '', contentID1, ethers.constants.AddressZero)

    await expect(
      talentir
        .connect(johnny)
        .safeTransferFrom(luki.address, johnny.address, tokenID1, 1, '0x')
    ).to.be.revertedWith('ERC1155: caller is not token owner nor approved')

    await expect(
      talentir.connect(luki).setNftMarketplaceApproval(johnny.address, true)
    ).to.be.revertedWith('Ownable: caller is not the owner')

    await talentir.setNftMarketplaceApproval(johnny.address, true)

    await talentir
      .connect(johnny)
      .safeTransferFrom(luki.address, johnny.address, tokenID1, 1, '0x')

    const balance = await talentir.balanceOf(johnny.address, tokenID1)
    expect(balance).to.equal(1)
  })

  it('Approval', async function () {
    const cid1 = 'QmPxtVYgecSPTrnkZxjP3943ue3uizWtywzH7U9QwkLHU1'
    const contentID1 = '1'
    const tokenID1 = await talentir.contentIdToTokenId(contentID1)

    await talentir.setMinterRole(minter.address)
    await talentir
      .connect(minter)
      .mint(luki.address, '', contentID1, ethers.constants.AddressZero)

    await expect(
      talentir
        .connect(johnny)
        .safeTransferFrom(luki.address, johnny.address, tokenID1, 1, '0x')
    ).to.be.revertedWith('ERC1155: caller is not token owner nor approved')

    await talentir.connect(luki).setApprovalForAll(johnny.address, true)

    await talentir
      .connect(johnny)
      .safeTransferFrom(luki.address, johnny.address, tokenID1, 1, '0x')

    const balance = await talentir.balanceOf(johnny.address, tokenID1)
    expect(balance).to.equal(1)
  })

  it('Royalties', async function () {
    const contentID = 'contentID'
    const tokenID1 = await talentir.contentIdToTokenId(contentID)

    await talentir.setMinterRole(minter.address)

    await expect(
      talentir.connect(minter).mint(luki.address, '', contentID, johnny.address)
    )
      .to.emit(talentir, 'TalentChanged')
      .withArgs(ethers.constants.AddressZero, johnny.address, tokenID1)

    const result = await talentir.royaltyInfo(tokenID1, 100)
    expect(result[0]).to.equal(johnny.address)
    expect(result[1]).to.equal(10)

    // // Fail for non-existing royalty info
    await expect(talentir.connect(luki).royaltyInfo(1, 100)).to.be.reverted

    await expect(
      talentir.connect(minter).setRoyalty(15_000)
    ).to.be.revertedWith('Ownable: caller is not the owner')
    await expect(talentir.setRoyalty(101_000)).to.be.revertedWith(
      'Must be <= 100%'
    )

    await talentir.setRoyalty(15_000)

    const result2 = await talentir.royaltyInfo(tokenID1, 100)
    expect(result2[0]).to.equal(johnny.address)
    expect(result2[1]).to.equal(15)

    await expect(talentir.updateTalent(tokenID1, luki.address)).to.be.reverted
    await expect(talentir.connect(luki).updateTalent(tokenID1, luki.address)).to
      .be.reverted

    // // Only the current royalty receiver can update update
    await expect(talentir.connect(johnny).updateTalent(tokenID1, luki.address))
      .to.emit(talentir, 'TalentChanged')
      .withArgs(johnny.address, luki.address, tokenID1)
  })

  it('Pause', async function () {
    const cid1 = 'QmPxtVYgecSPTrnkZxjP3943ue3uizWtywzH7U9QwkLHU1'
    const cid2 = 'QmPRRnZcj3PeWi8nDnM94KnbfsW5pscoY16B25YxCd7NWA'
    const contentID1 = '1'
    const contentID2 = '2'
    const tokenID1 = await talentir.contentIdToTokenId(contentID1)

    await talentir.setMinterRole(minter.address)

    await talentir
      .connect(minter)
      .mint(johnny.address, cid1, contentID1, ethers.constants.AddressZero)

    await expect(talentir.connect(minter).pause()).to.be.revertedWith(
      'Ownable: caller is not the owner'
    )
    await talentir.pause()

    // Mint should fail
    await expect(
      talentir
        .connect(minter)
        .mint(johnny.address, cid2, contentID2, ethers.constants.AddressZero)
    ).to.be.revertedWith('Pausable: paused')

    // Transfer should fail
    await expect(
      talentir
        .connect(johnny)
        .safeTransferFrom(johnny.address, luki.address, tokenID1, 1, '0x')
    ).to.be.revertedWith('Pausable: paused')

    //   // Burn should fail
    await expect(talentir.burn(johnny.address, tokenID1, 1)).to.be.revertedWith(
      'Pausable: paused'
    )

    await talentir.unpause()

    //   // Mint should now work
    await expect(
      talentir
        .connect(minter)
        .mint(luki.address, cid2, contentID2, ethers.constants.AddressZero)
    ).not.to.be.reverted
  })

  it('Interface', async function () {
    const data: BytesLike[] = []
    data.push('0x01ffc9a7') // IERC165
    data.push('0xd9b67a26') // IERC1155
    data.push('0x2a55205a') // IERC2981

    for (const dataElement of data) {
      expect(await talentir.supportsInterface(dataElement)).to.be.equal(true)
    }
  })

  it('Set Talent', async function () {
    const contentID = 'contentID'
    const tokenID1 = await talentir.contentIdToTokenId(contentID)

    await talentir.setMinterRole(minter.address)

    await expect(
      talentir.connect(minter).mint(luki.address, '', contentID, johnny.address)
    )
      .to.emit(talentir, 'TalentChanged')
      .withArgs(ethers.constants.AddressZero, johnny.address, tokenID1)

    await expect(
      talentir.connect(luki).updateTalent(tokenID1, luki.address)
    ).to.be.revertedWith('Royalty receiver must update')

    await expect(
      talentir.updateTalent(tokenID1, luki.address)
    ).to.be.revertedWith('Royalty receiver must update')

    await expect(talentir.connect(johnny).updateTalent(tokenID1, luki.address))
      .to.emit(talentir, 'TalentChanged')
      .withArgs(johnny.address, luki.address, tokenID1)
  })
})
