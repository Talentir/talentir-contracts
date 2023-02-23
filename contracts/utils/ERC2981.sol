//SPDX-License-Identifier: Unlicense
pragma solidity 0.8.17;

import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";

/// @custom:security-contact security@talentir.com
contract ERC2981 is ERC165, IERC2981 {
    mapping(uint256 => address) internal _talents;
    uint256 internal _royaltyPercent = 7_500;
    uint256 internal constant PERCENT = 100_000;

    // - EVENTS

    function royaltyInfo(
        uint256 tokenId,
        uint256 value
    ) public view override returns (address receiver, uint256 royaltyAmount) {
        require(_talents[tokenId] != address(0), "No royalty info for address");
        receiver = _talents[tokenId];
        royaltyAmount = (value * _royaltyPercent) / PERCENT;
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165, IERC165) returns (bool) {
        return interfaceId == type(IERC2981).interfaceId || super.supportsInterface(interfaceId);
    }
}
