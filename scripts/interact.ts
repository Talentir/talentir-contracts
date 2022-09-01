import { ethers } from 'hardhat'

import { TalentirNFT__factory } from '../deployments/TalentirNFT/goerli/1/types'
import talentirNFTData from '../deployments/TalentirNFT/goerli/1/data.json'

// import { TalentirMarketplace__factory } from '../deployments/TalentirMarketplace/rinkeby/0/types'
// import talentirMarketplaceData from '../deployments/TalentirMarketplace/rinkeby/0/data.json'

async function main (): Promise<void> {
  const signer = await ethers.getSigners()
  const talentirNFTFactory = new TalentirNFT__factory(signer[0])
  const talentirNFT = talentirNFTFactory.attach(talentirNFTData.address)

  // const talentirMarketplaceFactory = new TalentirMarketplace__factory(signer[0])
  // const talentirMarketplace = talentirMarketplaceFactory.attach(talentirMarketplaceData.address)

  // const tx1 = await talentirNFT.setNftMarketplaceApproval(talentirMarketplaceData.address, true)
  // console.log('TalentirNFT: Approved marketplace: ', talentirMarketplaceData.address, ' tx:', tx1.hash)

  // const tx2 = await talentirMarketplace.setNftContractApproval(talentirNFTData.address, true)
  // console.log('TalentirMarketplace: Approved NFT: ', talentirNFTData.address, ' tx:', tx2.hash)

  // Grant the Openzeppelin Relay the Minter Role
  const relayAddres = '0x79e08374a52c6e917c7b4808559b17a9f606d9b0'
  const tx3 = await talentirNFT.setMinterRole(relayAddres)
  console.log('TalentirNFT: Granted Minter Role to: ', relayAddres, ' tx:', tx3.hash)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
