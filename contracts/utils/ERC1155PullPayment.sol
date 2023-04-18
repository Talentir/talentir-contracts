// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

contract ERC1155PullPayment {
    /// @dev User => tokenId => escrowed token balance
    mapping(address => mapping(uint256 => uint256)) public userTokenEscrow;
    
    /// @dev Token contract address
    address private _tokenContract;

    event ERC1155Deposited(address indexed wallet, uint256 tokenId, uint256 quantity);
    event ERC1155Withdrawn(address indexed wallet,  uint256 tokenId, uint256 quantity);
    
    constructor(address tokenContract) {
        _tokenContract = tokenContract;
    }

    function _asyncTokenTransferFrom(
        uint256 _tokenId,
        address _from,
        address _to,
        uint256 _quantity
    ) internal {
        // First, transfer token into this contract
        bytes memory data;
        IERC1155(_tokenContract).safeTransferFrom(_from, address(this), _tokenId, _quantity, data);

        // Make them available for withdrawal
        userTokenEscrow[_to][_tokenId] += _quantity;

        emit ERC1155Deposited(_to, _tokenId, _quantity);
    }

    function withdrawTokens(address _user, uint256 _tokenId) external {
        uint256 balance = userTokenEscrow[_user][_tokenId];
        require(balance > 0, "No tokens to withdraw");

        // Remove balance from escrow
        userTokenEscrow[msg.sender][_tokenId] = 0;

        // Transfer token to user
        bytes memory data;
        IERC1155(_tokenContract).safeTransferFrom(address(this), _user, _tokenId, balance, data);

        emit ERC1155Withdrawn(_user, _tokenId, balance);
    }
}