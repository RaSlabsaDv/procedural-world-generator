# Lake basins v1

Frozen before implementation. Identity `lake-basins-v1`. This is an illustrative
static spill-level model, not a calibrated simulation or a rainfall water balance.

## Candidates and selection

Reuse the authoritative float32 priority-flood surface through an internal output;
never reconstruct it from height + depressionDepth or run priority-flood twice.
Candidate cells are non-Ocean with positive depressionDepth. D8 connectivity and
EXACT equality of authoritative surface levels define components (NW,N,NE,W,E,SW,S,SE).
No epsilon merges different surfaces. The common level is the static water level.
Zero-depth shore/Ocean cells are not members. Components are enumerated by minimum
row-major index using iterative traversal.

Eligible components contain at least 16 cells, have maximum depth >= .01 times the
request's heightMultiplier (double comparison), and contain an existing river cell.
The complete selected area is bounded by integer floor(landCount*8/100); at most 64
whole components are selected. Rank by descending maximum flowAccumulation, then
descending maximum float32 depth, then ascending minimum index. Greedily accept a
whole candidate if it fits; otherwise skip it. Never trim membership or lower a
level to meet the budget. Empty output is valid. Unselected depressions remain
analysis-only terrain. IDs 0..B-1 follow selected components' minimum index order.

## Connections and wire contract

Required result.lakes has exactly five fields:
- algorithmVersion: lake-basins-v1.
- lakeIdByCell: int32[N], -1 outside selected lakes.
- basins: at most 64 descriptors, ordered by id, with required id, waterLevel
  (float32), cellCount, primarySpillFrom and primarySpillTo.
- spillFromCells: ascending unique int32[E], every selected member whose receiver
  leaves its lake. Targets are read from existing hydrology.receiverIndex.
- riverCrossingFromCells: ascending unique int32[X], every existing river source
  with a receiver, different source/target lake IDs and at least one selected lake.

All analysis exits are retained, including non-river ones. A descriptor's primary
spill is the exit with greatest source accumulation, then least source index,
then least target index. It is representative metadata, NOT a reroute or a claim
that all drainage exits there. Positive-depth members cannot be terminal Ocean or
boundary cells. Every selected component has at least one exit in the acyclic graph.
Different selected lake IDs on an edge describe a lake-to-lake transition. A source
outside/inside describes an inlet/outlet. Submerged river cells remain unchanged.
No discharge, retained volume, dynamic filling or simulation conservation is claimed.

## Ownership, complexity and budgets

Required immutable C# records own their arrays. No per-cell objects/hash sets,
recursive traversal, clocks or new dependencies. Reuse lakeIdByCell during traversal
as component labels and river flags. One int32[N] queue and a fixed candidate array
of at most floor(N/16) five-4-byte-field structs are scratch. Up to64 selection passes
over candidates keep time O(N) with a fixed bound; only at most 64 selected records
are sorted. A dictionary of at most 64 roots maps component labels to final IDs.

Conservative numeric output: 4N+4E+4X <= 12N (3 MiB at cap), plus five numeric fields
per descriptor (<= 1280 bytes). In fact E<=selected area<=.08N. Scratch is 4N plus
20*floor(N/16) bytes (1.3125 MiB at cap), plus bounded selection metadata/headers.
The reused drainage surface adds 4N live bytes (1 MiB at cap), not a second surface
allocation; other finalized terrain/drainage/river arrays and JSON are excluded.
Client normalization owns corresponding vectors; validation scratch remains O(N).

## Validation, versions and preservation

Strict decoding verifies keys/identity/order/budgets, descriptors, counts, connected
membership, Ocean exclusion, positive depth and level consistency using established
float tolerance. Check every exit/crossing against the received graph and network,
including completeness, primary choice and basin references. Client does not derive
candidates or reproduce their global selection ranking. All vectors/descriptors
participate in full Local/Remote comparison; integers are exact, floats use the
existing 1e-6+1e-5*max(abs(a),abs(b)) tolerance.

Generation becomes diverse-landscape-v13; result/workload/profile become v14. Noise,
hydraulic, drainage and river identities remain unchanged. Existing fields and all
simulation summaries remain unchanged. Hosts retain whole-call computeMs, including
lake analysis but excluding JSON, transfer, decoding/comparison and rendering.
No lake control, carving, GPU buffer or water surface is added. Keep old benchmark
identities/fingerprints; README empty. Next: 3D river/lake surfaces, shore transitions
and suppression of submerged channel surfaces. Stock SSAO remains deferred.
