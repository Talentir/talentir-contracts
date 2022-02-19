/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */
import { Signer, utils, Contract, ContractFactory, Overrides } from "ethers";
import { Provider, TransactionRequest } from "@ethersproject/providers";
import type {
  TalentirMarketplace,
  TalentirMarketplaceInterface,
} from "../TalentirMarketplace";

const _abi = [
  {
    inputs: [
      {
        internalType: "address",
        name: "talentirNftAddress",
        type: "address",
      },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "address",
        name: "buyer",
        type: "address",
      },
    ],
    name: "BuyOfferWithdrawn",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "address",
        name: "buyer",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "value",
        type: "uint256",
      },
    ],
    name: "NewBuyOffer",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "address",
        name: "seller",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "value",
        type: "uint256",
      },
    ],
    name: "NewSellOffer",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "previousOwner",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "newOwner",
        type: "address",
      },
    ],
    name: "OwnershipTransferred",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "value",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "address",
        name: "receiver",
        type: "address",
      },
    ],
    name: "RoyaltiesPaid",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "address",
        name: "seller",
        type: "address",
      },
      {
        indexed: false,
        internalType: "address",
        name: "buyer",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "value",
        type: "uint256",
      },
    ],
    name: "Sale",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "address",
        name: "seller",
        type: "address",
      },
    ],
    name: "SellOfferWithdrawn",
    type: "event",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
    ],
    name: "acceptBuyOffer",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    name: "activeBuyOffers",
    outputs: [
      {
        internalType: "address",
        name: "buyer",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "price",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    name: "activeSellOffers",
    outputs: [
      {
        internalType: "address",
        name: "seller",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "minPrice",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    name: "buyOffersEscrow",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
    ],
    name: "makeBuyOffer",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "minPrice",
        type: "uint256",
      },
    ],
    name: "makeSellOffer",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "nftAddress",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
    ],
    name: "purchase",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [],
    name: "renounceOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "talentirNftAddress",
        type: "address",
      },
    ],
    name: "setNftContract",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "newOwner",
        type: "address",
      },
    ],
    name: "transferOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
    ],
    name: "withdrawBuyOffer",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
    ],
    name: "withdrawSellOffer",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];

const _bytecode =
  "0x6080604052600280546001600160a01b031916905534801561002057600080fd5b506040516116c73803806116c783398101604081905261003f916100c1565b61004833610071565b60018055600280546001600160a01b0319166001600160a01b03929092169190911790556100ef565b600080546001600160a01b038381166001600160a01b0319831681178455604051919092169283917f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e09190a35050565b6000602082840312156100d2578081fd5b81516001600160a01b03811681146100e8578182fd5b9392505050565b6115c9806100fe6000396000f3fe6080604052600436106100dd5760003560e01c8063715018a61161007f578063b0e569ef11610059578063b0e569ef1461028c578063c728c75e146102cc578063efef39a1146102ec578063f2fde38b146102ff57600080fd5b8063715018a6146102395780637f4957d31461024e5780638da5cb5b1461026e57600080fd5b806348bf7c6a116100bb57806348bf7c6a146101ae57806352f5ad77146101c15780635a123bac146101e15780635bf8633a1461020157600080fd5b806303c55649146100e257806305d6af9314610146578063455023491461018c575b600080fd5b3480156100ee57600080fd5b506101226100fd3660046114c7565b600360205260009081526040902080546001909101546001600160a01b039091169082565b604080516001600160a01b0390931683526020830191909152015b60405180910390f35b34801561015257600080fd5b5061017e61016136600461144f565b600560209081526000928352604080842090915290825290205481565b60405190815260200161013d565b34801561019857600080fd5b506101ac6101a73660046114c7565b61031f565b005b6101ac6101bc3660046114c7565b6105ad565b3480156101cd57600080fd5b506101ac6101dc366004611417565b610813565b3480156101ed57600080fd5b506101ac6101fc3660046114c7565b61085f565b34801561020d57600080fd5b50600254610221906001600160a01b031681565b6040516001600160a01b03909116815260200161013d565b34801561024557600080fd5b506101ac6108f5565b34801561025a57600080fd5b506101ac6102693660046114c7565b61092b565b34801561027a57600080fd5b506000546001600160a01b0316610221565b34801561029857600080fd5b506101226102a73660046114c7565b600460205260009081526040902080546001909101546001600160a01b039091169082565b3480156102d857600080fd5b506101ac6102e73660046114df565b610a53565b6101ac6102fa3660046114c7565b610bcb565b34801561030b57600080fd5b506101ac61031a366004611417565b610e63565b8061032981610efe565b61034e5760405162461bcd60e51b815260040161034590611500565b60405180910390fd5b6002546040516331a9108f60e11b815260048101849052839133916001600160a01b0390911690636352211e9060240160206040518083038186803b15801561039657600080fd5b505afa1580156103aa573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906103ce9190611433565b6001600160a01b0316146104165760405162461bcd60e51b815260206004820152600f60248201526e2737ba103a37b5b2b71037bbb732b960891b6044820152606401610345565b6000838152600460205260409020546001600160a01b03168061046a5760405162461bcd60e51b815260206004820152600c60248201526b273790313abc9037b33332b960a11b6044820152606401610345565b6000848152600460205260408120600101549061048786836110a0565b600087815260036020908152604080832080546001600160a01b0319908116825560019182018590556004845282852080549091168155018390556001600160a01b0387168352600582528083208a845290915281205590506104ea33826111c2565b600254604051632142170760e11b81523360048201526001600160a01b03858116602483015260448201899052909116906342842e0e90606401600060405180830381600087803b15801561053e57600080fd5b505af1158015610552573d6000803e3d6000fd5b5050604080518981523360208201526001600160a01b038716818301526060810186905290517f88863d5e20f64464b554931394e2e4b6f09c10015147215bf26b3ba5070acebe9350908190036080019150a1505050505050565b6002546040516331a9108f60e11b815260048101839052829133916001600160a01b0390911690636352211e9060240160206040518083038186803b1580156105f557600080fd5b505afa158015610609573d6000803e3d6000fd5b505050506040513d601f19601f8201168201806040525081019061062d9190611433565b6001600160a01b0316141561067e5760405162461bcd60e51b8152602060048201526017602482015276151bdad95b881bdddb995c881b9bdd08185b1b1bddd959604a1b6044820152606401610345565b600082815260036020526040902060010154156107065760008281526003602052604090206001015434116107065760405162461bcd60e51b815260206004820152602860248201527f53656c6c206f726465722061742074686973207072696365206f72206c6f7765604482015267722065786973747360c01b6064820152608401610345565b60008281526004602052604090206001015434116107665760405162461bcd60e51b815260206004820152601960248201527f4578697374696e6720627579206f6666657220686967686572000000000000006044820152606401610345565b61076f826112c0565b60408051808201825233808252346020808401828152600088815260048352868120955186546001600160a01b0319166001600160a01b03909116178655905160019095019490945582845260058152848420878552815292849020819055835186815292830191909152918101919091527fd1d0f457f709cbed0f3360dee6050dde1a0ac4706268ff21aecae87e6ddb2861906060015b60405180910390a15050565b6000546001600160a01b0316331461083d5760405162461bcd60e51b815260040161034590611526565b600280546001600160a01b0319166001600160a01b0392909216919091179055565b6000818152600460205260409020546001600160a01b031633146108b15760405162461bcd60e51b81526020600482015260096024820152682737ba10313abcb2b960b91b6044820152606401610345565b6108ba816112c0565b604080518281523360208201527fcde8efb885f61e3023afcfb4e801eca4790b08b4d7706ea9e7fb62073a09574a910160405180910390a150565b6000546001600160a01b0316331461091f5760405162461bcd60e51b815260040161034590611526565b610929600061133d565b565b8061093581610efe565b6109515760405162461bcd60e51b815260040161034590611500565b6000828152600360205260409020546001600160a01b03166109a55760405162461bcd60e51b815260206004820152600d60248201526c27379039b0b6329037b33332b960991b6044820152606401610345565b6000828152600360205260409020546001600160a01b031633146109f85760405162461bcd60e51b815260206004820152600a6024820152692737ba1039b2b63632b960b11b6044820152606401610345565b600082815260036020908152604080832080546001600160a01b031916815560010192909255815184815233918101919091527f0ee9f15fa7b24cc47b7ad8f1ab7eba99816c29b73654fc73da316af84fc74e539101610807565b81610a5d81610efe565b610a795760405162461bcd60e51b815260040161034590611500565b6002546040516331a9108f60e11b815260048101859052849133916001600160a01b0390911690636352211e9060240160206040518083038186803b158015610ac157600080fd5b505afa158015610ad5573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190610af99190611433565b6001600160a01b031614610b415760405162461bcd60e51b815260206004820152600f60248201526e2737ba103a37b5b2b71037bbb732b960891b6044820152606401610345565b604080518082018252338082526020808301878152600089815260038352859020935184546001600160a01b0319166001600160a01b03909116178455516001909301929092558251878152918201529081018490527ffebb76be1873df3b56e866a34c7c2c524f18821d1fec4252ae2fe8b11fc202d0906060015b60405180910390a150505050565b6002546040516331a9108f60e11b815260048101839052829133916001600160a01b0390911690636352211e9060240160206040518083038186803b158015610c1357600080fd5b505afa158015610c27573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190610c4b9190611433565b6001600160a01b03161415610c9c5760405162461bcd60e51b8152602060048201526017602482015276151bdad95b881bdddb995c881b9bdd08185b1b1bddd959604a1b6044820152606401610345565b6000828152600360205260409020546001600160a01b031680610cf85760405162461bcd60e51b815260206004820152601460248201527327379030b1ba34bb329039b2b6361037b33332b960611b6044820152606401610345565b600083815260036020526040902060010154341015610d4f5760405162461bcd60e51b8152602060048201526013602482015272416d6f756e742073656e7420746f6f206c6f7760681b6044820152606401610345565b6000610d5b84346110a0565b600085815260036020526040902054909150610d80906001600160a01b0316826111c2565b600254604051632142170760e11b81526001600160a01b03848116600483015233602483015260448201879052909116906342842e0e90606401600060405180830381600087803b158015610dd457600080fd5b505af1158015610de8573d6000803e3d6000fd5b505050600085815260036020526040812080546001600160a01b03191681556001015550610e15846112c0565b604080518581526001600160a01b038416602082015233918101919091523460608201527f88863d5e20f64464b554931394e2e4b6f09c10015147215bf26b3ba5070acebe90608001610bbd565b6000546001600160a01b03163314610e8d5760405162461bcd60e51b815260040161034590611526565b6001600160a01b038116610ef25760405162461bcd60e51b815260206004820152602660248201527f4f776e61626c653a206e6577206f776e657220697320746865207a65726f206160448201526564647265737360d01b6064820152608401610345565b610efb8161133d565b50565b6002546040516331a9108f60e11b8152600481018390526000916001600160a01b03169082908290636352211e9060240160206040518083038186803b158015610f4757600080fd5b505afa158015610f5b573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190610f7f9190611433565b60405163020604bf60e21b81526004810186905290915060009030906001600160a01b0385169063081812fc9060240160206040518083038186803b158015610fc757600080fd5b505afa158015610fdb573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190610fff9190611433565b60405163e985e9c560e01b81526001600160a01b0385811660048301523060248301529182169290921492506000919085169063e985e9c59060440160206040518083038186803b15801561105357600080fd5b505afa158015611067573d6000803e3d6000fd5b505050506040513d601f19601f8201168201806040525081019061108b91906114a7565b905081806110965750805b9695505050505050565b6002546000906110b8906001600160a01b031661138d565b156111b95760025460405163152a902d60e11b8152600481018590526024810184905260009182916001600160a01b0390911690632a55205a90604401604080518083038186803b15801561110c57600080fd5b505afa158015611120573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190611144919061147a565b90925090506000611155828661155b565b905081156111675761116783836111c2565b60408051878152602081018490526001600160a01b0385168183015290517faa044fd0677f595122a532475e14efe539fe126d9ec7d9b7e66d7fcbec3636be9181900360600190a192506111bc915050565b50805b92915050565b600260015414156112155760405162461bcd60e51b815260206004820152601f60248201527f5265656e7472616e637947756172643a207265656e7472616e742063616c6c006044820152606401610345565b60026001556040516000906001600160a01b0384169083908381818185875af1925050503d8060008114611265576040519150601f19603f3d011682016040523d82523d6000602084013e61126a565b606091505b50909150506001811515146112b75760405162461bcd60e51b8152602060048201526013602482015272436f756c646e27742073656e642066756e647360681b6044820152606401610345565b50506001805550565b6000818152600460205260409020546001600160a01b0316806112e1575050565b6001600160a01b03811660009081526005602090815260408083208584529091528120805491905580156113195761131982826111c2565b5050600090815260046020526040812080546001600160a01b031916815560010155565b600080546001600160a01b038381166001600160a01b0319831681178455604051919092169283917f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e09190a35050565b6040516301ffc9a760e01b815263152a902d60e11b600482018190526000916001600160a01b038416906301ffc9a79060240160206040518083038186803b1580156113d857600080fd5b505afa1580156113ec573d6000803e3d6000fd5b505050506040513d601f19601f8201168201806040525081019061141091906114a7565b9392505050565b600060208284031215611428578081fd5b81356114108161157e565b600060208284031215611444578081fd5b81516114108161157e565b60008060408385031215611461578081fd5b823561146c8161157e565b946020939093013593505050565b6000806040838503121561148c578182fd5b82516114978161157e565b6020939093015192949293505050565b6000602082840312156114b8578081fd5b81518015158114611410578182fd5b6000602082840312156114d8578081fd5b5035919050565b600080604083850312156114f1578182fd5b50508035926020909101359150565b6020808252600c908201526b139bdd08185c1c1c9bdd995960a21b604082015260600190565b6020808252818101527f4f776e61626c653a2063616c6c6572206973206e6f7420746865206f776e6572604082015260600190565b60008282101561157957634e487b7160e01b81526011600452602481fd5b500390565b6001600160a01b0381168114610efb57600080fdfea2646970667358221220f4268b1eb805c874a6f55c8fb9ae2e720dda64dddc1259c09935b86ebc3ba1db64736f6c63430008040033";

type TalentirMarketplaceConstructorParams =
  | [signer?: Signer]
  | ConstructorParameters<typeof ContractFactory>;

const isSuperArgs = (
  xs: TalentirMarketplaceConstructorParams
): xs is ConstructorParameters<typeof ContractFactory> => xs.length > 1;

export class TalentirMarketplace__factory extends ContractFactory {
  constructor(...args: TalentirMarketplaceConstructorParams) {
    if (isSuperArgs(args)) {
      super(...args);
    } else {
      super(_abi, _bytecode, args[0]);
    }
    this.contractName = "TalentirMarketplace";
  }

  deploy(
    talentirNftAddress: string,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<TalentirMarketplace> {
    return super.deploy(
      talentirNftAddress,
      overrides || {}
    ) as Promise<TalentirMarketplace>;
  }
  getDeployTransaction(
    talentirNftAddress: string,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): TransactionRequest {
    return super.getDeployTransaction(talentirNftAddress, overrides || {});
  }
  attach(address: string): TalentirMarketplace {
    return super.attach(address) as TalentirMarketplace;
  }
  connect(signer: Signer): TalentirMarketplace__factory {
    return super.connect(signer) as TalentirMarketplace__factory;
  }
  static readonly contractName: "TalentirMarketplace";
  public readonly contractName: "TalentirMarketplace";
  static readonly bytecode = _bytecode;
  static readonly abi = _abi;
  static createInterface(): TalentirMarketplaceInterface {
    return new utils.Interface(_abi) as TalentirMarketplaceInterface;
  }
  static connect(
    address: string,
    signerOrProvider: Signer | Provider
  ): TalentirMarketplace {
    return new Contract(address, _abi, signerOrProvider) as TalentirMarketplace;
  }
}
