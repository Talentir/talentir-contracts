//SPDX-License-Identifier: Unlicense
pragma solidity 0.8.17;

import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";

/// @custom:security-contact security@talentir.com
contract ERC2981 is ERC165, IERC2981 {
    mapping(uint256 => address) internal _talents;

    //does this mean the default is 10% ?
    uint256 private _royaltyPercent = 10_000;

    // - EVENTS
    event RoyaltyPercentageChanged(uint256 percent);

    event TalentChanged(address from, address to, uint256 tokenID);

    function royaltyInfo(
        uint256 tokenId,
        uint256 value
    ) public view override returns (address receiver, uint256 royaltyAmount) {
        //dont know if reverting this call is a good idea since it'd cancel any marketplace trade
        //consider returning zero instead
        require(_talents[tokenId] != address(0), "No royalty info for address");
        receiver = _talents[tokenId];
        //todo consider making 100_000 a constant eg named PERCENTAGE_BASE
        royaltyAmount = (value * _royaltyPercent) / 100_000;
    }

    function updateTalent(uint256 tokenId, address talent) public {
        address currentReceiver = _talents[tokenId];
        require(currentReceiver == msg.sender, "Royalty receiver must update");
        _setTalent(tokenId, talent);
    }

    //this method name isn't telling much about its purpose. It actually 
    function _setTalent(uint256 tokenID, address talent) internal {
        address from = _talents[tokenID];
        _talents[tokenID] = talent;
        emit TalentChanged(from, talent, tokenID);
    }

    function _setRoyaltyPercent(uint256 percent) internal {
        //todo check that percent is a decent value
        emit RoyaltyPercentageChanged(percent);
        _royaltyPercent = percent;
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165, IERC165) returns (bool) {
        return interfaceId == type(IERC2981).interfaceId || super.supportsInterface(interfaceId);
    }
}
