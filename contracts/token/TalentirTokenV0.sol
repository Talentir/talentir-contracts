// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./../utils/ERC2981.sol";

/// @custom:security-contact office@talentir.com
contract TalentirTokenV0 is ERC1155(""), ERC2981, Ownable, Pausable {
    // - MEMBERS
    mapping(address => bool) public approvedMarketplaces;
    mapping(uint256 => string) private _tokenCIDs; // storing the IPFS CIDs
    address private _minterAddress;

    // - EVENTS
    event MarketplaceApproved(address marketplaceAddress, bool approved);

    // - ADMIN FUNCTIONS
    // At the beginning, these are centralized with Talentir but should be handled by the
    // DAO in the future.

    /**
     * @notice Pauses the transfer, minting and burning of Tokens. This is a security measure and
     * allows disabling the contract when migrating to a new version.
     */
    function pause() external onlyOwner {
        _pause();
    }

    /// @dev Unpause contract.
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Changing the royalty percentage of every sale. 1% = 1_000
     */
    function setRoyalty(uint256 percent) public onlyOwner {
        require(percent <= 100_000, "Must be <= 100%");
        _setRoyaltyPercent(percent);
    }

    function setMinterRole(address minterAddress) public onlyOwner {
        _minterAddress = minterAddress;
    }

    /**
     * @notice Approve a new Marketplace Contract so users need less gas when selling and buying NFTs
     * on the Talentir contract.
     */
    function setNftMarketplaceApproval(address marketplace, bool approval) public onlyOwner {
        approvedMarketplaces[marketplace] = approval;
        emit MarketplaceApproved(marketplace, approval);
    }

    // - MINTER_ROLE FUNCTIONS

    /**
     * @notice Safely mint a new token. The tokenId is calculated from the keccak256
     * hash of the provided contentID. This ensures that no duplicate content can be
     * minted.
     * @param to The address to mint the token to.
     * @param cid IPFS CID of the content
     * @param contentID unique content ID, such as unique Youtube ID
     * @param royaltyReceiver The address to receive the royalty for the token.
     */
    function mint(
        address to, // the address to mint the token to
        string memory cid, // the IPFS CID of the content
        string memory contentID,
        address royaltyReceiver // the address to receive the royalty
    ) public onlyMinter {
        uint256 tokenId = contentIdToTokenId(contentID);
        require(bytes(_tokenCIDs[tokenId]).length == 0, "Token already minted");
        _mint(to, tokenId, 1000000, "");
        _tokenCIDs[tokenId] = cid;
        _setTalent(tokenId, royaltyReceiver);
    }

    /**
     * @notice Burn a token. This is only possible for the owner of the token.
     */
    function burn(address account, uint256 tokenID, uint256 value) public virtual onlyOwner {
        _burn(account, tokenID, value);
    }

    function uri(uint256 tokenId) public view override returns (string memory) {
        return string(abi.encodePacked("ipfs://", _tokenCIDs[tokenId]));
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

    /**
     * @notice Make sure the Talentir Marketplce is always approved to trade.
     */
    function isApprovedForAll(address owner, address operator) public view virtual override returns (bool) {
        return approvedMarketplaces[operator] == true || super.isApprovedForAll(owner, operator);
    }

    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal override whenNotPaused {
        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC1155, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    modifier onlyMinter() {
        require(_msgSender() == _minterAddress, "Not allowed");
        _;
    }
}
