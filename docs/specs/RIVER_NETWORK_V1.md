# River network v1

Policy frozen before implementation. Identity: `river-network-v1`.
This derived network extends finalized `d8-priority-flood-v1` drainage without
changing any terrain, ecology, drainage vector or hydraulic summary.

## Extraction and connectivity

Let L be the number of non-Ocean cells. Use integer arithmetic to compute
T = max(32, (L + 511) / 512), with integer division. Include a cell iff it is land
and its flowAccumulation is at least T. Keep all qualifying cells, even boundary
terminals and isolated qualifying outlets. Small maps may legitimately have none.
No pruning, random selection, smoothing or minimum-length policy applies.

Connectivity reuses hydrology.receiverIndex; do not transmit a second graph.
A qualifying land receiver continues the channel; an Ocean receiver is a mouth;
a -1 receiver denotes a boundary land outlet. Multiple included upstream cells
sharing a receiver form a confluence. Land accumulation increases downstream, so
a selected nonterminal cannot route to unselected land. Ocean is never selected.
Existing acyclicity and outlet reachability carry over from drainage.

For each selected cell, illustrative width in grid-cell units is
clamp(0.35 + 0.25 * sqrt(accumulation / T), 0.6, 3.0). Use double intermediates,
floating-point division, then one final float32 cast. Widths cannot decrease along
land channels. These are metadata, not physical discharge or calibrated hydraulics.

## Contract and ownership

Required result.rivers:
- algorithmVersion: river-network-v1.
- cellIndices: int32[K], unique, strictly ascending row-major cell indices.
- widths: float32[K], matching indices, finite in [0.6, 3.0].

K is between zero and L. Core uses linear scans and two exact-sized output arrays:
8K numeric bytes, at most 2 MiB at 512x512, with no per-cell objects or scratch
arrays. Inputs are read-only and arrays belong to each result. Existing hydrology
connectivity is reused. Both hosts include extraction in whole-call computeMs;
JSON, transfer, decoding and rendering remain outside that timer.

Client decoding verifies supported/required keys, bounded lengths, indices,
complete threshold membership, downstream connectivity and width consistency.
Verification scans the received graph; it does not generate rivers independently.
Normalize to Int32Array/Float32Array. Compare identities/indices exactly and widths
with the existing 1e-6 + 1e-5 * max(abs(a), abs(b)) float tolerance. A river mismatch
makes numeric equivalence fail, including mismatched network lengths.

Generation identity becomes diverse-landscape-v12; result/workload/profile become
landscape-ecology-v13 / landscape-ecology-hydraulic-v13 / landscape-worker-json-v13.
Noise, simulation and drainage identities stay unchanged. Old records retain their
actual identities; they cannot form comparable v13 workload pairs.

## Limits and next stage

Priority-flood follows an analysis spill surface across depressions. An extracted
channel crossing such a basin does not establish exposed flowing water there.
Depression depth is not a lake mask. Do not invent river surface elevations, carve
terrain, flood basins or upload river arrays to the GPU in this stage. No new UI
settings or river/lake surfaces are added. Current ocean, atmosphere, LOD and Bloom
remain unchanged; production SSAO stays deferred.

Next: specify lake basins, retained water and spill semantics, then render river
and lake surfaces using both network and basin data.
