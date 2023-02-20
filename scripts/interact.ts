import { ethers } from 'hardhat'
import { TalentirMarketplaceV0__factory, TalentirTokenV0__factory } from '../typechain-types'

async function main (): Promise<void> {
  const tokenAddress = '0x2195A9306d1B4Bb0B8d8709D4921f992a6a9D9a2'
  const marketplaceAddress = '0xa8251C1b5011C2EAfAE40653109EEa970D7a12A1'

  const signer = await ethers.getSigners()
  const talentirNFTFactory = new TalentirTokenV0__factory(signer[0])
  const talentirNFT = talentirNFTFactory.attach(tokenAddress)

  const talentirMarketplaceFactory = new TalentirMarketplaceV0__factory(signer[0])
  const talentirMarketplace = talentirMarketplaceFactory.attach(marketplaceAddress)

  const tx1 = await talentirNFT.setNftMarketplaceApproval(marketplaceAddress, true)
  console.log('TalentirNFT: Approved marketplace: ', marketplaceAddress, ' tx:', tx1.hash)

  // Grant the Openzeppelin Relay the Minter Role
  const relayAddres = '0x79e08374a52c6e917c7b4808559b17a9f606d9b0'
  const tx3 = await talentirNFT.setMinterRole(relayAddres)
  console.log('TalentirNFT: Granted Minter Role to: ', relayAddres, ' tx:', tx3.hash)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
