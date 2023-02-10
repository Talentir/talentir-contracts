import { ethers } from 'hardhat'
import { verifyEtherscan } from './utils'

async function main (): Promise<void> {
  const nftAddress = '0x2195A9306d1B4Bb0B8d8709D4921f992a6a9D9a2'
  const TalentirMarketplace = await ethers.getContractFactory(
    'TalentirMarketplaceV0'
  )
  const talentirMarketplace = await TalentirMarketplace.deploy(nftAddress)
  const talentirMarketplaceReceipt =
    await talentirMarketplace.deployTransaction.wait()
  console.log(
    'TalentirMarketplace deployed to:',
    talentirMarketplace.address,
    ' on block: ',
    talentirMarketplaceReceipt.blockNumber
  )

  await verifyEtherscan(
    talentirMarketplace.address,
    talentirMarketplace.deployTransaction,
    [nftAddress]
  )
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
