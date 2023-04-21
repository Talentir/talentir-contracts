import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { BytesLike } from 'ethers'
import { ethers } from 'hardhat'

// eslint-disable-next-line
import { TalentirTokenV1 } from "../typechain-types";

// Reference : https://ethereum-waffle.readthedocs.io/en/latest/matchers.html
describe('Talentir Token Tests', function () {
  let admin: SignerWithAddress
  let minter: SignerWithAddress
  let luki: SignerWithAddress
  let johnny: SignerWithAddress
  let talentir: TalentirTokenV1

  beforeEach(async function () {
    const Talentir = await ethers.getContractFactory('TalentirTokenV1')
    talentir = await Talentir.deploy()
    await talentir.deployed();

    [admin, minter, luki, johnny] = await ethers.getSigners()

    await talentir.setMinterRole(minter.address, [])
  })

  it('Uri', async function () {
    const cid1 = 'QmPxtVYgecSPTrnkZxjP3943ue3uizWtywzH7U9QwkLHU1'
    const contentID1 = '1'
    const tokenID1 = await talentir.contentIdToTokenId(contentID1)

    await talentir.setMinterRole(minter.address, [])
    await talentir
      .connect(minter)
      .mint(luki.address, cid1, contentID1, luki.address, false)

    const uri = await talentir.uri(tokenID1)
    expect(uri).to.equal(`ipfs://${cid1}`)
  })

  it('disallows interactions from unpermitted accounts', async function () {
    const cid1 = 'QmPxtVYgecSPTrnkZxjP3943ue3uizWtywzH7U9QwkLHU1'
    const contentID1 = '1'

    await expect(
      talentir.mint(luki.address, cid1, contentID1, luki.address, false)
    ).to.be.revertedWith('Not allowed')

    await expect(
      talentir.setMinterRole(ethers.constants.AddressZero, [])
    ).to.be.revertedWith('Minter is zero')

    await expect(
      talentir.connect(luki).setMinterRole(minter.address, [])
    ).to.be.revertedWith('Ownable: caller is not the owner')

    await expect(talentir.setMinterRole(luki.address, []))
      .to.emit(talentir, 'MinterRoleChanged')
      .withArgs(minter.address, luki.address)
  })

  it('mints', async function () {
    const cid1 = 'QmPxtVYgecSPTrnkZxjP3943ue3uizWtywzH7U9QwkLHU1'
    const cid2 = 'QmPxtVYgecSPTrnkZxjP3943ue3uizWtywzH7U9QwkLHU2'
    const contentID1 = '1'
    const tokenID1 = await talentir.contentIdToTokenId(contentID1)

    await expect(
      talentir
        .connect(minter)
        .mint(luki.address, cid1, contentID1, ethers.constants.AddressZero, false)
    ).to.be.revertedWith('Talent is zero')

    await expect(
      talentir
        .connect(minter)
        .mint(luki.address, cid1, '', luki.address, false)
    ).to.be.revertedWith('contentID is empty')

    await expect(
      talentir
        .connect(minter)
        .mint(luki.address, '', contentID1, luki.address, false)
    ).to.be.revertedWith('cid is empty')

    await expect(
      talentir
        .connect(minter)
        .mint(ethers.constants.AddressZero, cid1, contentID1, luki.address, false)
    ).to.be.revertedWith('ERC1155: mint to the zero address')

    await expect(
      talentir
        .connect(minter)
        .mint(luki.address, cid1, contentID1, luki.address, false)
    ).to.emit(talentir, 'TransferSingle')

    const balance = await talentir.balanceOf(luki.address, tokenID1)
    expect(balance).to.equal(1_000_000)

    await expect(
      talentir
        .connect(minter)
        .mint(luki.address, cid2, contentID1, luki.address, false)
    ).to.be.revertedWith('Token already minted')

    await expect(
      talentir
        .connect(minter)
        .mint(luki.address, cid1, contentID1, luki.address, false)
    ).to.be.revertedWith('Token CID already used')
  })

  it('can approve a marketplace & minter to transfer tokens', async function () {
    const contentID1 = '1'
    const tokenID1 = await talentir.contentIdToTokenId(contentID1)

    await talentir.setMinterRole(minter.address, [])

    await expect(
      talentir.setMarketplace(ethers.constants.AddressZero, [])
    ).to.be.revertedWith('Marketplace is zero')

    await expect(
      talentir.connect(luki).setMarketplace(johnny.address, [])
    ).to.be.revertedWith('Ownable: caller is not the owner')

    await expect(talentir.setMarketplace(johnny.address, []))
      .to.emit(talentir, 'MarketplaceChanged')
      .withArgs(ethers.constants.AddressZero, johnny.address)

    await talentir
      .connect(minter)
      .mint(luki.address, 'a', contentID1, luki.address, false)

    await talentir
      .connect(johnny)
      .safeTransferFrom(luki.address, johnny.address, tokenID1, 1, '0x')

    const balance = await talentir.balanceOf(johnny.address, tokenID1)
    expect(balance).to.equal(1)

    // Unapprove marketplace for Luki
    await talentir.setMarketplace(johnny.address, [luki.address])

    // Marketplace can no longer transfer
    await expect(
      talentir
        .connect(johnny)
        .safeTransferFrom(luki.address, johnny.address, tokenID1, 1, '0x')
    )
      .to.be.revertedWith('ERC1155: caller is not token owner or approved')

    // Minter can also transfer
    await talentir
      .connect(minter)
      .safeTransferFrom(luki.address, johnny.address, tokenID1, 1, '0x')

    const balance2 = await talentir.balanceOf(johnny.address, tokenID1)
    expect(balance2).to.equal(2)

    // Unapprove minter
    await talentir.setMinterRole(minter.address, [luki.address])

    // Minter can no longer transfer
    await expect(
      talentir
        .connect(minter)
        .safeTransferFrom(luki.address, johnny.address, tokenID1, 1, '0x')
    )
      .to.be.revertedWith('ERC1155: caller is not token owner or approved')
  })

  it('can approve an account to transfer tokens', async function () {
    const contentID1 = '1'
    const tokenID1 = await talentir.contentIdToTokenId(contentID1)

    await talentir.setMinterRole(minter.address, [])
    await talentir
      .connect(minter)
      .mint(luki.address, 'a', contentID1, luki.address, false)

    await expect(
      talentir
        .connect(johnny)
        .safeTransferFrom(luki.address, johnny.address, tokenID1, 1, '0x')
    ).to.be.revertedWith('ERC1155: caller is not token owner or approved')

    await talentir.connect(luki).setApprovalForAll(johnny.address, true)

    await talentir
      .connect(johnny)
      .safeTransferFrom(luki.address, johnny.address, tokenID1, 1, '0x')

    const balance = await talentir.balanceOf(johnny.address, tokenID1)
    expect(balance).to.equal(1)
  })

  it('pays out royalties', async function () {
    const contentID = 'contentID'
    const tokenID1 = await talentir.contentIdToTokenId(contentID)

    await talentir.setMinterRole(minter.address, [])

    await expect(
      talentir.connect(minter).mint(luki.address, 'a', contentID, johnny.address, false)
    )
      .to.emit(talentir, 'TalentChanged')
      .withArgs(ethers.constants.AddressZero, johnny.address, tokenID1)

    const result = await talentir.royaltyInfo(tokenID1, 1000)
    expect(result[0]).to.equal(johnny.address)
    expect(result[1]).to.equal(75)

    // // Fail for non-existing royalty info
    await expect(talentir.connect(luki).royaltyInfo(1, 100)).to.be.reverted

    await expect(
      talentir.connect(minter).setRoyalty(15_000)
    ).to.be.revertedWith('Ownable: caller is not the owner')
    await expect(talentir.setRoyalty(10_001)).to.be.revertedWith(
      'Must be <= 10%'
    )

    await talentir.setRoyalty(10_000)

    const result2 = await talentir.royaltyInfo(tokenID1, 100)
    expect(result2[0]).to.equal(johnny.address)
    expect(result2[1]).to.equal(10)

    await expect(talentir.updateTalent(tokenID1, luki.address)).to.be.reverted
    await expect(talentir.connect(luki).updateTalent(tokenID1, luki.address)).to
      .be.reverted

    // // Only the current royalty receiver can update update
    await expect(talentir.connect(johnny).updateTalent(tokenID1, luki.address))
      .to.emit(talentir, 'TalentChanged')
      .withArgs(johnny.address, luki.address, tokenID1)

    const talent = await talentir.talents(tokenID1)
    expect(talent).to.equal(luki.address)
  })

  it('allows pausing', async function () {
    const cid1 = 'QmPxtVYgecSPTrnkZxjP3943ue3uizWtywzH7U9QwkLHU1'
    const cid2 = 'QmPRRnZcj3PeWi8nDnM94KnbfsW5pscoY16B25YxCd7NWA'
    const contentID1 = '1'
    const contentID2 = '2'
    const contentID3 = '3'
    const tokenID1 = await talentir.contentIdToTokenId(contentID1)
    const tokenID2 = await talentir.contentIdToTokenId(contentID2)

    await talentir.setMinterRole(minter.address, [])

    await talentir
      .connect(minter)
      .mint(johnny.address, cid1, contentID1, johnny.address, false)

    await talentir
      .connect(minter)
      .mint(johnny.address, contentID3, contentID3, luki.address, false)

    await expect(talentir.connect(minter).pause()).to.be.revertedWith(
      'Ownable: caller is not the owner'
    )

    // Pause: everything should fail
    await talentir.pause()

    await expect(
      talentir
        .connect(minter)
        .mint(johnny.address, cid2, contentID2, johnny.address, false)
    ).to.be.revertedWith('Pausable: paused')

    await expect(
      talentir
        .connect(minter)
        .mint(johnny.address, cid2, contentID2, johnny.address, true)
    ).to.be.revertedWith('Pausable: paused')

    await expect(
      talentir
        .connect(johnny)
        .safeTransferFrom(johnny.address, luki.address, tokenID1, 1, '0x')
    ).to.be.revertedWith('Pausable: paused')

    await expect(
      talentir
        .connect(johnny)
        .batchTransfer(luki.address, [johnny.address, admin.address], tokenID1, [2, 3], '0x')
    ).to.be.revertedWith('Pausable: paused')

    await expect(
      talentir
        .connect(johnny)
        .safeBatchTransferFrom(luki.address, johnny.address, [tokenID1, tokenID2], [2, 3], '0x'))
      .to.be.revertedWith('Pausable: paused')

    await expect(talentir.setApprovalForAll(johnny.address, true)).to.be.revertedWith('Pausable: paused')
    // Only owner can unpause
    await expect(
      talentir
        .connect(johnny)
        .unpause()
    ).to.be.revertedWith('Ownable: caller is not the owner')

    await talentir.unpause()

    //   // Mint should now work
    await expect(
      talentir
        .connect(minter)
        .mint(luki.address, cid2, contentID2, luki.address, false)
    ).not.to.be.reverted
  })

  it('responds with its interfaces', async function () {
    const data: BytesLike[] = []
    data.push('0x01ffc9a7') // IERC165
    data.push('0xd9b67a26') // IERC1155
    data.push('0x2a55205a') // IERC2981

    for (const dataElement of data) {
      expect(await talentir.supportsInterface(dataElement)).to.be.equal(true)
    }
  })

  it('allows setting talents', async function () {
    const contentID = 'contentID'
    const tokenID1 = await talentir.contentIdToTokenId(contentID)

    await talentir.setMinterRole(minter.address, [])

    await expect(
      talentir.connect(minter).mint(luki.address, 'a', contentID, johnny.address, false)
    )
      .to.emit(talentir, 'TalentChanged')
      .withArgs(ethers.constants.AddressZero, johnny.address, tokenID1)

    await expect(
      talentir.connect(johnny).updateTalent(tokenID1, ethers.constants.AddressZero)
    ).to.be.revertedWith('Talent is zero')

    await expect(
      talentir.connect(luki).updateTalent(tokenID1, luki.address)
    ).to.be.revertedWith('Talent must update')

    await expect(
      talentir.updateTalent(tokenID1, luki.address)
    ).to.be.revertedWith('Talent must update')

    await expect(talentir.connect(johnny).updateTalent(tokenID1, luki.address))
      .to.emit(talentir, 'TalentChanged')
      .withArgs(johnny.address, luki.address, tokenID1)
  })

  it('makes batch transfers', async function () {
    // batch transfer of a single token to multiple wallets
    const cid1 = 'QmPxtVYgecSPTrnkZxjP3943ue3uizWtywzH7U9QwkLHU1'
    const contentID1 = '1'
    const tokenID1 = await talentir.contentIdToTokenId(contentID1)
    await expect(
      talentir
        .connect(minter)
        .mint(luki.address, cid1, contentID1, luki.address, false)
    ).to.emit(talentir, 'TransferSingle')

    await talentir
      .connect(luki)
      .batchTransfer(luki.address, [johnny.address, admin.address], tokenID1, [2, 3], '0x')

    expect(await talentir.balanceOf(luki.address, tokenID1)).to.equal(999_995)
    expect(await talentir.balanceOf(johnny.address, tokenID1)).to.equal(2)
    expect(await talentir.balanceOf(admin.address, tokenID1)).to.equal(3)

    // invalid calls fail
    await expect(
      talentir
        .connect(johnny)
        .batchTransfer(luki.address, [johnny.address, admin.address], tokenID1, [2, 3], '0x')
    ).to.be.revertedWith('Caller is not token owner or approved')

    await expect(
      talentir
        .connect(luki)
        .batchTransfer(luki.address, [johnny.address, admin.address], tokenID1, [2, 3, 4], '0x')
    ).to.be.revertedWith('Invalid array length')

    // batch transfer of a multiple tokens to a single wallet
    const contentID2 = '2'
    const tokenID2 = await talentir.contentIdToTokenId(contentID2)
    await expect(
      talentir
        .connect(minter)
        .mint(luki.address, contentID2, contentID2, luki.address, false)
    ).to.emit(talentir, 'TransferSingle')
    await talentir
      .connect(luki)
      .safeBatchTransferFrom(luki.address, johnny.address, [tokenID1, tokenID2], [2, 3], '0x')

    expect(await talentir.balanceOf(luki.address, tokenID1)).to.equal(999_993)
    expect(await talentir.balanceOf(johnny.address, tokenID1)).to.equal(4)
    expect(await talentir.balanceOf(luki.address, tokenID2)).to.equal(999_997)
    expect(await talentir.balanceOf(johnny.address, tokenID2)).to.equal(3)

    // approved sender can transfer
    await talentir.connect(luki).setApprovalForAll(johnny.address, true)

    await talentir
      .connect(johnny)
      .batchTransfer(luki.address, [johnny.address, admin.address], tokenID1, [1, 1], '0x')
  })

  it('handles minting with presale', async function () {
    const cid1 = 'QmPxtVYgecSPTrnkZxjP3943ue3uizWtywzH7U9QwkLHU1'
    const contentID1 = '1'
    const tokenID1 = await talentir.contentIdToTokenId(contentID1)
    const contentID2 = '2'
    const tokenID2 = await talentir.contentIdToTokenId(contentID2)

    await expect(
      talentir
        .mint(luki.address, cid1, contentID1, luki.address, true)
    ).to.be.revertedWith('Not allowed')

    await expect(
      talentir
        .connect(minter)
        .mint(luki.address, cid1, contentID1, luki.address, true)
    ).to.emit(talentir, 'TransferSingle')

    await expect(
      talentir
        .connect(minter)
        .mint(luki.address, contentID2, contentID2, luki.address, true)
    ).to.emit(talentir, 'TransferSingle')

    // Transfers should fail
    await expect(
      talentir
        .connect(luki)
        .safeTransferFrom(johnny.address, luki.address, tokenID1, 1, '0x')
    ).to.be.revertedWith('Not allowed in presale')

    await expect(
      talentir
        .connect(luki)
        .batchTransfer(luki.address, [johnny.address, admin.address], tokenID1, [2, 3], '0x')
    ).to.be.revertedWith('Not allowed in presale')

    await expect(
      talentir
        .connect(luki)
        .safeBatchTransferFrom(luki.address, johnny.address, [tokenID1, tokenID2], [2, 3], '0x')).to.be.revertedWith('Not allowed in presale')

    await expect(
      talentir
        .connect(minter)
        .setGlobalPresaleAllowance(ethers.constants.AddressZero, true)
    ).to.be.revertedWith('User is zero')

    // Only minter can set global presale allowance
    await expect(
      talentir
        .connect(luki)
        .setGlobalPresaleAllowance(luki.address, true)
    ).to.be.revertedWith('Not allowed')

    await expect(
      talentir
        .connect(minter)
        .setGlobalPresaleAllowance(luki.address, true)
    ).to.emit(talentir, 'GlobalPresaleAllowanceSet')

    // Transfers work now
    await talentir
      .connect(luki)
      .safeTransferFrom(luki.address, luki.address, tokenID1, 1, '0x')

    await talentir
      .connect(luki)
      .batchTransfer(luki.address, [luki.address, admin.address], tokenID1, [2, 3], '0x')

    await talentir
      .connect(luki)
      .safeBatchTransferFrom(luki.address, johnny.address, [tokenID1, tokenID2], [2, 3], '0x')

    // Remove global presale allowance
    await expect(
      talentir
        .connect(minter)
        .setGlobalPresaleAllowance(luki.address, true)
    ).to.be.revertedWith('Already set')

    await expect(
      talentir
        .connect(minter)
        .setGlobalPresaleAllowance(luki.address, false)
    ).to.emit(talentir, 'GlobalPresaleAllowanceSet')

    // Transfers fail again
    await expect(
      talentir
        .connect(luki)
        .safeTransferFrom(johnny.address, luki.address, tokenID1, 1, '0x')
    ).to.be.revertedWith('Not allowed in presale')

    await expect(
      talentir
        .connect(luki)
        .batchTransfer(luki.address, [johnny.address, admin.address], tokenID1, [2, 3], '0x')
    ).to.be.revertedWith('Not allowed in presale')

    await expect(
      talentir
        .connect(luki)
        .safeBatchTransferFrom(luki.address, johnny.address, [tokenID1, tokenID2], [2, 3], '0x')).to.be.revertedWith('Not allowed in presale')

    await expect(
      talentir
        .connect(minter)
        .setTokenPresaleAllowance(ethers.constants.AddressZero, tokenID1, true)
    ).to.be.revertedWith('User is zero')

    await expect(
      talentir
        .connect(minter)
        .setTokenPresaleAllowance(luki.address, 1234, true)
    ).to.be.revertedWith('tokenId not found')

    // Only minter can set token presale allowance
    await expect(
      talentir
        .connect(luki)
        .setTokenPresaleAllowance(luki.address, tokenID1, true)
    ).to.be.revertedWith('Not allowed')

    await expect(
      talentir
        .connect(minter)
        .setTokenPresaleAllowance(luki.address, tokenID1, true)
    ).to.emit(talentir, 'TokenPresaleAllowanceSet')

    await expect(
      talentir
        .connect(minter)
        .setTokenPresaleAllowance(luki.address, tokenID2, true)
    ).to.emit(talentir, 'TokenPresaleAllowanceSet')

    // Transfers work again
    await talentir
      .connect(luki)
      .safeTransferFrom(luki.address, luki.address, tokenID1, 1, '0x')

    await talentir
      .connect(luki)
      .batchTransfer(luki.address, [luki.address, admin.address], tokenID1, [2, 3], '0x')

    await talentir
      .connect(luki)
      .safeBatchTransferFrom(luki.address, johnny.address, [tokenID1, tokenID2], [2, 3], '0x')

    // Remove token presale allowance
    await expect(
      talentir
        .connect(minter)
        .setTokenPresaleAllowance(luki.address, tokenID1, true)
    ).to.be.revertedWith('Already set')

    await expect(
      talentir
        .connect(minter)
        .setTokenPresaleAllowance(luki.address, tokenID1, false)
    ).to.emit(talentir, 'TokenPresaleAllowanceSet')

    await expect(
      talentir
        .connect(minter)
        .setTokenPresaleAllowance(luki.address, tokenID2, false)
    ).to.emit(talentir, 'TokenPresaleAllowanceSet')

    // Transfers fail again
    await expect(
      talentir
        .connect(luki)
        .safeTransferFrom(johnny.address, luki.address, tokenID1, 1, '0x')
    ).to.be.revertedWith('Not allowed in presale')

    await expect(
      talentir
        .connect(luki)
        .batchTransfer(luki.address, [johnny.address, admin.address], tokenID1, [2, 3], '0x')
    ).to.be.revertedWith('Not allowed in presale')

    await expect(
      talentir
        .connect(luki)
        .safeBatchTransferFrom(luki.address, johnny.address, [tokenID1, tokenID2], [2, 3], '0x')).to.be.revertedWith('Not allowed in presale')

    // End presale
    await expect(
      talentir
        .endPresale(tokenID1)
    ).to.be.revertedWith('Not allowed')

    await expect(
      talentir
        .connect(minter)
        .endPresale(tokenID1)
    ).to.emit(talentir, 'PresaleEnded')

    await expect(
      talentir
        .connect(minter)
        .endPresale(tokenID2)
    ).to.emit(talentir, 'PresaleEnded')

    // Transfers work again
    await talentir
      .connect(luki)
      .safeTransferFrom(luki.address, luki.address, tokenID1, 1, '0x')

    await talentir
      .connect(luki)
      .batchTransfer(luki.address, [luki.address, admin.address], tokenID1, [2, 3], '0x')

    await talentir
      .connect(luki)
      .safeBatchTransferFrom(luki.address, johnny.address, [tokenID1, tokenID2], [2, 3], '0x')

    // Can't end presale again
    await expect(
      talentir
        .connect(minter)
        .endPresale(tokenID1)
    ).to.be.revertedWith('Already ended')
  })
})
