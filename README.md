## Set up
1. `nvm use`
2. `npm install`

## Run the scripts
1. Download blocks by running `START={{Block number to start}} END={{Block number to end}} OUTPUTFILE={{file name}} node downloadBlocks.js`
2. Find the duplicated transaction for address to "xdc0000000000000000000000000000000000000092" by running `FILENAME={{file name}} node find.js`


## How it works
1. You need to get a block by calling Xinfin API in block number ascending order
2. Per each block you receive, decode the block to get its miner address(See part of `downloadBlocks.js` that does the decoding job)
3. Once you have the miner address, we run the simply algorithm in `find.js`.

To find a transaction with to address "xdc0000000000000000000000000000000000000092" that is duplicates, it need to match below properties:
1. Same block `miner address` and transcation `from` address(within same block and its transaction)
2. Compare with the previous this miner address's nonce and input. If not changed, then it's going to be a duplicated hash. OR  you can simply just keep the last value of the transaction hash that matches the step 1, and compare when next time step 1 appears again. (See the commented section in `find.js`)

NOTE: I only wrote for `to` address of `xdc0000000000000000000000000000000000000092`. This may also works for below `to` addresses if there are any duplicates. (Duplicates shall only exist within same `to`)
- xdc0000000000000000000000000000000000000092
- xdc0000000000000000000000000000000000000094


## What is `blockDecoder` file
This file takes input of a stringified json block, return its block miner address. See the example in the `downloadBlocks.js` from line 56-64.

The file is a complied `go` file where we used some of the existing XinFin code to decode its encoded byte data. I copied the source code into the `blockDecoderSource.go` file. But this file can only be run within the Xinfin repo https://github.com/XinFinOrg/XDPoSChain.