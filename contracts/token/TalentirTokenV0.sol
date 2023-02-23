// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./../utils/ERC2981.sol";
import "operator-filter-registry/src/DefaultOperatorFilterer.sol";

/// @custom:security-contact office@talentir.com
contract TalentirTokenV0 is ERC1155(""), ERC2981, DefaultOperatorFilterer, Ownable, Pausable {
    // - MEMBERS
    mapping(address => bool) public approvedMarketplaces;
    mapping(uint256 => string) private _tokenCIDs; // storing the IPFS CIDs
    address private _minterAddress;
    uint256 public constant TOKEN_FRACTIONS = 1_000_000;

    // - EVENTS
    event MarketplaceApproved(address marketplaceAddress, bool approved);
    event RoyaltyPercentageChanged(uint256 percent);
    event TalentChanged(address from, address to, uint256 tokenID);

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
        require(percent <= 10_000, "Must be <= 10%");
        _royaltyPercent = percent;
        emit RoyaltyPercentageChanged(percent);
    }

    function setMinterRole(address minterAddress) public onlyOwner {
        _minterAddress = minterAddress;
    }

    /**
     * @notice Approve a new Marketplace Contract so users need less gas when selling and buying NFTs
     * on the Talentir contract.
     */
    function approveNftMarketplace(address marketplace, bool approval) public onlyOwner {
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
    ) public onlyMinter whenNotPaused {
        uint256 tokenId = contentIdToTokenId(contentID);
        require(bytes(_tokenCIDs[tokenId]).length == 0, "Token already minted");
        _tokenCIDs[tokenId] = cid;
        _setTalent(tokenId, royaltyReceiver);
        _mint(to, tokenId, TOKEN_FRACTIONS, "");
    }

    function uri(uint256 tokenId) public view override returns (string memory) {
        return string(abi.encodePacked("ipfs://", _tokenCIDs[tokenId]));
    }

    // - PUBLIC FUNCTIONS

    function updateTalent(uint256 tokenId, address talent) public {
        address currentReceiver = _talents[tokenId];
        require(currentReceiver == msg.sender, "Royalty receiver must update");
        _setTalent(tokenId, talent);
    }

    function _setTalent(uint256 tokenID, address talent) internal {
        address from = _talents[tokenID];
        _talents[tokenID] = talent;
        emit TalentChanged(from, talent, tokenID);
    }

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
    function isApprovedForAll(address localOwner, address operator) public view virtual override returns (bool) {
        return approvedMarketplaces[operator] == true || super.isApprovedForAll(localOwner, operator);
    }

    function batchTransfer(
        address from,
        address[] memory to,
        uint256 id,
        uint256[] memory amounts,
        bytes memory data
    ) public onlyAllowedOperator(from) whenNotPaused {
        require(from == _msgSender() || isApprovedForAll(from, _msgSender()), "Caller is not token owner or approved");
        require(to.length == amounts.length, "Invalid array length");

        for (uint i = 0; i < to.length; i++) {
            _safeTransferFrom(from, to[i], id, amounts[i], data);
        }
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC1155, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    modifier onlyMinter() {
        require(_msgSender() == _minterAddress, "Not allowed");
        _;
    }

    // Functions to implement OpenSea's RevokableDefaultOperatorFilterer
    function setApprovalForAll(
        address operator,
        bool approved
    ) public override whenNotPaused onlyAllowedOperatorApproval(operator) {
        super.setApprovalForAll(operator, approved);
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId,
        uint256 amount,
        bytes memory data
    ) public override onlyAllowedOperator(from) whenNotPaused {
        super.safeTransferFrom(from, to, tokenId, amount, data);
    }

    function safeBatchTransferFrom(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) public virtual override onlyAllowedOperator(from) whenNotPaused {
        super.safeBatchTransferFrom(from, to, ids, amounts, data);
    }
}
