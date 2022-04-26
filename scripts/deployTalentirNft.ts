import { ethers } from 'hardhat'
import * as hre from 'hardhat'
import * as fs from 'fs'
import { execSync } from 'child_process'
import { deploymentPath } from './utils/deploymentPath'

async function main (): Promise<void> {
  const TalentirNFT = await ethers.getContractFactory('TalentirNFT')
  const talentirNFT = await TalentirNFT.deploy()
  const talentirNFTReceipt = await talentirNFT.deployTransaction.wait()
  console.log('TalentirNFT deployed to: ', talentirNFT.address,
    ' on block: ', talentirNFTReceipt.blockNumber)

  // Save deployment
  const currentDeploymentPath = deploymentPath('TalentirNFT')

  console.log(currentDeploymentPath)

  fs.mkdirSync(currentDeploymentPath, { recursive: true })

  // Create Datafile which contains deployment info
  const jsonData = JSON.stringify({
    network: hre.network.name,
    address: talentirNFT.address,
    blockNumber: talentirNFTReceipt.blockNumber
  }, null, 2)
  fs.writeFileSync(currentDeploymentPath + '/data.json', jsonData)

  const contractsFolder = hre.config.paths.artifacts + '/contracts'
  const talentirNftAbi = contractsFolder + '/TalentirNFT.sol/TalentirNFT.json'

  // Execute typechain
  const outDir = currentDeploymentPath + '/types'
  execSync(
    'npx typechain --target=ethers-v5 ' + talentirNftAbi + ' --out-dir ' + outDir
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
