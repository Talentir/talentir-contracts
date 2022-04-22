// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./utils/ERC721Royalty.sol";

/// @custom:security-contact jk@talentir.com
contract TalentirNFT is ERC721, ERC721URIStorage, ERC721Royalty, AccessControl, Pausable {
    // - MEMBERS
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    mapping(address => bool) public approvedMarketplaces;

    constructor() ERC721("Talentir", "TAL") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
    }

    // - ADMIN FUNCTIONS
    // At the beginning, these are centralized with Talentir but should be handled by the
    // DAO in the future.

    /**
     * @notice Pauses the transfer, minting and burning of Tokens. This is a security measure and
     * allows disabling the contract when migrating to a new version.
     */
    function pause(bool shouldPause) public onlyRole(DEFAULT_ADMIN_ROLE) {
        if (shouldPause) {
            _pause();
        } else {
            _unpause();
        }
    }

    /**
     * @notice Changing the royalty percentage of every sale. Should be handled by the DAO in the
     * future.
     */
    function setRoyalty(uint16 percentage) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _royaltyPercentage = percentage;
    }

    /**
     * @notice Approve a new Marketplace Contract so users need less gas when selling and buying NFTs
     * on the Talentir contract.
     */
    function setNftMarketplaceApproval(address marketplace, bool approval) public onlyRole(DEFAULT_ADMIN_ROLE) {
        approvedMarketplaces[marketplace] = approval;
    }

    // - MINTER_ROLE FUNCTIONS

    /**
     * @notice Safely mint a new token. The tokenId is calculated from the keccak256
     * hash of the provided contentID. This ensures that no duplicate content can be
     * minted.
     */
    function mint(
        address to,
        string memory cid,
        string memory contentID,
        address royaltyReceiver
    ) public onlyRole(MINTER_ROLE) {
        uint256 tokenId = contentIdToTokenId(contentID);
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, cid);
        _setRoyaltyReceiver(tokenId, royaltyReceiver);
    }

    function burn(uint256 tokenID) public onlyRole(MINTER_ROLE) {
        _burn(tokenID);
    }

    // - PUBLIC FUNCTIONS

    /**
     * @notice A pure function to calculate the tokenID from a given unique contentID. A contentID
     * must be a unique identifier of the original content (such as a Youtube video ID)
     */
    function contentIdToTokenId(string memory contentID) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked((contentID))));
    }

    // - UTILITY
    // @notice Makre sure Token Transfers are impossible when paused.
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal override whenNotPaused {
        super._beforeTokenTransfer(from, to, tokenId);
    }

    /**
     * @notice Make sure the Talentir Marketplce is always approved to trade.
     */
    function isApprovedForAll(address owner, address operator) public view virtual override returns (bool) {
        return approvedMarketplaces[operator] == true || super.isApprovedForAll(owner, operator);
    }

    // - OVERRIDES
    // @notice The following functions are overrides required by Solidity.

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage, ERC721Royalty) {
        super._burn(tokenId);
    }

    function _baseURI() internal pure override returns (string memory) {
        return "ipfs://";
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Royalty, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
