import { ethers } from 'hardhat'
import * as hre from 'hardhat'
import * as fs from 'fs'
import { execSync } from 'child_process'
import { verifyEtherscan, deploymentPath } from './utils'

async function main (): Promise<void> {
  const TalentirMarketplace = await ethers.getContractFactory('TalentirMarketplace')
  const talentirMarketplace = await TalentirMarketplace.deploy()
  const talentirMarketplaceReceipt = await talentirMarketplace.deployTransaction.wait()
  console.log('TalentirMarketplace deployed to:', talentirMarketplace.address,
    ' on block: ', talentirMarketplaceReceipt.blockNumber)

  // Save deployment
  const currentDeploymentPath = deploymentPath('TalentirMarketplace')

  console.log('Deployment Path: ', currentDeploymentPath)

  // Create Datafile which contains deployment info
  const jsonData = JSON.stringify({
    network: hre.network.name,
    address: talentirMarketplace.address,
    blockNumber: talentirMarketplaceReceipt.blockNumber
  }, null, 2)
  fs.writeFileSync(currentDeploymentPath + '/data.json', jsonData)

  const contractsFolder = hre.config.paths.artifacts + '/contracts'
  const talentirMarketplaceAbi = contractsFolder + '/TalentirMarketplace.sol/TalentirMarketplace.json'

  // Execute typechain
  const outDir = currentDeploymentPath + '/types'
  execSync(
    'npx typechain --target=ethers-v5 ' + talentirMarketplaceAbi + ' --out-dir ' + outDir
  )

  await verifyEtherscan(talentirMarketplace.address, talentirMarketplace.deployTransaction)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
