import * as hre from 'hardhat'
import * as fs from 'fs'

export function deploymentPath (contractName: string): string {
  const projectRoot = hre.config.paths.root
  const network = hre.network.name
  const deploymentsPath = projectRoot + '/deployments'
  const deploymentPath = deploymentsPath + '/' + contractName + '/' + network
  let index = 0
  while (fs.existsSync(deploymentPath + '/' + index.toString())) {
    index += 1
  }
  return deploymentPath + '/' + index.toString()
}
