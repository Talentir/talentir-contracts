// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {TalentirERC2981} from "./utils/TalentirERC2981.sol";
import {DefaultOperatorFilterer} from "operator-filter-registry/src/DefaultOperatorFilterer.sol";

/// @title Talentir Token Contract
/// @author Christoph Siebenbrunner, Johannes Kares
/// @custom:security-contact office@talentir.com
contract TalentirTokenV1 is ERC1155(""), TalentirERC2981, DefaultOperatorFilterer, Ownable, Pausable {
    /// MEMBERS ///

    /// @notice tokenID => IPFS CID. Storing the IPFS CIDs
    mapping(uint256 => string) public tokenCIDs;

    /// @notice IPFS CID => exists. To check if a CID is already in use
    mapping(string => bool) public cids;

    /// @notice The address of the marketplace contract
    address public approvedMarketplace;

    /// @notice The address of the minter
    address public minterAddress;

    /// @notice tokenID => isOnPresale (true/false)
    mapping(uint256 => bool) public isOnPresale;

    /// @notice wallet => isOnGlobalPresale (true/false)
    mapping(address => bool) public hasGlobalPresaleAllowance;

    /// @notice wallet => tokenID => isOnTokenPresale (true/false)
    mapping(address => mapping(uint256 => bool)) public hasTokenPresaleAllowance;

    /// @notice The total amount of tokens per token ID
    uint256 public constant TOKEN_FRACTIONS = 1_000_000;

    /// EVENTS ///

    /// @notice Emitted when the royalty percentage is changed
    /// @param percent The new royalty percentage. 100% = 100 000
    event RoyaltyPercentageChanged(uint256 percent);

    /// @notice Emitted when the talent is updated for a token
    /// @param from The old talent address
    /// @param to The new talent address
    /// @param tokenID The token ID
    event TalentChanged(address indexed from, address indexed to, uint256 indexed tokenID);

    /// @notice Emitted when the minter role has changed
    /// @param from The old minter address
    /// @param to The new minter address
    event MinterRoleChanged(address indexed from, address indexed to);

    /// @notice Emitted when the marketplace address has changed
    /// @param from The old marketplace address
    /// @param to The new marketplace address
    event MarketplaceChanged(address indexed from, address indexed to);

    /// @notice Emitted when the global presale allowance for a user is changed
    /// @param user The user address
    /// @param allowance The new allowance
    event GlobalPresaleAllowanceSet(address indexed user, bool allowance);

    /// @notice Emitted when the token presale allowance for a user is changed
    /// @param user The user address
    /// @param id The token ID
    /// @param allowance The new allowance
    event TokenPresaleAllowanceSet(address indexed user, uint256 indexed id, bool allowance);

    /// @notice Emitted when the presale for a token has ended
    /// @param tokenId The token ID
    event PresaleEnded(uint256 indexed tokenId);

    /// PUBLIC FUNCTIONS ///

    /// @notice Returns the URI for a given token ID.
    /// @param tokenId The token ID to return the URI for.
    /// @return The token URI for the given token ID.
    function uri(uint256 tokenId) public view override returns (string memory) {
        return string(abi.encodePacked("ipfs://", tokenCIDs[tokenId]));
    }

    /// @notice A pure function to calculate the tokenID from a given unique contentID. A contentID
    /// @param contentID Must be a unique identifier of the original content (such as a Youtube video ID)
    /// @return The token ID for the given content ID.
    function contentIdToTokenId(string memory contentID) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked((contentID))));
    }

    /// @notice Update the talent address for a given token. This can only be called by the current
    /// talent address.
    /// @param tokenId The token ID to update the talent for.
    /// @param talent The address to receive the trading royalty for the token.
    function updateTalent(uint256 tokenId, address talent) external {
        address currentTalent = talents[tokenId];
        require(currentTalent == msg.sender, "Talent must update");
        _setTalent(tokenId, talent);
    }

    /// MINTER FUNCTIONS ///

    /// @notice Safely mint a new token. The tokenId is calculated from the keccak256
    /// hash of the provided contentID. This ensures that no duplicate content can be
    /// minted.
    /// @param to The address to mint the token to.
    /// @param cid IPFS CID of the content
    /// @param contentID unique content ID, such as unique Youtube ID
    /// @param talent The address to receive the trading royalty for the token.
    /// @param mintWithPresale Safely mint a new token with Presale. During presale, the Talentir can
    /// add addresses to the presale.
    function mint(
        address to,
        string memory cid,
        string memory contentID,
        address talent,
        bool mintWithPresale
    ) external onlyMinter whenNotPaused {
        require(bytes(cid).length > 0, "cid is empty");
        require(bytes(contentID).length > 0, "contentID is empty");
        require(cids[cid] == false, "Token CID already used");
        uint256 tokenId = contentIdToTokenId(contentID);
        require(bytes(tokenCIDs[tokenId]).length == 0, "Token already minted");
        isOnPresale[tokenId] = mintWithPresale;
        cids[cid] = true;
        tokenCIDs[tokenId] = cid;
        _setTalent(tokenId, talent);
        _mint(to, tokenId, TOKEN_FRACTIONS, "");

        // Pre-approve marketplace contract (can be revoked by talent)
        // This is necessary, so the market place can move the tokens on behalf of the user when posting
        // the first sell order.
        _setApprovalForAll(to, approvedMarketplace, true);

        // Pre-approve minter role, so first sell order can automatically be executed at the end
        // of the countdown (can be revoked by talent)
        _setApprovalForAll(to, minterAddress, true);
    }

    /// @notice Set the global presale allowance for a user. This allows the user to buy
    /// any token on presale.
    /// @param user The user to set the allowance for.
    /// @param allowance The allowance to set.
    function setGlobalPresaleAllowance(address user, bool allowance) external onlyMinter {
        require(user != address(0), "User is zero");
        require(hasGlobalPresaleAllowance[user] != allowance, "Already set");
        hasGlobalPresaleAllowance[user] = allowance;
        emit GlobalPresaleAllowanceSet(user, allowance);
    }

    /// @notice Set the presale allowance for a user for a specific token. This allows the user to
    /// transfer a specific token during presale.
    /// @param user The user to set the allowance for.
    /// @param tokenId The token to set the allowance for.
    /// @param allowance The allowance to set.
    function setTokenPresaleAllowance(address user, uint256 tokenId, bool allowance) external onlyMinter {
        require(user != address(0), "User is zero");
        require(talents[tokenId] != address(0), "tokenId not found");
        require(hasTokenPresaleAllowance[user][tokenId] != allowance, "Already set");
        hasTokenPresaleAllowance[user][tokenId] = allowance;
        emit TokenPresaleAllowanceSet(user, tokenId, allowance);
    }

    /// @notice End the presale for a token, so token can be transferred to anyone, presale can't be
    /// turned back on for the token
    /// @param tokenId The token to end the presale for.
    function endPresale(uint256 tokenId) external onlyMinter {
        require(isOnPresale[tokenId], "Already ended");
        isOnPresale[tokenId] = false;
        emit PresaleEnded(tokenId);
    }

    /// OWNER FUNCTIONS ///
    /// At the beginning, these are centralized with Talentir but should be handled by the
    /// DAO in the future.

    /// @notice Pause contract.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause contract.
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Set the royalty percentage for all tokens.
    /// @param percent The new royalty percentage. 1% = 1000.
    function setRoyalty(uint256 percent) external onlyOwner {
        require(percent <= ONE_HUNDRED_PERCENT / 10, "Must be <= 10%");
        royaltyPercent = percent;
        emit RoyaltyPercentageChanged(percent);
    }

    /// @notice Set the minter address.
    /// @param newMinterAddress The new minter address.
    /// @param approvedUsers Users who have the old minter address approved. Approval will be removed.
    function setMinterRole(address newMinterAddress, address[] memory approvedUsers) external onlyOwner {
        require(newMinterAddress != address(0), "Minter is zero");

        for (uint i = 0; i < approvedUsers.length; i++) {
            _setApprovalForAll(approvedUsers[i], newMinterAddress, false);
        }

        address from = minterAddress;
        minterAddress = newMinterAddress;
        emit MinterRoleChanged(from, newMinterAddress);
    }

    /// @notice Set the marketplace address.
    /// @param netMarketplace The new marketplace address.
    /// @param approvedUsers Users who have the old marketplace approved. Approval will be removed.
    function setMarketplace(address netMarketplace, address[] memory approvedUsers) external onlyOwner {
        require(netMarketplace != address(0), "Marketplace is zero");

        for (uint i = 0; i < approvedUsers.length; i++) {
            _setApprovalForAll(approvedUsers[i], netMarketplace, false);
        }

        address from = approvedMarketplace;
        approvedMarketplace = netMarketplace;
        emit MarketplaceChanged(from, netMarketplace);
    }

    /// ONLY OPERATOR FUNCTIONS ///
    /// Functions to implement the DefaultOperatorFilterer

    /// @notice Allows to batch transfer to many addresses.
    /// @param from The address to transfer from.
    /// @param to The addresses to transfer to.
    /// @param id The token id to transfer.
    /// @param amounts The amounts to transfer.
    /// @param data Additional data.
    function batchTransfer(
        address from,
        address[] memory to,
        uint256 id,
        uint256[] memory amounts,
        bytes memory data
    ) external onlyAllowedOperator(from) whenNotPaused onlyNoPresaleOrAllowed(from, id) {
        require(from == _msgSender() || isApprovedForAll(from, _msgSender()), "Caller is not token owner or approved");
        require(to.length == amounts.length, "Invalid array length");

        for (uint i = 0; i < to.length; i++) {
            _safeTransferFrom(from, to[i], id, amounts[i], data);
        }
    }

    /// @inheritdoc ERC1155
    function setApprovalForAll(
        address operator,
        bool approved
    ) public override whenNotPaused onlyAllowedOperatorApproval(operator) {
        super.setApprovalForAll(operator, approved);
    }

    /// @inheritdoc ERC1155
    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId,
        uint256 amount,
        bytes memory data
    ) public override onlyAllowedOperator(from) whenNotPaused onlyNoPresaleOrAllowed(from, tokenId) {
        super.safeTransferFrom(from, to, tokenId, amount, data);
    }

    /// @inheritdoc ERC1155
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

    /// MODIFIERS ///

    /// @dev Throws if called by any account other than the minter.
    modifier onlyMinter() {
        require(_msgSender() == minterAddress, "Not minter");
        _;
    }

    /// @dev Throws if called by any account other than the marketplace.
    modifier onlyNoPresaleOrAllowed(address sender, uint256 tokenId) {
        require(_hasNoPresaleOrAllowed(sender, tokenId), "Not allowed in presale");
        _;
    }

    /// INTERNAL FUNCTIONS ///
    /// @dev Set the talent for a token.
    function _setTalent(uint256 tokenID, address talent) internal {
        require(talent != address(0), "Talent is zero");
        address from = talents[tokenID];
        talents[tokenID] = talent;
        emit TalentChanged(from, talent, tokenID);
    }

    /// @dev Check if token is not on presale or sender is allowed to transfer.
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

    /// @inheritdoc ERC1155
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC1155, TalentirERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
