// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155SupplyUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract TalentirTokenV2 is
    Initializable,
    ERC1155Upgradeable,
    AccessControlUpgradeable,
    ERC1155PausableUpgradeable,
    ERC1155SupplyUpgradeable
{
    /// @notice Role to mint new tokens.
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @notice The total amount of tokens per token ID.
    uint256 public constant TOKEN_FRACTIONS = 1_000_000;

    /// @custom:oz-upgrades-unsafe-allow constructor.
    constructor() {
        _disableInitializers();
    }

    /// @notice Initialize the contract with the default admin and minter roles.
    /// @param defaultAdmin The address that will be granted the DEFAULT_ADMIN_ROLE.
    /// @param minter The address that will be granted the MINTER_ROLE.
    function initialize(
        address defaultAdmin,
        address minter
    ) public initializer {
        __ERC1155_init("https://talentir.com/api/token/{id}.json");
        __AccessControl_init();
        __ERC1155Pausable_init();
        __ERC1155Supply_init();

        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(MINTER_ROLE, minter);
    }

    /// @notice Set the Base URI for all token types.
    /// @param newUri The new Base URI.
    function setURI(string memory newUri) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _setURI(newUri);
    }

    /// @notice Pause the contract.
    function pause() public onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /// @notice Unpause the contract.
    function unpause() public onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// @notice Mint a new token with an uint256 ID.
    /// @param account The address to mint the token to.
    /// @param tokenId By convention @contentIdToTokenId is used to generate the tokenId.
    /// @param data additional data to pass during the minting of the token.
    function mint(
        address account,
        uint256 tokenId,
        bytes memory data
    ) public onlyRole(MINTER_ROLE) {
        require(totalSupply(tokenId) == 0, "Token already minted");

        _mint(account, tokenId, TOKEN_FRACTIONS, data);
    }

    /// @notice Batch mint an ID to a list of addresses.
    /// @param accounts The addresses to mint the tokens to.
    /// @param tokenId The token ID to mint.
    /// @param amounts The amounts to mint. These need to add up to TOKEN_FRACTIONS.
    function batchMint(
        address[] memory accounts,
        uint256 tokenId,
        uint256[] memory amounts
    ) public onlyRole(MINTER_ROLE) {
        require(totalSupply(tokenId) == 0, "Token already minted");
        require(accounts.length == amounts.length, "Array length mismatch");

        for (uint256 i = 0; i < accounts.length; i++) {
            _mint(accounts[i], tokenId, amounts[i], "");
        }

        require(totalSupply(tokenId) == TOKEN_FRACTIONS, "Amounts mismatch");
    }

    /// @notice The admin is allowed to burn tokens. Either all tokens of a certain ID are burned or none.
    /// @param accounts The accounts to burn the tokens from.
    /// @param id The token ID to burn.
    /// @param amounts The amounts to burn. These need to add up to TOKEN_FRACTIONS.
    function burn(
        address[] memory accounts,
        uint256 id,
        uint256[] memory amounts
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        for (uint256 i = 0; i < accounts.length; i++) {
            _burn(accounts[i], id, amounts[i]);
        }

        // Either all tokens of a certain ID are burned or none
        require(totalSupply(id) == 0, "Token not burned");
    }

    /// @notice A pure function to calculate the tokenId from a given unique contentId.
    /// @param contentId Must be a unique identifier of the original content (such as a Youtube video ID).
    /// @return The tokenId for the given contentId.
    function contentIdToTokenId(
        string memory contentId
    ) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked((contentId))));
    }

    // The following functions are overrides required by Solidity.

    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    )
        internal
        override(
            ERC1155Upgradeable,
            ERC1155PausableUpgradeable,
            ERC1155SupplyUpgradeable
        )
    {
        super._update(from, to, ids, values);
    }

    function supportsInterface(
        bytes4 interfaceId
    )
        public
        view
        override(ERC1155Upgradeable, AccessControlUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
