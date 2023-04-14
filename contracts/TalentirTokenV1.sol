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
    mapping(uint256 => string) private _tokenCIDs; // storing the IPFS CIDs
    address private _minterAddress;
    uint256 public constant TOKEN_FRACTIONS = 1_000_000;
    mapping(uint256 => bool) public isOnPresale;
    mapping(address => bool) internal hasGlobalPresaleAllowance;
    mapping(address => mapping(uint256 => bool)) internal hasTokenPresaleAllowance;

    /// EVENTS ///
    event RoyaltyPercentageChanged(uint256 percent);
    event TalentChanged(address from, address to, uint256 tokenID);
    event GlobalPresaleAllowanceSet(address user, bool allowance);
    event TokenPresaleAllowanceSet(address user, uint256 id, bool allowance);
    event PresaleEnded(uint256 tokenId);

    /// MODIFIERS ///
    modifier onlyMinter() {
        require(_msgSender() == _minterAddress, "Not allowed");
        _;
    }

    modifier onlyNoPresaleOrAllowed(address sender, uint256 tokenId) {
        require(_hasNoPresaleOrAllowed(sender, tokenId), "Not allowed in presale");
        _;
    }

    /// PUBLIC FUNCTIONS ///

    /// @param tokenId The token ID to return the URI for.
    /// @return The token URI for the given token ID.
    function uri(uint256 tokenId) public view override returns (string memory) {
        return string(abi.encodePacked("ipfs://", _tokenCIDs[tokenId]));
    }

    /// @notice A pure function to calculate the tokenID from a given unique contentID. A contentID
    /// @param contentID Must be a unique identifier of the original content (such as a Youtube video ID)
    /// @return The token ID for the given content ID.
    function contentIdToTokenId(string memory contentID) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked((contentID))));
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC1155, TalentirERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    /// @notice Update the talent address for a given token. This can only be called by the current
    /// talent address.
    /// @param tokenId The token ID to update the talent for.
    /// @param talent The address to receive the trading royalty for the token.
    function updateTalent(uint256 tokenId, address talent) public {
        address currentTalent = _talents[tokenId];
        require(currentTalent == msg.sender, "Talent must update");
        _setTalent(tokenId, talent);
    }

    /// @param tokenId The token ID to get the talent address for.
    /// @return The address of the talent for the given token.
    function getTalent(uint256 tokenId) public view returns (address) {
        return _talents[tokenId];
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
    ) public onlyMinter whenNotPaused {
        uint256 tokenId = contentIdToTokenId(contentID);
        require(bytes(_tokenCIDs[tokenId]).length == 0, "Token already minted");
        isOnPresale[tokenId] = mintWithPresale;
        _tokenCIDs[tokenId] = cid;
        _setTalent(tokenId, talent);
        _mint(to, tokenId, TOKEN_FRACTIONS, "");

        // Pre-approve minter role, so first sell order can automatically be executed at the end
        // of the countdown (can be revoked by talent)
        _setApprovalForAll(to, _minterAddress, true);
    }

    /// @notice Set the global presale allowance for a user. This allows the user to buy
    /// any token on presale.
    /// @param user The user to set the allowance for.
    /// @param allowance The allowance to set.
    function setGlobalPresaleAllowance(address user, bool allowance) public onlyMinter {
        require(hasGlobalPresaleAllowance[user] != allowance, "Already set");
        hasGlobalPresaleAllowance[user] = allowance;
        emit GlobalPresaleAllowanceSet(user, allowance);
    }

    /// @notice Set the presale allowance for a user for a specific token. This allows the user to
    /// transfer a specific token during presale.
    /// @param user The user to set the allowance for.
    /// @param tokenId The token to set the allowance for.
    /// @param allowance The allowance to set.
    function setTokenPresaleAllowance(address user, uint256 tokenId, bool allowance) public onlyMinter {
        require(hasTokenPresaleAllowance[user][tokenId] != allowance, "Already set");
        hasTokenPresaleAllowance[user][tokenId] = allowance;
        emit TokenPresaleAllowanceSet(user, tokenId, allowance);
    }

    /// @notice End the presale for a token, so token can be transferred to anyone, presale can't be
    /// turned back on for the token
    /// @param tokenId The token to end the presale for.
    function endPresale(uint256 tokenId) public onlyMinter {
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
    function setRoyalty(uint256 percent) public onlyOwner {
        require(percent <= 10_000, "Must be <= 10%");
        _royaltyPercent = percent;
        emit RoyaltyPercentageChanged(percent);
    }

    /// @notice Set the minter address.
    /// @param minterAddress The new minter address.
    function setMinterRole(address minterAddress) public onlyOwner {
        _minterAddress = minterAddress;
    }

    /// ONLY OPERATOR FUNCTIONS ///
    /// Functions to implement OpenSea's DefaultOperatorFilterer

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

    /// INTERNAL FUNCTIONS ///
    function _setTalent(uint256 tokenID, address talent) internal {
        address from = _talents[tokenID];
        _talents[tokenID] = talent;
        emit TalentChanged(from, talent, tokenID);
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
