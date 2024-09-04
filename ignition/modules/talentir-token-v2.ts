import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const proxyModule = buildModule("ProxyModule", (m) => {
    const deployer = m.getAccount(0);
    const talentirContractV2 = m.contract("TalentirTokenV2");

    const initialize = m.encodeFunctionCall(talentirContractV2, 'initialize', [
        deployer,
        deployer
    ]);

    const proxy = m.contract("TransparentUpgradeableProxy", [
        talentirContractV2,
        deployer,
        initialize,
    ]);

    const proxyAdminAddress = m.readEventArgument(
        proxy,
        "AdminChanged",
        "newAdmin"
    );

    const proxyAdmin = m.contractAt("ProxyAdmin", proxyAdminAddress);

    return { talentirContractV2, proxy, proxyAdmin };
});

const talentirModule = buildModule("TalentirModule", (m) => {
    const { proxy, proxyAdmin } = m.useModule(proxyModule);

    const talentirToken = m.contractAt("TalentirTokenV2", proxy);

    return { talentirToken, proxy, proxyAdmin };
});

export default talentirModule;
