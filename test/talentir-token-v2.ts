import { loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { fromHex, keccak256, toHex } from "viem";
import talentirModule from "../ignition/modules/talentir-token-v2";

describe("Lock", () => {
    // We define a fixture to reuse the same setup in every test.
    // We use loadFixture to run this setup once, snapshot that state,
    // and reset Hardhat Network to that snapshot in every test.
    async function deployTalentirTokenFixture() {
        // Contracts are deployed using the first signer/account by default
        const [owner, otherAccount, thirdAccount] = await hre.viem.getWalletClients();
        const { talentirToken, proxy } = await hre.ignition.deploy(talentirModule, {
            defaultSender: thirdAccount.account.address,
        });

        const publicClient = await hre.viem.getPublicClient();

        return {
            talentirToken,
            owner,
            otherAccount,
            publicClient,
        };
    }

    describe("Deployment", () => {
        it("Revert duplciate mint", async () => {
            const { talentirToken, owner } = await loadFixture(deployTalentirTokenFixture);

            await expect(talentirToken.write.mint([owner.account.address, 0n, "0x"])).not.to.be.rejected;
            await expect(talentirToken.write.mint([owner.account.address, 0n, "0x"])).to.be.rejectedWith(
                "Token already minted",
            );

            await talentirToken.write.revokeRole([await talentirToken.read.MINTER_ROLE(), owner.account.address]);
            await expect(talentirToken.write.mint([owner.account.address, 1n, "0x"])).to.be.rejected;
        });

        it("URI", async () => {
            const { talentirToken, owner, otherAccount } = await loadFixture(deployTalentirTokenFixture);

            await expect(talentirToken.write.mint([owner.account.address, 0n, "0x"])).not.to.be.rejected;

            const uri = await talentirToken.read.uri([0n]);
            expect(uri).to.be.equal("https://talentir.com/api/token/{id}.json");

            await expect(talentirToken.write.setURI(["https://talentir.com/api/new/{id}.json"])).not.to.be.rejected;
            const uri2 = await talentirToken.read.uri([0n]);
            expect(uri2).to.be.equal("https://talentir.com/api/new/{id}.json");

            // Change roles
            await talentirToken.write.grantRole([
                await talentirToken.read.DEFAULT_ADMIN_ROLE(),
                otherAccount.account.address,
            ]);
            await talentirToken.write.grantRole([await talentirToken.read.MINTER_ROLE(), otherAccount.account.address]);
            await talentirToken.write.revokeRole([await talentirToken.read.MINTER_ROLE(), owner.account.address]);
            await talentirToken.write.revokeRole([
                await talentirToken.read.DEFAULT_ADMIN_ROLE(),
                owner.account.address,
            ]);

            await expect(talentirToken.write.setURI(["https://talentir.com/api/bla/{id}.json"])).to.be.rejectedWith();
        });

        it("Pause / Unpuase", async () => {
            const { talentirToken, owner, otherAccount } = await loadFixture(deployTalentirTokenFixture);

            await expect(talentirToken.write.pause()).not.to.be.rejected;

            // try mint
            await expect(talentirToken.write.mint([owner.account.address, 0n, "0x"])).to.be.rejected;

            await expect(talentirToken.write.unpause()).not.to.be.rejected;

            // Change roles
            await talentirToken.write.grantRole([
                await talentirToken.read.DEFAULT_ADMIN_ROLE(),
                otherAccount.account.address,
            ]);
            await talentirToken.write.grantRole([await talentirToken.read.MINTER_ROLE(), otherAccount.account.address]);
            await talentirToken.write.revokeRole([await talentirToken.read.MINTER_ROLE(), owner.account.address]);
            await talentirToken.write.revokeRole([
                await talentirToken.read.DEFAULT_ADMIN_ROLE(),
                owner.account.address,
            ]);

            await expect(talentirToken.write.pause()).to.be.rejected;
            await expect(talentirToken.write.unpause()).to.be.rejected;
        });

        it("Bach Mint", async () => {
            const { talentirToken, owner, otherAccount } = await loadFixture(deployTalentirTokenFixture);

            await expect(talentirToken.write.batchMint([[owner.account.address], 0n, [1_000_000n]])).not.to.be.rejected;
            await expect(talentirToken.write.batchMint([[owner.account.address], 0n, [1_000_000n]])).to.be.rejected;

            await expect(
                talentirToken.write.batchMint([
                    [owner.account.address, otherAccount.account.address],
                    1n,
                    [950_000n, 50_000n],
                ]),
            ).not.to.be.rejected;

            await expect(
                talentirToken.write.batchMint([
                    [owner.account.address, otherAccount.account.address],
                    2n,
                    [950_000n, 50_001n],
                ]),
            ).to.be.rejectedWith("Amounts mismatch");

            await expect(
                talentirToken.write.batchMint([
                    [owner.account.address, otherAccount.account.address],
                    2n,
                    [950_000n, 50_000n, 1n],
                ]),
            ).to.be.rejectedWith("Array length mismatch");

            await talentirToken.write.revokeRole([await talentirToken.read.MINTER_ROLE(), owner.account.address]);
            await expect(talentirToken.write.batchMint([[owner.account.address], 1n, [1_000_000n]])).to.be.rejected;
        });

        it("Test Burn", async () => {
            const { talentirToken, owner, otherAccount } = await loadFixture(deployTalentirTokenFixture);

            await expect(talentirToken.write.mint([owner.account.address, 0n, "0x"])).not.to.be.rejected;

            // transfer
            await expect(
                talentirToken.write.safeTransferFrom([
                    owner.account.address,
                    otherAccount.account.address,
                    0n,
                    500_000n,
                    "0x",
                ]),
            ).not.to.be.rejected;

            // Try incomplete burn
            await expect(talentirToken.write.burn([[owner.account.address], 0n, [500_000n]])).to.be.rejectedWith(
                "Token not burned",
            );

            // Burn
            await expect(
                talentirToken.write.burn([
                    [owner.account.address, otherAccount.account.address],
                    0n,
                    [500_000n, 500_000n],
                ]),
            ).not.to.be.rejected;

            // Try mint after burn
            await expect(talentirToken.write.mint([owner.account.address, 0n, "0x"])).not.to.be.rejected;

            await talentirToken.write.revokeRole([
                await talentirToken.read.DEFAULT_ADMIN_ROLE(),
                owner.account.address,
            ]);
            await expect(talentirToken.write.burn([[owner.account.address], 0n, [1_000_000n]])).to.be.rejected;
        });

        it("Content ID to Token ID", async () => {
            const { talentirToken } = await loadFixture(deployTalentirTokenFixture);
            const tokenId = await talentirToken.read.contentIdToTokenId(["asdf"]);
            const tokenIdReference = fromHex(keccak256(toHex("asdf")), "bigint");

            expect(tokenId).to.be.equal(tokenIdReference);
        });

        it("supports interface", async () => {
            const data: `0x${string}`[] = [];
            data.push("0x01ffc9a7"); // IERC165
            data.push("0xd9b67a26"); // IERC1155

            const { talentirToken } = await loadFixture(deployTalentirTokenFixture);
            for (const dataElement of data) {
                expect(await talentirToken.read.supportsInterface([dataElement])).to.be.equal(true);
            }
        });
    });
});
