import { ethers } from 'hardhat'

import { TalentirNFT__factory } from '../deployments/TalentirNFT/rinkeby/0/types'
import talentirNFTData from '../deployments/TalentirNFT/rinkeby/0/data.json'

import { TalentirMarketplace__factory } from '../deployments/TalentirMarketplace/rinkeby/0/types'
import talentirMarketplaceData from '../deployments/TalentirMarketplace/rinkeby/0/data.json'

async function main (): Promise<void> {
  const signer = await ethers.getSigners()
  const talentirNFTFactory = new TalentirNFT__factory(signer[0])
  const talentirNFT = talentirNFTFactory.attach(talentirNFTData.address)

  const talentirMarketplaceFactory = new TalentirMarketplace__factory(signer[0])
  const talentirMarketplace = talentirMarketplaceFactory.attach(talentirMarketplaceData.address)

  const tx1 = await talentirNFT.setNftMarketplaceApproval(talentirMarketplaceData.address, true)
  console.log('TalentirNFT: Approved marketplace: ', talentirMarketplaceData.address, ' tx:', tx1.hash)

  const tx2 = await talentirMarketplace.setNftContractApproval(talentirNFTData.address, true)
  console.log('TalentirMarketplace: Approved NFT: ', talentirNFTData.address, ' tx:', tx2.hash)

  // Grant the Google KMS the Minter Role
  const googleKmsPublicAddress = '0x257a6cc682eb2546e3f7a7b81b3cf3fcf5d884bb'
  const tx3 = await talentirNFT.grantRole(await talentirNFT.MINTER_ROLE(), googleKmsPublicAddress)
  console.log('TalentirNFT: Granted Minter Role to: ', googleKmsPublicAddress, ' tx:', tx3.hash)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
