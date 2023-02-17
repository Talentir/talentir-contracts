//SPDX-License-Identifier: Unlicense
pragma solidity 0.8.17;

import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";

/// @custom:security-contact security@talentir.com
contract ERC2981 is ERC165, IERC2981 {
    mapping(uint256 => address) internal _talents;
    uint256 private _royaltyPercent = 10_000;
    uint256 internal constant PERCENT = 100_000;

    // - EVENTS
    event RoyaltyPercentageChanged(uint256 percent);

    event TalentChanged(address from, address to, uint256 tokenID);

    function royaltyInfo(
        uint256 tokenId,
        uint256 value
    ) public view override returns (address receiver, uint256 royaltyAmount) {
        require(_talents[tokenId] != address(0), "No royalty info for address");
        receiver = _talents[tokenId];
        royaltyAmount = (value * _royaltyPercent) / PERCENT;
    }

    function updateTalent(uint256 tokenId, address talent) public {
        address currentReceiver = _talents[tokenId];
        require(currentReceiver == msg.sender, "Royalty receiver must update");
        _setTalent(tokenId, talent);
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165, IERC165) returns (bool) {
        return interfaceId == type(IERC2981).interfaceId || super.supportsInterface(interfaceId);
    }

    function _setTalent(uint256 tokenID, address talent) internal {
        address from = _talents[tokenID];
        _talents[tokenID] = talent;
        emit TalentChanged(from, talent, tokenID);
    }

    function _setRoyaltyPercent(uint256 percent) internal {
        emit RoyaltyPercentageChanged(percent);
        _royaltyPercent = percent;
    }
}
