

const fs = require('fs');
const path = require("path");
const Axios = require("axios");
const util = require('util');
const ethUtils = require('ethereumjs-util');
const BlockHeader = require('ethereumjs-block/header');

const axios = Axios.create({
  baseURL: "https://arpc.apothem.network",
  headers: {'content-type': 'application/json'},
  timeout: 60000,
})

const axiosClient = async (config, type) => {
  try {
    const {data, status} = await axios.request(config);
    if (status !== 200) throw new Error('Not 200 response')
    return data;
  } catch (error) {
    console.log(`Failed to get http response from Xinfin for ${type} data, going to sleep and retry!`);
    sleep(5000);
    return await axiosClient(config, type);
  }
}

(async () => {
  const blockNumber = 36381303;
  const hexNum = blockNumber.toString(16);
  
  const config = {
    method: 'POST',
    url: '/getBlockByNumber',
    data: JSON.stringify({"jsonrpc":"2.0","method":"eth_getBlockByNumber","params":[`0x${hexNum}`,true],"id":1})
  }
  
  const data = await axiosClient(config, 'block');
  const block = data.result;
  
  
  // const dataBuff = ethUtils.toBuffer(block.extraData)
  // block.extraData = '0x' + ethUtils.toBuffer(block.extraData).slice(0, dataBuff.length - 65).toString('hex')
    
  block.miner = '0x'+block.miner.substring(3)
  
  
  // console.log(block)
  const headerHash = new BlockHeader({
    parentHash: ethUtils.toBuffer(block.parentHash),
    uncleHash: ethUtils.toBuffer(block.sha3Uncles),
    coinbase: ethUtils.toBuffer(block.miner),
    stateRoot: ethUtils.toBuffer(block.stateRoot),
    transactionsTrie: ethUtils.toBuffer(block.transactionsRoot),
    receiptTrie: ethUtils.toBuffer(block.receiptsRoot),
    bloom: ethUtils.toBuffer(block.logsBloom),
    difficulty: ethUtils.toBuffer(parseInt(block.difficulty)),
    number: ethUtils.toBuffer(block.number),
    gasLimit: ethUtils.toBuffer(block.gasLimit),
    gasUsed: ethUtils.toBuffer(block.gasUsed),
    timestamp: ethUtils.toBuffer(block.timestamp),
    extraData: ethUtils.toBuffer(block.extraData),
    mixHash: ethUtils.toBuffer(block.mixHash),
    nonce: ethUtils.toBuffer(block.nonce),
    validators: ethUtils.toBuffer(block.validators),
    validator: ethUtils.toBuffer(block.validator),
    
    penalties: ethUtils.toBuffer(block.penalties)
  });
  
  console.log(ethUtils.bufferToHex(headerHash.hash()));
  
})();

