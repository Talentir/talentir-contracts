import {
    time,
    loadFixture,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { getAddress, parseGwei } from "viem";
import talentirModule from "../ignition/modules/talentir-token-v2";

describe("Lock", function () {
    // We define a fixture to reuse the same setup in every test.
    // We use loadFixture to run this setup once, snapshot that state,
    // and reset Hardhat Network to that snapshot in every test.
    async function deployTalentirTokenFixture() {
        const { talentirToken, proxy } = await hre.ignition.deploy(talentirModule)
        console.log("talentirToken", talentirToken.address, proxy.address);

        // Contracts are deployed using the first signer/account by default
        const [owner, otherAccount] = await hre.viem.getWalletClients();

        const publicClient = await hre.viem.getPublicClient();

        return {
            talentirToken,
            owner,
            otherAccount,
            publicClient,
        };
    }

    describe("Deployment", function () {
        it("Should set the right unlockTime", async function () {
            const { talentirToken } = await loadFixture(deployTalentirTokenFixture);
            console.log(await talentirToken.read.URI_SETTER_ROLE())
        });
    });

    describe("Withdrawals", function () {
        describe("Validations", function () {
            it("Should revert with the right error if called too soon", async function () {
                const { talentirToken } = await loadFixture(deployTalentirTokenFixture);
            });
        });
    });
});
