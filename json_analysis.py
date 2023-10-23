import plotly.graph_objects as go
import json
import numpy as np
import sys
import os
from plotly.subplots import make_subplots

args = sys.argv


if len(args) == 1:
	# load the first json file in the output directory
	files = os.listdir('output')
	jsons = [f for f in files if '.json' in f]
	if len(jsons) == 0:
		assert False # cannit find any json file in the output folder, please download one first
	else:
		blocks = json.load(open('output/' + jsons[0]))
else:
	blocks = json.load(open('output/' + args[1] + '.json'))

# important indices
TARGET_BLOCK = 7074000
EPOCH = 900
TARGET_END = TARGET_BLOCK + EPOCH

starting_number = int(blocks[0]['number'])
target_idx = TARGET_BLOCK - starting_number
target_end_idx = target_idx + EPOCH


def get_nodes_idx(start_idx, end_idx):
	# label each node from block[start_idx] to block[end_idx] with a number
	# first miner receives index 0.
	miners = []
	validators = []
	signers = []
	for i in range(start_idx, end_idx):
		miners.append(blocks[i]['minerAddress'].lower())
		# validators.append(blocks[i]['validatorAddress'].lower())
		# signers.extend([s.lower() for s in blocks[i]['signers']])
	num_miners = len(set(miners))
	# num_validators = len(set(validators))
	num_signers = len(set(signers))
	# print("number of unique miners:", len(set(miners)))
	# print("number of unique validators:", len(set(validators)))
	# print("number of unique signers:", len(set(signers)))
	# print("number of unique master ndoes (miners + validators):", len(set(miners + validators)))
	# print("number of unique master ndoes (miners + validators + signers):", len(set(miners + validators + signers)))
	node_idx = {}
	count = 0
	for node_list in [miners, signers, validators]:
		for node in node_list:
			if not node in node_idx.keys():
				node_idx[node] = count
				count += 1
	return node_idx



# get number list and offset it by the target block, so that the target block has a number of 0.
number_list = [b['number'] for b in blocks]
number_list_offset = [int(n) - TARGET_BLOCK for n in number_list]


# # get the time intervals between neighbor blocks using their timestamps
time_list = [int(b['timestamp']) for b in blocks]
time_diff = [time_list[i + 1] - time_list[i] for i in range(len(time_list) - 1)]

# size
size_list = [int(b['size']) for b in blocks[:-1]]



other_diff_list = time_diff[0:target_idx] + time_diff[target_end_idx:]
other_size_list = size_list[0:target_idx] + time_diff[target_end_idx:]

target_diff_list = time_diff[target_idx:target_end_idx]
target_size_list = size_list[target_idx:target_end_idx]


# Compute the range of all the complete epochs. Target epoch is always computed even if it is incomplete.
num_epoches_before = int(target_idx / EPOCH)
min_start_idx = target_idx - EPOCH * num_epoches_before
num_epoches_after = int((len(blocks) - target_idx) / EPOCH) + 1
max_end_idx = min(len(blocks), target_idx + EPOCH * num_epoches_after)
epochs = []
while min_start_idx < max_end_idx:
	epochs.append([min_start_idx, min(min_start_idx + EPOCH, max_end_idx)])
	min_start_idx += EPOCH

# Label the miner and validator of all blocks
miner_list = []
validator_list = []
idx_list = []
for each_epoch in epochs:
	node_idx = get_nodes_idx(each_epoch[0], each_epoch[1])
	for idx in range(each_epoch[0], each_epoch[1]):
		block = blocks[idx]
		miner_list.append(node_idx[block['minerAddress'].lower()])
		# validator_list.append(node_idx[block['validatorAddress'].lower()])
		idx_list.append(idx - target_idx)


# prepare the plots
fig = make_subplots(rows=2, cols=1,
					specs=[[{"secondary_y": False}], [{"secondary_y": True}]],
					subplot_titles=("The miner, validator, and the size of the signer group of each block",
									"Block size and latency over time"))


# Plot the miner, validator, and signer group size of every block
fig.add_trace(go.Scatter(x=idx_list, y=miner_list, name='miner idx'), row=1, col=1)
# fig.add_trace(go.Scatter(x=idx_list, y=validator_list, name='validator idx'),row=1, col=1)
# num_signers = [int(blocks[idx + target_idx]['numOfSigners']) for idx in idx_list]
num_signers = 0

block_number = np.arange(len(blocks)) - (TARGET_BLOCK - starting_number)
# fig.add_trace(
#     go.Scatter(x=idx_list, y=num_signers, name="size of the signer group"), row=1, col=1
# )
tick_step = 300
fig.update_xaxes(title='block number (0 is block-7074000)', row=1, col=1, tickvals=idx_list[::tick_step])
fig.update_yaxes(title='master node index within the epoch', row=1, col=1)



# plot evolution of block size and latency over time
print(size_list)
fig.add_trace(
    go.Scatter(x=np.arange(len(size_list)) - target_idx, y=size_list, name="size"),
    secondary_y=False, row=2, col=1
)
# fig.add_trace(
#     go.Scatter(x=np.arange(len(time_diff)) - target_idx, y=time_diff, name="block timestamp interval"),
#     secondary_y=True, row=2, col=1
# )

fig.update_xaxes(title_text="block number (0 is block-7074000)", row=2, col=1)
fig.update_yaxes(title_text="block size", row=2, col=1, secondary_y=False)
# fig.update_yaxes(title_text="time interval (second)", row=2, col=1, secondary_y=True)


fig.show()
fig.write_html("results.html")
