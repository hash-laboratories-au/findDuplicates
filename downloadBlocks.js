
const fs = require('fs');
const path = require("path");
const Axios = require("axios");
const util = require('util');
const ethUtils = require('ethereumjs-util');
const BlockHeader = require('ethereumjs-block/header');

const PARALLEL_REQUEST = 100;
const SWITCH_BLOCK = 7074000;

const axios = Axios.create({
  baseURL: "http://194.233.77.19:8545/",
  headers: {'content-type': 'application/json'},
  timeout: 60000,
})

const writeJsonFile = async (data, outputFilename) => {
  return fs.writeFileSync(
    path.join(__dirname, `output`, `${outputFilename}.json`),
    JSON.stringify(data),
    {encoding:'utf8',flag:'w'}
  );
}
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

const convertFieldToInt = (fields, block) => {
  fields.forEach(f => {
    block[f] = parseInt(block[f], 16);
  });
  return block;
}

const getBlockByNumber = async(blockNum) => {
  const config = {
    method: 'POST',
    url: '/getBlockByNumber',
    data: JSON.stringify({"jsonrpc":"2.0","method":"eth_getBlockByNumber","params":[`0x${blockNum}`,true],"id":1})
  }
  const data = await axiosClient(config, 'block');
  
  let minerAddress = data.result.miner;
  if (parseInt(blockNum, 16) <= SWITCH_BLOCK) {
    // const {minerAddress, signerAddress }= await getM1M2(data.result);
    minerAddress = (await getM1M2(data.result)).minerAddress;
  }
  const blockJson = convertFieldToInt(['nonce', 'gasUsed', 'difficulty', 'number', 'size', 'timestamp', 'totalDifficulty', 'gasLimit'], data.result);
  return {
    ...blockJson,
    minerAddress,
    // validatorAddress: signerAddress
  }
}
const getMinersListFromExtradata = (extraData) => {
  let masterNodeString = extraData.substring(66, extraData.length-130);

  const numberOfMiners = Math.floor(masterNodeString.length/40);
  const miners = [];
  for (let index = 0; index < numberOfMiners; index++) {
    miners.push(masterNodeString.substring(0, 40));
    masterNodeString = masterNodeString.substring(40);
  }
  return miners;
}

const getPenaltiesMinersListFromPenalties = (penalties) => {
  let masterNodeString = penalties.substring(2, penalties.length); //delete 0x prefix
  const numberOfMiners = Math.floor(masterNodeString.length/40);
  const miners = [];
  for (let index = 0; index < numberOfMiners; index++) {
    miners.push({
      index,
      minerAddress: masterNodeString.substring(0, 40)
    });
    masterNodeString = masterNodeString.substring(40);
  }
  return miners;
}

function chunkSubstr(str, size) {
  const numChunks = Math.ceil(str.length / size)
  const chunks = new Array(numChunks)

  for (let i = 0, o = 0; i < numChunks; ++i, o += size) {
    chunks[i] = str.substr(o, size)
  }
  return chunks
}

const getMasterNodesFromValidators = (validators) => {
  const addressLength = 40;
  return chunkSubstr(validators.substring(2), 40)
}

const gettingBlockData = async (blockNumber) => {
  console.log(`getting block ${blockNumber}`);
  const hexNum = blockNumber.toString(16);
  let orderedMinerList = [];
  let penaltyMiners = [];
  
  // Block information
  const [{ hash, number, parentHash, transactions, minerAddress, size, timestamp, penalties, extraData, validators}] = await Promise.all([getBlockByNumber(hexNum)])
  
  if (blockNumber <= blockNumber) {
    if (!(number % 900)) {
      // It's an epoch 0 block, we need to decode more data
      orderedMinerList = getMinersListFromExtradata(extraData);
      penaltyMiners = getPenaltiesMinersListFromPenalties(penalties);
    }
  } else {
    // V2
    orderedMinerList = getMasterNodesFromValidators(validators)
    penaltyMiners = getPenaltiesMinersListFromPenalties(penalties);
  }
  
  // Check if it's an epoch 0 block
  
  return {
    // transactions,
    hash, number,
    parentHash,
    minerAddress,
    size, timestamp, orderedMinerList, penaltyMiners
  }
}

const main = async (start, end, fileName) => {
  const blocksMap = {};
  
  // Load the very last block for calculating the time to mine
  blocksMap[start - 1] = await gettingBlockData(start - 1);
  // Start batch of PARALLEL_REQUEST
  for (let i = start; i < end; i = i+PARALLEL_REQUEST) {
    if (i > end) break
    const promises = [];
    let finalBlockNum = i+PARALLEL_REQUEST;
    if (finalBlockNum > end) {
      finalBlockNum = end
    }
    for (let j = i; j < finalBlockNum; j++) {
      if (j > end) break
      promises.push(gettingBlockData(j));
    }
    const tenBlocks = await Promise.all(promises);
    tenBlocks.forEach(b => blocksMap[b.number] = b)
  }

  const blocks = Object.values(blocksMap)
  if (blocks.length) {
    try {
      console.log('Writting data')
      await writeJsonFile(blocks, fileName);
    } catch (error) {
      console.log(`Error while trying to write to file`, error);
    }
  }
};

const start = process.env.START || 27307800
const end = process.env.END || 27307800 + PARALLEL_REQUEST
const fileName = process.env.OUTPUTFILE || 'output'
console.log(`Fetching block from ${start} to ${end} and write to in /output/${fileName}.json`)

main(parseInt(start), parseInt(end), fileName).then(() => process.exit()).catch(e => console.log(e));


const getM1M2= async(block) =>{
  const dataBuff = ethUtils.toBuffer(block.extraData)

  const sig = ethUtils.fromRpcSig(dataBuff.slice(dataBuff.length - 65, dataBuff.length))
  block.extraData = '0x' + ethUtils.toBuffer(block.extraData).slice(0, dataBuff.length - 65).toString('hex')
  
  block.miner = '0x'+block.miner.substring(3)
  
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
      nonce: ethUtils.toBuffer(block.nonce)
  })
  // console.log('block.headerHash', headerHash.hash())
  // console.log(JSON.stringify(sig))
  const pub = ethUtils.ecrecover(headerHash.hash(), sig.v, sig.r, sig.s)
  // console.log('block.pub', pub)
  let m1 = ethUtils.addHexPrefix(ethUtils.pubToAddress(pub).toString('hex'))
  m1 = m1.toLowerCase()
  let m2
  try {
      const dataBuffM2 = ethUtils.toBuffer(block.validator)
      const sigM2 = ethUtils.fromRpcSig(dataBuffM2.slice(dataBuffM2.length - 65, dataBuffM2.length))
      const pubM2 = ethUtils.ecrecover(headerHash.hash(), sigM2.v, sigM2.r, sigM2.s)
      m2 = ethUtils.addHexPrefix(ethUtils.pubToAddress(pubM2).toString('hex'))
      m2 = m2.toLowerCase()
  } catch (e) {
      logger.warn('Cannot get m2 of block %s. Error %s', block.number, e)
      m2 = 'N/A'
  }
  
  const minerAddress = `xdc${m1.slice(2)}`
  const signerAddress = `xdc${m2.slice(2)}`
  return { minerAddress, signerAddress }
}
