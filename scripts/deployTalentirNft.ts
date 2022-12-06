import { ethers } from 'hardhat'
import { verifyEtherscan } from './utils'

async function main (): Promise<void> {
  const TalentirNFT = await ethers.getContractFactory('TalentirTokenV0')
  const talentirNFT = await TalentirNFT.deploy()
  const talentirNFTReceipt = await talentirNFT.deployTransaction.wait()
  console.log('TalentirNFT deployed to: ', talentirNFT.address,
    ' on block: ', talentirNFTReceipt.blockNumber)

  await verifyEtherscan(talentirNFT.address, talentirNFT.deployTransaction)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
