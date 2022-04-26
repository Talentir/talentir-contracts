import { ethers } from 'hardhat'

import { TalentirNFT__factory } from '../deployments/TalentirNFT/localhost/0/types'
import talentirNFTData from '../deployments/TalentirNFT/localhost/0/data.json'

import { TalentirMarketplace__factory } from '../deployments/TalentirMarketplace/localhost/0/types'
import talentirMarketplaceData from '../deployments/TalentirMarketplace/localhost/0/data.json'

async function main (): Promise<void> {
  const signer = await ethers.getSigners()
  const talentirNFTFactory = new TalentirNFT__factory(signer[0])
  const talentirNFT = talentirNFTFactory.attach(talentirNFTData.address)

  const talentirMarketplaceFactory = new TalentirMarketplace__factory(signer[0])
  const talentirMarketplace = talentirMarketplaceFactory.attach(talentirMarketplaceData.address)

  await talentirNFT.approvedMarketplaces(talentirMarketplaceData.address)
  console.log('TalentirNFT: Approved marketplace: ', talentirMarketplaceData.address)

  await talentirMarketplace.approvedNftContracts(talentirNFTData.address)
  console.log('TalentirMarketplace: Approved NFT: ', talentirNFTData.address)

  // Grant the Google KMS the Minter Role
  const googleKmsPublicAddress = '0x257a6cc682eb2546e3f7a7b81b3cf3fcf5d884bb'
  await talentirNFT.grantRole(await talentirNFT.MINTER_ROLE(), googleKmsPublicAddress)
  console.log('TalentirNFT: Granted Minter Role to: ', googleKmsPublicAddress)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
