import * as hre from 'hardhat'
import * as fs from 'fs'
import { TransactionResponse } from '@ethersproject/abstract-provider'

export function deploymentPath (contractName: string): string {
  const projectRoot = hre.config.paths.root
  const network = hre.network.name
  const deploymentsPath = projectRoot + '/deployments'
  const deploymentPath = deploymentsPath + '/' + contractName + '/' + network
  let index = 0
  while (fs.existsSync(deploymentPath + '/' + index.toString())) {
    index += 1
  }

  const path = deploymentPath + '/' + index.toString()
  fs.mkdirSync(path, { recursive: true })

  return path
}

export async function verifyEtherscan (address: string, deployResponse: TransactionResponse): Promise<void> {
  if (hre.network.name === 'localhost' || hre.network.name === 'hahrdhat') {
    return
  }

  try {
    console.log('Waiting for 5 confirmations...')
    await deployResponse.wait(5)
    await hre.run('verify:verify', { address: address })
    console.log('Verified on Etherscan!')
  } catch (error) {
    console.log('Couldnt verify on Etherscan:\n', error)
  }
}
