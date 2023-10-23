var fs = require('fs');

const fileName = process.env.FILENAME
if (!fileName) {
  console.log("Please provide a FILENAME name")
  exit(1)
}
var blockList = JSON.parse(fs.readFileSync(`./output/${fileName}.json`, 'utf8'));

const allMinerStateMap = {}


blockList.forEach(block => {
  const minerAddress = block.minerAddress
  
  block.transactions.forEach(transaction => {
    const transactionFromAddress = transaction.from
    // Duplicates need to satisfy below condition
    if ((transaction.to == "xdc0000000000000000000000000000000000000092" || transaction.to == "xdc0000000000000000000000000000000000000094") && transactionFromAddress == minerAddress)  {
      // Set the state belong to this address if not exist
      const previousState = allMinerStateMap[minerAddress];
      
      if (previousState && previousState.nonce == transaction.nonce && previousState.input == transaction.input) {
        // The duplicates
        console.log(`Found duplicated transaction hash: ${transaction.hash} at block number ${block.number} with minerAddress ${minerAddress}`) 
      } else {
        allMinerStateMap[minerAddress] = {
          nonce: transaction.nonce,
          input: transaction.input
        }
      }
      
      // OR you can use below, which is easier. (Comment out line 24 to 32, replace with below)
      // if (previousState && previousState == transaction.hash ) {
      //   // The duplicates
      //   console.log(`Found duplicated transaction hash: ${transaction.hash} at block number ${block.number}`) 
      // } else {
      //   allMinerStateMap[minerAddress] = transaction.hash
      // }
    }
  })
});