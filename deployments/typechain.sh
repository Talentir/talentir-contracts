#!/usr/bin/env bash

DIR=/hardhat/3
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
echo "$SCRIPT_DIR"

npx typechain --target=ethers-v5 ${SCRIPT_DIR}${DIR}/contracts/Talentir.sol/Talentir.json --out-dir ${SCRIPT_DIR}${DIR}/types