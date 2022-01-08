//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";

/// @custom:security-contact security@talentir.com
contract TalentirRoyalties is ERC165, IERC2981 {
    mapping(uint256 => address) internal _royaltyReceivers;
    uint256 constant internal ROYALTIES_PERCENTAGE = 10;

    function royaltyInfo(uint256 tokenId, uint256 value)
        external
        view
        override
        returns (address receiver, uint256 royaltyAmount)
    {
        receiver = _royaltyReceivers[tokenId];
        royaltyAmount = (value * ROYALTIES_PERCENTAGE) / 100;
    }

    function updateRoyaltyReceiver(uint256 tokenId, address newRoyaltyReceiver)
        public
    {
        address currentReceiver = _royaltyReceivers[tokenId];
        require(currentReceiver == msg.sender, "Only current royalty receiver can update.");
        _royaltyReceivers[tokenId] = newRoyaltyReceiver;
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165, IERC165) returns (bool) {
        return
            interfaceId == type(IERC2981).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    function _setRoyaltiyReceiver(address receiver, uint256 tokenID) 
        internal
    {
        _royaltyReceivers[tokenID] = receiver;
    }
}