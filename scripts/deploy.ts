// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from "hardhat";
import * as hre from "hardhat";
import * as fs from "fs";
import * as path from "path";
import "child_process"
import { exec, execSync } from "child_process";

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');
  

  // We get the contract to deploy
  const Talentir = await ethers.getContractFactory("Talentir");
  const talentir = await Talentir.deploy();

  await talentir.deployed();

  console.log("Talentir deployed to:", talentir.address);

  const projectRoot = hre.config.paths.root;
  const artifactFolder = hre.config.paths.artifacts;
  const network = hre.network.name;
  const deploymentsPath = projectRoot + "/deployments";
  const deploymentPath = deploymentsPath + "/" + network;
  let index = 0;
  while(fs.existsSync(deploymentPath + "/" + index)) {
    index += 1;
  }

  const currentDeploymentPath = deploymentPath + "/" + index;
  fs.mkdirSync(currentDeploymentPath, {recursive: true});

  // Copy ABI Files
  copyDir(artifactFolder + "/contracts", currentDeploymentPath + "/contracts");

  interface Data {
    network: string,
    address: string
  }

  // Create Datafile
  var jsonData = JSON.stringify({network: hre.network.name, address: talentir.address}, null, 2);
  fs.writeFileSync(currentDeploymentPath + "/data.json", jsonData);

  const abiJson = currentDeploymentPath + "/contracts/Talentir.sol/Talentir.json";
  const outDir = currentDeploymentPath + "/types";
  execSync("npx typechain --target=ethers-v5 " + abiJson + " --out-dir " + outDir);
}

function copyDir(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  let entries = fs.readdirSync(src, { withFileTypes: true });

  for (let entry of entries) {
      let srcPath = path.join(src, entry.name);
      let destPath = path.join(dest, entry.name);

      entry.isDirectory() ?
          copyDir(srcPath, destPath) :
          fs.copyFileSync(srcPath, destPath);
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
