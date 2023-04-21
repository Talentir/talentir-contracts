//SPDX-License-Identifier: Unlicense
pragma solidity 0.8.17;

import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {IERC2981} from "@openzeppelin/contracts/interfaces/IERC2981.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/// @title TalentirERC2981
/// @notice TalentirERC2981 is the ERC2918 implementation for Talentir
/// @custom:security-contact security@talentir.com
contract TalentirERC2981 is ERC165, IERC2981 {
    /// @notice Mapping of token ID to talents
    mapping(uint256 => address) public talents;

    /// @notice The current royalty percentage
    uint256 public royaltyPercent = 7_500;

    /// @notice The constant for 100%
    uint256 public constant PERCENT = 100_000;

    /// @notice Interface for the NFT Royalty Standard.
    /// @param tokenId The token ID to query
    /// @param value The sale price of the NFT specified by `tokenId`
    /// @return receiver The address to which royalties should be sent
    /// @return royaltyAmount The royalty amount that should be sent to `receiver` (in wei)
    function royaltyInfo(
        uint256 tokenId,
        uint256 value
    ) public view override returns (address receiver, uint256 royaltyAmount) {
        require(talents[tokenId] != address(0), "No royalty info for address");
        receiver = talents[tokenId];
        royaltyAmount = (value * royaltyPercent) / PERCENT;
    }

    /// @dev Supporting the ERC2981 interface
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165, IERC165) returns (bool) {
        return interfaceId == type(IERC2981).interfaceId || super.supportsInterface(interfaceId);
    }
}
