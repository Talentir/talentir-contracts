import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { ethers } from 'hardhat'
import { BytesLike } from 'ethers'

// eslint-disable-next-line
import { TalentirNFT } from "../typechain-types";

// Reference : https://ethereum-waffle.readthedocs.io/en/latest/matchers.html
describe('TalentirNFT', function () {
  let admin: SignerWithAddress
  let account1: SignerWithAddress
  let account2: SignerWithAddress
  let account3: SignerWithAddress
  let talentir: TalentirNFT

  beforeEach(async function () {
    const Talentir = await ethers.getContractFactory('TalentirNFT')
    talentir = await Talentir.deploy()
    await talentir.deployed();

    [admin, account1, account2, account3] = await ethers.getSigners()
  })

  it('Role: Minter / Admin', async function () {
    const minterRole = await talentir.MINTER_ROLE()
    const adminRole = await talentir.DEFAULT_ADMIN_ROLE()

    await expect(talentir.connect(account1)
      .mint(account1.address, '', 'abcd', ethers.constants.AddressZero)).to.be.reverted

    await talentir.grantRole(minterRole, account1.address)

    await expect(talentir.connect(account1).mint(account1.address, '', 'abcd', ethers.constants.AddressZero))
      .to.not.be.reverted

    const tokenID = await talentir.contentIdToTokenId('abcd')
    await expect(talentir.connect(account1).burn(tokenID))
      .to.not.be.reverted

    // Minter
    expect(await talentir.hasRole(minterRole, account1.address)).to.equal(true)
    expect(await talentir.hasRole(adminRole, account1.address)).to.equal(false)

    // Admin
    expect(await talentir.hasRole(adminRole, admin.address)).to.be.equal(true)
    expect(await talentir.hasRole(minterRole, admin.address)).to.equal(true)

    expect(await talentir.hasRole(adminRole, account2.address)).to.equal(false)
    expect(await talentir.hasRole(minterRole, account2.address)).to.equal(false)
  })

  it('Token URI to Token ID', async function () {
    const tokenCID = '230r9jsaldkfjlksdfjFOI#)(RSADF<CV><XMCV>'
    const tokenIDRef = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(tokenCID))
    const tokenID = (await talentir.contentIdToTokenId(tokenCID)).toString()
    expect(tokenID === tokenIDRef)
  })

  it('Marketplace address', async function () {
    const contentID = 'ABCD1234'
    const tokenID1 = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(contentID))

    await talentir.mint(account1.address, '', contentID, ethers.constants.AddressZero)

    await expect(talentir.connect(account3).transferFrom(account1.address, account2.address, tokenID1))
      .to.be.reverted

    await talentir.setNftMarketplaceApproval(account3.address, true)

    await expect(talentir.connect(account3).transferFrom(account1.address, account2.address, tokenID1))
      .to.not.be.reverted

    expect((await talentir.ownerOf(tokenID1)) === account2.address)
  })

  it('Minting', async function () {
    const cid1 = 'QmPxtVYgecSPTrnkZxjP3943ue3uizWtywzH7U9QwkLHU1'
    const cid2 = 'QmPRRnZcj3PeWi8nDnM94KnbfsW5pscoY16B25YxCd7NWA'
    const contentID1 = '1'
    const contentID2 = '2'
    const tokenID1 = await talentir.contentIdToTokenId(contentID1)
    const tokenID2 = await talentir.contentIdToTokenId(contentID2)

    // Mint uri1 for account 1.
    await expect(talentir.mint(account1.address, cid1, contentID1, ethers.constants.AddressZero))
      .to.emit(talentir, 'Transfer')
      .withArgs(ethers.constants.AddressZero, account1.address, tokenID1)
      .to.not.emit(talentir, 'Approval')

    // Check if tokens exist and URI is correct.
    expect(await talentir.tokenURI(tokenID1)).to.equal('ipfs://' + cid1)
    await expect(talentir.tokenURI(tokenID2)).to.be.reverted

    // Try minting same contentID again. It should revert.
    await expect(talentir.mint(account2.address, cid2, contentID1, ethers.constants.AddressZero))
      .to.be.revertedWith('ERC721: token already minted')

    // Mint for account 2.
    await expect(talentir.mint(account2.address, cid2, contentID2, ethers.constants.AddressZero))
      .to.emit(talentir, 'Transfer')
      .withArgs(ethers.constants.AddressZero, account2.address, tokenID2)

    // // Check if tokens exist and URI is correct.
    expect(await talentir.tokenURI(tokenID1)).to.equal('ipfs://' + cid1)
    expect(await talentir.tokenURI(tokenID2)).to.equal('ipfs://' + cid2)
  })

  it('Burning', async function () {
    const cid1 = 'QmPxtVYgecSPTrnkZxjP3943ue3uizWtywzH7U9QwkLHU1'
    const contentID1 = '1'
    const tokenID1 = await talentir.contentIdToTokenId(contentID1)

    // Mint uri1 for account 1.
    await talentir.mint(account1.address, cid1, contentID1, ethers.constants.AddressZero)

    // Owner can't burn
    await expect(talentir.connect(account1).burn(tokenID1))
      .to.be.reverted

    // Admin can burn
    await expect(talentir.burn(tokenID1))
      .not.to.be.reverted
  })

  it('Transfer', async function () {
    const cid1 = 'QmPxtVYgecSPTrnkZxjP3943ue3uizWtywzH7U9QwkLHU1'
    const cid2 = 'QmPRRnZcj3PeWi8nDnM94KnbfsW5pscoY16B25YxCd7NWA'
    const contentID1 = '1'
    const contentID2 = '2'
    const tokenID1 = await talentir.contentIdToTokenId(contentID1)
    const tokenID2 = await talentir.contentIdToTokenId(contentID2)

    await talentir.mint(account1.address, cid1, contentID1, ethers.constants.AddressZero)
    await talentir.mint(account2.address, cid2, contentID2, ethers.constants.AddressZero)

    // Admin shouldn't be allowed to transfer NFTs.
    await expect(talentir.transferFrom(account2.address, account1.address, tokenID2))
      .to.be.reverted
    // account1 is also not owner, so shouldn't be allowed to transfer.
    await expect(talentir.connect(account1).transferFrom(account2.address, account1.address, tokenID2))
      .to.be.reverted

    await expect(talentir.connect(account2).transferFrom(account2.address, account1.address, tokenID2))
      .to.emit(talentir, 'Transfer')
      .withArgs(account2.address, account1.address, tokenID2)

    // Approve account3 so transfer for account1
    await expect(talentir.connect(account1).setApprovalForAll(account3.address, true))
      .to.emit(talentir, 'ApprovalForAll')
      .withArgs(account1.address, account3.address, true)

    // account3 is transfering tokenID1  to account2.
    await expect(talentir.connect(account3).transferFrom(account1.address, account2.address, tokenID1))
      .to.emit(talentir, 'Transfer')
  })

  it('Royalties', async function () {
    const contentID = 'contentID'
    const tokenID1 = await talentir.contentIdToTokenId(contentID)

    await expect(talentir.mint(account1.address, '', contentID, account2.address))
      .to.emit(talentir, 'UpdateRoyaltyReceiver')
      .withArgs(ethers.constants.AddressZero, account2.address, tokenID1)

    const result = await talentir.royaltyInfo(tokenID1, 100)
    expect(result[0]).to.equal(account2.address)
    expect(result[1]).to.equal(10)

    // Fail for non-existing royalty info
    await expect(talentir.connect(account1).royaltyInfo(1, 100))
      .to.be.reverted

    await expect(talentir.updateRoyaltyReceiver(tokenID1, account3.address)).to.be.reverted
    await expect(talentir.connect(account1).updateRoyaltyReceiver(tokenID1, account3.address))
      .to.be.reverted

    // Only the current royalty receiver can update update
    await expect(talentir.connect(account2).updateRoyaltyReceiver(tokenID1, account3.address))
      .to.emit(talentir, 'UpdateRoyaltyReceiver')
      .withArgs(account2.address, account3.address, tokenID1).and.not.to.be
      .reverted
  })

  it('Interface', async function () {
    const data: BytesLike[] = []
    data.push('0x01ffc9a7') // IERC165
    data.push('0x80ac58cd') // IERC721
    data.push('0x5b5e139f') // IERC721Metadata
    data.push('0x2a55205a') // IERC2981
    data.push('0x7965db0b') // IAccessControl

    for (const dataElement of data) {
      expect(await talentir.supportsInterface(dataElement)).to.be.equal(true)
    }
  })

  it('Pause', async function () {
    const cid1 = 'QmPxtVYgecSPTrnkZxjP3943ue3uizWtywzH7U9QwkLHU1'
    const cid2 = 'QmPRRnZcj3PeWi8nDnM94KnbfsW5pscoY16B25YxCd7NWA'
    const contentID1 = '1'
    const contentID2 = '2'
    const tokenID1 = await talentir.contentIdToTokenId(contentID1)

    // Mint works
    await expect(talentir.mint(account1.address, cid1, contentID1, ethers.constants.AddressZero))
      .not.to.be.reverted

    await talentir.pause(true)

    // Mint should fail
    await expect(talentir.mint(account2.address, cid2, contentID2, ethers.constants.AddressZero))
      .to.be.revertedWith('Pausable: paused')

    // Transfer should fail
    await expect(talentir.connect(account1).transferFrom(account1.address, account3.address, tokenID1))
      .to.be.revertedWith('Pausable: paused')

    // Burn should fail
    await expect(talentir.burn(tokenID1))
      .to.be.revertedWith('Pausable: paused')

    await talentir.pause(false)

    // Mint should now work
    await expect(talentir.mint(account2.address, cid2, contentID2, ethers.constants.AddressZero))
      .not.to.be.reverted
  })
})
