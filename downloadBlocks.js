
const fs = require('fs');
const path = require("path");
const Axios = require("axios");
const util = require('util');

const PARALLEL_REQUEST = 10;

const axios = Axios.create({
  baseURL: "https://mnrpc.xinfin.network",
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

  const blockJson = convertFieldToInt(['nonce', 'gasUsed', 'difficulty', 'number', 'size', 'timestamp', 'totalDifficulty', 'gasLimit'], data.result);
  // Assign one processor to run the binary go file
  const exec = util.promisify(require('child_process').exec);
  const {stdout, stderr} = await exec(`./blockDecoder '${JSON.stringify(blockJson)}'`);
  
  if (stderr) {
    console.log('Failed to get miner and validator address: ', stderr);
  }
  const reverseEngineeringData = stdout.split('\n');
  return {
    ...blockJson,
    minerAddress: reverseEngineeringData[0].toLowerCase(),
    validatorAddress: reverseEngineeringData[1].toLowerCase(),
    validatorMapping: reverseEngineeringData[2].split(' ').join(",")
  }
}

const gettingBlockData = async (blockNumber) => {
  console.log(`getting block ${blockNumber}`);
  const hexNum = blockNumber.toString(16);
  // Block information
  const [{ hash, extraData, number, parentHash, transactions, minerAddress}] = await Promise.all([getBlockByNumber(hexNum)])

  return {
    transactions,
    hash, number,
    parentHash,
    minerAddress,
  }
}

const main = async (start, end, fileName) => {
  const blocksMap = {};
  // const blocks = [];
  
  // Load the very last block for calculating the time to mine
  blocksMap[start - 1] = await gettingBlockData(start - 1);
  // Start batch of PARALLEL_REQUEST
  for (let i = start; i < end; i = i+PARALLEL_REQUEST) {
    const promises = [];
    let finalBlockNum = i+PARALLEL_REQUEST;
    if (finalBlockNum > end) {
      finalBlockNum = end
    }
    for (let j = i; j < finalBlockNum; j++) {
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
