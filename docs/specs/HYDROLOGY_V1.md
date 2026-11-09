# Hydrology v1 — drainage foundation

Policy frozen before implementation. Hydrology identity d8-priority-flood-v1.
Generation algorithm diverse-landscape-v11 extends v10 with derived drainage only;
height composition/erosion/ecology/coverage/instances remain numerically unchanged.
Result landscape-ecology-v12, workload landscape-ecology-hydraulic-v12 and execution
profile landscape-worker-json-v12 include this computation/output. No lake/river UI.

## Routing

Input is the finalized float32 post-erosion heightfield and authoritative Ocean biome
mask. Preserve both arrays. Dimensions retain canonical 2..512 and 262144-cell limits.
D8 means one receiver among 8 neighbors, not a steepest-gradient guarantee. Traversal
order: NW,N,NE,W,E,SW,S,SE (dy=-1..1, dx=-1..1, excluding0,0). Row-major index=y*width+x.

Initialize all receiver indices to internal undiscovered sentinel -2. Seed ALL Ocean
cells and ALL boundary land cells as terminals (-1), using their original elevation.
Use a bounded binary min heap ordered by (filled float32 elevation, integer cellIndex).
Mark discovery when enqueued. Pop the minimum, append its index to processing order;
for each undiscovered neighbor, set receiver to the popped cell and filled elevation
to max(original neighbor height, popped filled elevation), then enqueue exactly once.
No random numbers, floating epsilon, recursive traversal or unstable tie ordering.
Every nonterminal receiver was already popped, so cycles are impossible even on flats.
All cells reach a seeded outlet through connected D8 adjacency, including seaLevel=0.

Priority-flood computes a minimum spill analysis surface; flats have a deterministic
index/order bias. It is not a physical river/channel solver. Ocean termini use actual
seafloor sample heights, not a global sea-level fill. Interior basins are routed over
their spill level in analysis; no terrain height or displayed water level is changed.

## Accumulation and output

Land contributes 1 catchment cell; Ocean contributes 0. Initialize uint32 accumulation
accordingly, then traverse processing order backwards and add each nonterminal's
count to its receiver. Terminal counts sum to total land cells. Counts are contributing
area in cells, not discharge/rainfall. Integer maximum is 262144, exactly representable
in JSON/JS. Ocean can receive drainage but never routes onward.

Required nested result.hydrology contract:
- algorithmVersion: d8-priority-flood-v1.
- receiverIndex: int32[N], -1 iff Ocean or boundary; otherwise a D8 neighbor index.
- flowAccumulation: uint32[N].
- depressionDepth: float32[N], max(0, filledHeight-originalHeight).

Depth subtraction uses float32 arithmetic; zero stays positive zero. Depression depth
is potential analysis fill, NOT a lake mask, retained water or an instruction to flood
all low land. Float comparison uses the existing 1e-6+1e-5*max(abs(a),abs(b)) tolerance;
receivers/accumulation/version compare exactly.

## Complexity, ownership and validation

O(N log N), O(N) storage. Output 3 arrays×4N=12N bytes (3 MiB at cap). Scratch: filled
float32, processing-order int32 and heap indices int32,12N bytes (3 MiB); receiver -2
also encodes discovery, avoiding another visited array. Total numeric hydrology
storage 6 MiB at cap, plus fixed array/object headers. No per-cell heap objects or
allocation growth; no clocks, JSON, HTTP, DOM or random generator in the analyzer.
Both hosts include analysis within existing whole-call computeMs.

Client strict decoding copies into Int32Array/Uint32Array/Float32Array, checks required
keys/version/length/finite ranges, outlet iff rules, D8 adjacency, acyclicity and
accumulation recurrence/terminal mass. These verify a graph contract, not reimplement
priority-flood. Temporary graph-validation counters/queue are bounded O(N). New
workload identities prevent mixing v11 measurements with v12. Existing exports retain
older records with their actual identities; no migration pretends equivalent work.

## Acceptance and next steps

Use literal small slopes/depressions/plateaus, all-Ocean/no-Ocean, islands, rectangular/
minimum/maximum maps, invariants and an independent reference. Preserve pre-hydrology
result/simulation fingerprints excluding new fields/identities. Verify all required
host/client fields, corruption rejection, complete comparison and real WASM/API parity.
No hydrology arrays enter visualization/GPU buffers; current ocean/LOD/Bloom stay intact.
PWA update last. README empty, docs/UI English, no dependency/native timer change.

Subsequent stages: river extraction/channel geometry; then lake basins/retention/spill
policy; then separate 3D river/lake surfaces with banks/depth/flow. Detailed timings
and progress/cancellation remain an independent execution track.

Verification evidence is reproducible with tests/browser/hydrology.cjs and
tests/reference/hydrology_preservation.py. The latter uses six pre-change API
fingerprints committed under tests/reference/fixtures/, rather than deriving an
expected result from the new implementation. Literal small graph/basin fixtures
also live in tests/core/Hydrology/. Browser payload observations are documented in
BENCHMARKING.md; numeric-array budgets exclude JSON and parsed JS number arrays.
