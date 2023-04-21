// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

/// @notice Simple implementation of a pull transfer stragety for ERC1155 tokens, where the transferring
/// doesn't execute onERC1155Received, but the tokens are escrowed in this contract and can be
/// withdrawn by the recipient.
contract ERC1155PullTransfer {
    /// @notice User => tokenId => escrowed token balance
    mapping(address => mapping(uint256 => uint256)) public userTokenEscrow;

    /// @notice Token contract address
    IERC1155 private _tokenContract;

    /// @notice This event is emitted when tokens are deposited into the escrow
    /// @param wallet The address of the user
    /// @param tokenId The ID of the token
    /// @param quantity The quantity of the token
    event ERC1155Deposited(address indexed wallet, uint256 tokenId, uint256 quantity);

    /// @notice This event is emitted when tokens are withdrawn from the escrow
    /// @param wallet The address of the user
    /// @param tokenId The ID of the token
    /// @param quantity The quantity of the token
    event ERC1155Withdrawn(address indexed wallet, uint256 tokenId, uint256 quantity);

    /// @notice Constructor
    /// @param tokenContract The address of the ERC1155 token contract
    constructor(address tokenContract) {
        _tokenContract = IERC1155(tokenContract);
    }

    /// @notice Function to withdraw tokens from this contract. Notice that ANY user can call this function
    /// @param _user The address of the user
    /// @param _tokenId The ID of the token
    function withdrawTokens(address _user, uint256 _tokenId) external {
        uint256 balance = userTokenEscrow[_user][_tokenId];
        require(balance > 0, "No tokens to withdraw");

        // Remove balance from escrow
        userTokenEscrow[_user][_tokenId] = 0;

        // Transfer token to user
        bytes memory data;
        _tokenContract.safeTransferFrom(address(this), _user, _tokenId, balance, data);

        emit ERC1155Withdrawn(_user, _tokenId, balance);
    }

    /// @notice Internal function to transfer tokens from a user to this contract
    /// @param _tokenId The ID of the token
    /// @param _from The address of the user
    /// @param _to The address of the recipient
    /// @param _quantity The quantity of the token
    function _asyncTokenTransferFrom(uint256 _tokenId, address _from, address _to, uint256 _quantity) internal virtual {
        // First, transfer token into this contract
        bytes memory data;
        _tokenContract.safeTransferFrom(_from, address(this), _tokenId, _quantity, data);

        // Make them available for withdrawal
        userTokenEscrow[_to][_tokenId] += _quantity;

        emit ERC1155Deposited(_to, _tokenId, _quantity);
    }
}
