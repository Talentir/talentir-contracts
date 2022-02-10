// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from 'hardhat'
import * as hre from 'hardhat'
import * as fs from 'fs'
import { execSync } from 'child_process'

async function main (): Promise<void> {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // We get the contract to deploy
  const TalentirNFT = await ethers.getContractFactory('TalentirNFT')
  const talentirNFT = await TalentirNFT.deploy()

  await talentirNFT.deployed()

  console.log('Talentir deployed to:', talentirNFT.address)

  const projectRoot = hre.config.paths.root
  const artifactFolder = hre.config.paths.artifacts
  const network = hre.network.name
  const deploymentsPath = projectRoot + '/deployments'
  const deploymentPath = deploymentsPath + '/' + network
  let index = 0
  while (fs.existsSync(deploymentPath + '/' + index.toString())) {
    index += 1
  }

  const currentDeploymentPath = deploymentPath + '/' + index.toString()
  fs.mkdirSync(currentDeploymentPath, { recursive: true })

  fs.mkdirSync(currentDeploymentPath + '/contracts')
  fs.copyFileSync(artifactFolder + '/contracts/TalentirNFT.sol/TalentirNFT.json',
    currentDeploymentPath + '/contracts/TalentirNFT.json')

  // Create Datafile
  const jsonData = JSON.stringify({
    network: hre.network.name,
    address: talentirNFT.address,
    blockNumber: talentirNFT.deployTransaction.blockNumber
  }, null, 2)
  fs.writeFileSync(currentDeploymentPath + '/data.json', jsonData)

  // Execute typechain
  const abiJson =
    currentDeploymentPath + '/contracts/TalentirNFT.json'
  const outDir = currentDeploymentPath + '/types'
  execSync(
    'npx typechain --target=ethers-v5 ' + abiJson + ' --out-dir ' + outDir
  )
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
