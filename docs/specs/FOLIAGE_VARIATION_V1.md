# Foliage variation v1

Policy frozen before implementation. Visual Stage 5B; presentation only.

Stage 5B resource/grouping bounds below describe the full-detail baseline.
[Tree LOD v1](TREE_LOD_V1.md) subsequently extends representation and storage;
these exact color equations remain current.

## Stable identity and color

Identity is unsigned generation seed, Core tree cellIndex, kind and variant. Neither
array position, camera, time nor Math.random participates. Hash initialization is
seed XOR imul(cellIndex, 0x9e3779b1) XOR imul(kind+1, 0x85ebca6b) XOR
imul(variant+1, 0xc2b2ae35). For each stream XOR its constant, then avalanche:
x ^= x >>> 16; x = imul(x, 0x7feb352d); x ^= x >>> 15;
x = imul(x, 0x846ca68b); x ^= x >>> 16. Interpret unsigned and divide by 2^32.
Streams brightness/warmth/saturation are 0xa511e9b3/0x63d83595/0xb5297a4d.

Existing species/variant sRGB palette integers are converted once per occupied group
by Three Color into linear RGB. Brightness b=.88+.24*u; warmth w=-.035+.07*v;
saturation s=.96+.08*t. First R*=b*(1+w), G*=b, B*=b*(1-w). Then compute linear
Rec.709 luminance L=.2126*R+.7152*G+.0722*B and channels L+s*(channel-L).
Clamp to [0,1] defensively; frozen palette/ranges do not reach clipping. Store final
linear RGB as float32. White Lambert crown materials apply this absolute color once;
no second palette multiplication, HSL conversion or extra gamma conversion.

## Ownership and budgets

One RGB float32 instanceColor attribute per occupied crown group, 12 bytes/tree:
196608 bytes at 16384 trees/view, 393216 bytes for two views. One additional occupied
vertex attribute location per crown program. Scratch Color is reused; no persistent
per-tree color objects, new texture or map-sized field. Trunks are unchanged.

Keep every Core record, instance matrix, category/variant group, geometry, material
count, shadow policy and draw count unchanged. Setup remains display CPU work,
outside computeMs/requestMs, with existing OperationLock deferral. Independent views
own their buffers. Mesh disposal releases instanceColor through Three's normal
InstancedMesh disposal path, including partial-setup failure cleanup.

## Verification and exclusions

Cover identity stability under reorder/insertion/removal, signed seed extremes,
linear palette bounds and single application, six groups, matrices/trunks, maximum
budget, independent buffers and failure disposal. Browser evidence pairs fixed
requests/camera/full Core hashes for broadleaf, conifer, savanna, mixed, sparse and
maximum scenes; screenshots intentionally change. Check real GPU attributes/colors,
Local/Remote equality, static lighting edits, narrow and offline behavior.

No LOD, wind, seasonal palettes, species, UI controls, dependencies, Core/workload
versions or benchmark methodology changes. Tree LOD is the next separate substep.
