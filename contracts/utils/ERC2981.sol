//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";

/// @custom:security-contact security@talentir.com
contract ERC2981 is ERC165, IERC2981 {
    mapping(uint256 => address) internal _royaltyReceivers;
    uint16 internal _royaltyPercentage = 10;

    event UpdateRoyaltyReceiver(address from, address to, uint256 tokenID);

    function royaltyInfo(uint256 tokenId, uint256 value)
        external
        view
        override
        returns (address receiver, uint256 royaltyAmount)
    {
        require(_royaltyReceivers[tokenId] != address(0), "No royalty info for address");
        receiver = _royaltyReceivers[tokenId];
        royaltyAmount = (value * _royaltyPercentage) / 100;
    }

    function updateRoyaltyReceiver(uint256 tokenId, address newRoyaltyReceiver) public {
        address currentReceiver = _royaltyReceivers[tokenId];
        require(currentReceiver == msg.sender, "Royalty receiver must update");
        _setRoyaltyReceiver(tokenId, newRoyaltyReceiver);
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165, IERC165) returns (bool) {
        return interfaceId == type(IERC2981).interfaceId || super.supportsInterface(interfaceId);
    }

    function _setRoyaltyReceiver(uint256 tokenID, address receiver) internal {
        address from = _royaltyReceivers[tokenID];
        _royaltyReceivers[tokenID] = receiver;
        emit UpdateRoyaltyReceiver(from, receiver, tokenID);
    }
}
