package main

import (
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"os"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/consensus/XDPoS"
	"github.com/ethereum/go-ethereum/crypto"

	"github.com/ethereum/go-ethereum/rlp"
	"golang.org/x/crypto/sha3"
)

var (
	extraSeal           = 65
	errMissingSignature = errors.New("extra-data 65 byte suffix signature missing")
)

const (
	// BloomByteLength represents the number of bytes used in a header log bloom.
	BloomByteLength = 256
)

type Bloom [BloomByteLength]byte

type Header struct {
	ParentHash  common.Hash    `json:"parentHash"       gencodec:"required"`
	UncleHash   common.Hash    `json:"sha3Uncles"       gencodec:"required"`
	Coinbase    common.Address `json:"miner"            gencodec:"required"`
	Root        common.Hash    `json:"stateRoot"        gencodec:"required"`
	TxHash      common.Hash    `json:"transactionsRoot" gencodec:"required"`
	ReceiptHash common.Hash    `json:"receiptsRoot"     gencodec:"required"`
	Bloom       Bloom          `json:"logsBloom"        gencodec:"required"`
	Difficulty  *big.Int       `json:"difficulty"       gencodec:"required"`
	Number      *big.Int       `json:"number"           gencodec:"required"`
	GasLimit    uint64         `json:"gasLimit"         gencodec:"required"`
	GasUsed     uint64         `json:"gasUsed"          gencodec:"required"`
	Time        uint64         `json:"timestamp"        gencodec:"required"`
	Extra       []byte         `json:"extraData"        gencodec:"required"`
	MixDigest   common.Hash    `json:"mixHash"`
	Nonce       BlockNonce     `json:"nonce"`
	Validators  []byte         `json:"validators"       gencodec:"required"`
	Validator   []byte         `json:"validator"        gencodec:"required"`
	Penalties   []byte         `json:"penalties"        gencodec:"required"`
}

type BlockNonce [8]byte

func (b *Bloom) SetBytes(d []byte) {
	if len(b) < len(d) {
		panic(fmt.Sprintf("bloom bytes too big %d %d", len(b), len(d)))
	}
	copy(b[BloomByteLength-len(d):], d)
}

func BytesToBloom(b []byte) Bloom {
	var bloom Bloom
	bloom.SetBytes(b)
	return bloom
}

func EncodeNonce(i uint64) BlockNonce {
	var n BlockNonce
	binary.BigEndian.PutUint64(n[:], i)
	return n
}

func sigHash(header *Header) (hash common.Hash) {
	hasher := sha3.NewLegacyKeccak256()

	rlp.Encode(hasher, []interface{}{
		header.ParentHash,
		header.UncleHash,
		header.Coinbase,
		header.Root,
		header.TxHash,
		header.ReceiptHash,
		header.Bloom,
		header.Difficulty,
		header.Number,
		header.GasLimit,
		header.GasUsed,
		header.Time,
		header.Extra[:len(header.Extra)-65], // Yes, this will panic if extra is too short
		header.MixDigest,
		header.Nonce,
	})
	hasher.Sum(hash[:0])
	return hash
}

type Request struct {
	ParentHash  string `json:"parentHash"`
	UncleHash   string `json:"sha3Uncles"`
	Coinbase    string `json:"miner"`
	Root        string `json:"stateRoot"`
	TxHash      string `json:"transactionsRoot"`
	ReceiptHash string `json:"receiptsRoot"`
	Bloom       string `json:"logsBloom"`
	Difficulty  uint64 `json:"difficulty"`
	Number      uint64 `json:"number"`
	GasLimit    uint64 `json:"gasLimit"`
	GasUsed     uint64 `json:"gasUsed"`
	Time        uint64 `json:"timestamp"`
	Extra       string `json:"extraData"`
	MixDigest   string `json:"mixHash"`
	Nonce       uint64 `json:"nonce"`
	Validators  string `json:"validators"`
	Validator   string `json:"validator"`
	Penalties   string `json:"penalties"`
}

func main() {
	// fmt.Println(os.Args[1:])
	input := os.Args[1:][0]
	data := Request{}
	json.Unmarshal([]byte(input), &data)

	// Extra
	extraSubstring := data.Extra[2:]
	extraByte, _ := hex.DecodeString(extraSubstring)
	// Bloom
	bloomSubstring := data.Bloom[2:]

	bloomByte, _ := hex.DecodeString(bloomSubstring)

	header := Header{
		ParentHash:  common.HexToHash(data.ParentHash),
		UncleHash:   common.HexToHash(data.UncleHash),
		Coinbase:    common.HexToAddress(data.Coinbase),
		Root:        common.HexToHash(data.Root),
		TxHash:      common.HexToHash(data.TxHash),
		ReceiptHash: common.HexToHash(data.ReceiptHash),
		Bloom:       BytesToBloom(bloomByte),
		Difficulty:  big.NewInt(int64(data.Difficulty)),
		Number:      big.NewInt(int64(data.Number)),
		GasLimit:    data.GasLimit,
		GasUsed:     data.GasUsed,
		Time:        data.Time,
		Extra:       extraByte,
		MixDigest:   common.HexToHash(data.MixDigest),
		Nonce:       EncodeNonce(data.Nonce),
	}
	hasher := sha3.NewLegacyKeccak256()

	rlp.Encode(hasher, []interface{}{
		header.ParentHash,
		header.UncleHash,
		header.Coinbase,
		header.Root,
		header.TxHash,
		header.ReceiptHash,
		header.Bloom,
		header.Difficulty,
		header.Number,
		header.GasLimit,
		header.GasUsed,
		header.Time,
		header.Extra[:len(header.Extra)-65], // Yes, this will panic if extra is too short
		header.MixDigest,
		header.Nonce,
	})
	var hash common.Hash
	hasher.Sum(hash[:0])

	// Recover miner
	minerAddress, _ := getMinerAddress(&header)
	fmt.Println(minerAddress.Hex())

	// Validator
	validatorSignatures := data.Validator[2:]
	validatorAddress, _ := getValidatorAddress(&header, validatorSignatures)
	fmt.Println(validatorAddress.Hex())

	// Validators mapping
	validatorsMappingArray, _ := DecodeValidatorsHexData(data.Validators)
	fmt.Println(validatorsMappingArray)
}

func getMinerAddress(header *Header) (common.Address, error) {
	if len(header.Extra) < extraSeal {
		return common.Address{}, errMissingSignature
	}
	signature := header.Extra[len(header.Extra)-extraSeal:]

	// Recover the public key and the Ethereum address
	pubkey, err := crypto.Ecrecover(sigHash(header).Bytes(), signature)
	if err != nil {
		return common.Address{}, err
	}
	var minerAddress common.Address
	copy(minerAddress[:], crypto.Keccak256(pubkey[1:])[12:])

	return minerAddress, nil
}

func getValidatorAddress(header *Header, validatorSig string) (common.Address, error) {
	signature, _ := hex.DecodeString(validatorSig)

	// Recover the public key and the Ethereum address
	pubkey, err := crypto.Ecrecover(sigHash(header).Bytes(), signature)
	if err != nil {
		return common.Address{}, err
	}
	var validatorAddress common.Address
	copy(validatorAddress[:], crypto.Keccak256(pubkey[1:])[12:])
	return validatorAddress, nil
}

// Decode validator hex string.
func DecodeValidatorsHexData(validatorsStr string) ([]int64, error) {
	validatorsByte, err := hexutil.Decode(validatorsStr)
	if err != nil {
		return nil, err
	}

	return XDPoS.ExtractValidatorsFromBytes(validatorsByte), nil
}
