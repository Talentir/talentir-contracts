// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./utils/ERC721Royalty.sol";

/// @custom:security-contact security@talentir.com
contract TalentirNFT is ERC721, ERC721URIStorage, ERC721Burnable, ERC721Royalty, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    constructor() ERC721("Talentir", "TAL") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
    }

    function _baseURI() internal pure override returns (string memory) {
        return "ipfs://";
    }

    function setRoyalty(uint16 percentage) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _royaltyPercentage = percentage;
    }

    address public marketplaceAddress;

    function setMarketplaceAddress(address newAddress) public onlyRole(DEFAULT_ADMIN_ROLE) {
        marketplaceAddress = newAddress;
    }

    /**
     * Safely mint a new token. The tokenId is calculated from the keccak256
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

    function isApprovedForAll(address owner, address operator) public view virtual override returns (bool) {
        return marketplaceAddres == operator || super.isApprovedForAll(owner, operator);
    }

    /** 
     * A pure function to calculate the tokenID from a given unique contentID. A contentID
     * must be a unique identifier of the original content (such as a Youtube video ID)
     */
    function contentIdToTokenId(string memory contentID) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked((contentID))));
    }

    // The following functions are overrides required by Solidity.
    function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage, ERC721Royalty) {
        super._burn(tokenId);
    }

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
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
