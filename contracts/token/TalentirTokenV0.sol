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
    mapping(uint256 => bool) public isOnPresale;
    mapping(address => bool) internal hasGlobalPresaleAllowance;
    mapping(address => mapping(uint256 => bool)) internal hasTokenPresaleAllowance;

    // - EVENTS
    event MarketplaceApproved(address marketplaceAddress, bool approved);
    event RoyaltyPercentageChanged(uint256 percent);
    event TalentChanged(address from, address to, uint256 tokenID);
    event GlobalPresaleAllowanceSet(address user, bool allowance);
    event TokenPresaleAllowanceSet(address user, uint256 id, bool allowance);
    event PresaleEnded(uint256 tokenId);

    // - MODIFIERS
    modifier onlyMinter() {
        require(_msgSender() == _minterAddress, "Not allowed");
        _;
    }

    modifier onlyNoPresaleOrAllowed(address sender, uint256 tokenId) {
        require(_isNoPresaleOrAllowed(sender, tokenId), "Not allowed in presale");
        _;
    }

    // - PUBLIC FUNCTIONS
    function uri(uint256 tokenId) public view override returns (string memory) {
        return string(abi.encodePacked("ipfs://", _tokenCIDs[tokenId]));
    }

    /**
     * @notice A pure function to calculate the tokenID from a given unique contentID. A contentID
     * must be a unique identifier of the original content (such as a Youtube video ID)
     */
    function contentIdToTokenId(string memory contentID) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked((contentID))));
    }

    /**
     * @notice Make sure the Talentir Marketplce is always approved to trade.
     */
    function isApprovedForAll(address localOwner, address operator) public view virtual override returns (bool) {
        return approvedMarketplaces[operator] == true || super.isApprovedForAll(localOwner, operator);
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC1155, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    // - TALENT FUNCTIONS
    function updateTalent(uint256 tokenId, address talent) public {
        address currentTalent = _talents[tokenId];
        require(currentTalent == msg.sender, "Talent must update");
        _setTalent(tokenId, talent);
    }

    function _setTalent(uint256 tokenID, address talent) internal {
        address from = _talents[tokenID];
        _talents[tokenID] = talent;
        emit TalentChanged(from, talent, tokenID);
    }

    // - ONLYOWNER FUNCTIONS
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
     * @param talent The address to receive the trading royalty for the token.
     */
    function mint(
        address to,
        string memory cid,
        string memory contentID,
        address talent
    ) public onlyMinter whenNotPaused {
        uint256 tokenId = contentIdToTokenId(contentID);
        require(bytes(_tokenCIDs[tokenId]).length == 0, "Token already minted");
        _tokenCIDs[tokenId] = cid;
        _setTalent(tokenId, talent);
        _mint(to, tokenId, TOKEN_FRACTIONS, "");
    }

    /**
     * @notice Safely mint a new token with Presale. During presale, the Talentir can add
     * addresses to the presale.
     * @param to The address to mint the token to.
     * @param cid IPFS CID of the content
     * @param contentID unique content ID, such as unique Youtube ID
     * @param talent The address to receive the trading royalty for the token.
     */
    function mintWithPresale(
        address to,
        string memory cid,
        string memory contentID,
        address talent
    ) public onlyMinter whenNotPaused {
        uint256 tokenId = contentIdToTokenId(contentID);
        isOnPresale[tokenId] = true;
        mint(to, cid, contentID, talent);
    }

    /**
     * @notice Set the global presale allowance for a user. This allows the user to buy any token
     * on presale.
     * @param user The user to set the allowance for.
     * @param allowance The allowance to set.
     */
    function setGlobalPresaleAllowance(address user, bool allowance) public onlyMinter {
        require(hasGlobalPresaleAllowance[user] != allowance, "Already set");
        hasGlobalPresaleAllowance[user] = allowance;
        emit GlobalPresaleAllowanceSet(user, allowance);
    }

    /**
     * @notice Set the presale allowance for a user for a specific token. This allows the user to buy
     * a specific token on presale.
     * @param user The user to set the allowance for.
     * @param tokenId The token to set the allowance for.
     */
    function setTokenPresaleAllowance(address user, uint256 tokenId, bool allowance) public onlyMinter {
        require(hasTokenPresaleAllowance[user][tokenId] != allowance, "Already set");
        hasTokenPresaleAllowance[user][tokenId] = allowance;
        emit TokenPresaleAllowanceSet(user, tokenId, allowance);
    }

    /**
     * @notice End the presale for a token, so token can be transferred to anyone, presale can't be
     * turned back on for the token
     * @param tokenId The token to end the presale for.
     */
    function endPresale(uint256 tokenId) public onlyMinter {
        require(isOnPresale[tokenId], "Already ended");
        isOnPresale[tokenId] = false;
        emit PresaleEnded(tokenId);
    }

    // - ONLYOPERATOR FUNCTIONS
    // Functions to implement OpenSea's DefaultOperatorFilterer
    function setApprovalForAll(
        address operator,
        bool approved
    ) public override whenNotPaused onlyAllowedOperatorApproval(operator) {
        super.setApprovalForAll(operator, approved);
    }

    function batchTransfer(
        address from,
        address[] memory to,
        uint256 id,
        uint256[] memory amounts,
        bytes memory data
    ) public onlyAllowedOperator(from) whenNotPaused onlyNoPresaleOrAllowed(from, id) {
        require(from == _msgSender() || isApprovedForAll(from, _msgSender()), "Caller is not token owner or approved");
        require(to.length == amounts.length, "Invalid array length");

        for (uint i = 0; i < to.length; i++) {
            _safeTransferFrom(from, to[i], id, amounts[i], data);
        }
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId,
        uint256 amount,
        bytes memory data
    ) public override onlyAllowedOperator(from) whenNotPaused onlyNoPresaleOrAllowed(from, tokenId) {
        super.safeTransferFrom(from, to, tokenId, amount, data);
    }

    function safeBatchTransferFrom(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) public virtual override onlyAllowedOperator(from) whenNotPaused {
        for (uint i = 0; i < ids.length; i++) {
            require(_hasNoPresaleOrAllowed(from, ids[i]), "Not allowed in presale");
        }
        super.safeBatchTransferFrom(from, to, ids, amounts, data);
    }

    function _hasNoPresaleOrAllowed(address sender, uint256 tokenId) internal view returns (bool) {
        if (!isOnPresale[tokenId]) {
            return true;
        }

        if (hasGlobalPresaleAllowance[sender]) {
            return true;
        }

        if (hasTokenPresaleAllowance[sender][tokenId]) {
            return true;
        }

        return false;
    }
}
