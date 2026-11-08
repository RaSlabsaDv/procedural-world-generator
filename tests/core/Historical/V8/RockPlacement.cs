// Frozen rock-v1 placement; historical fixtures must retain their original meaning.
namespace WorldGenerator.Core.Tests.Historical.V8;

/// <summary>Frozen decorative placement, independent of terrain/vegetation mutation and rendering.</summary>
internal static class RockPlacement
{
    internal const double MaxSlope = 1.8, SupportFraction = .7, Embedding = .10;
    internal const double TreeGap = .15, RockGap = .12, TrunkRadius = .075;
    private const uint AcceptanceSalt = 0x91E10DA5u, XSalt = 0xD192ED03u, ZSalt = 0xA24BAED5u;
    private const uint SizeSalt = 0x9FB21C65u, AspectSalt = 0xC13FA9A9u, RotationSalt = 0xF39CC061u;
    private const uint VariantSalt = 0xB7E15163u, PrioritySalt = 0x8AED2A6Bu, ClusterSalt = 0x6C8E9CF5u;

    // Value type: no per-candidate heap objects; only retained output records are allocated.
    internal readonly record struct Candidate(int CellIndex, float X, float Y, float Z,
        float ScaleX, float ScaleY, float ScaleZ, float Rotation, float GroundY,
        RockKind Kind, RockVariant Variant, double Priority)
    {
        internal RockInstance ToInstance() => new(CellIndex, X, Y, Z, ScaleX, ScaleY, ScaleZ, Rotation, GroundY, Kind, Variant);
    }
    private static readonly Comparer<Candidate> PriorityOrder = Comparer<Candidate>.Create((a, b) =>
    {
        var order = a.Priority.CompareTo(b.Priority);
        return order != 0 ? order : a.CellIndex.CompareTo(b.CellIndex);
    });

    internal static RockInstance[] Place(float[] heights, LandscapeBiome[] biomes, float[] slopes,
        float[] weights, TreeInstance[] trees, int width, int height, uint seed, double noiseScale)
    {
        var candidates = new Candidate[(width - 1) * (height - 1)];
        var treeGrid = new int[width * height];
        for (var t = 0; t < trees.Length; t++) treeGrid[trees[t].CellIndex] = t + 1;
        var count = 0;
        for (var z = 0; z < height - 1; z++)
            for (var x = 0; x < width - 1; x++)
            {
                var i = z * width + x;
                var slope = 0.0; var rock = 0.0; var eligible = true;
                for (var corner = 0; corner < 4; corner++)
                {
                    var j = i + (corner % 2) + (corner / 2) * width;
                    if (biomes[j] == LandscapeBiome.Ocean || slopes[j] > MaxSlope) { eligible = false; break; }
                    slope += slopes[j]; rock += weights[j * SurfaceCoverage.ChannelCount + 3];
                }
                if (!eligible) continue;
                slope /= 4; rock /= 4;
                var cluster = Cluster(x, z, seed, noiseScale);
                var kind = slope >= .35 && rock >= .2 ? RockKind.Outcrop : slope >= .12 && cluster >= .55 ? RockKind.Scree : RockKind.Boulder;
                var chance = kind switch { RockKind.Outcrop => .10 + .28 * cluster, RockKind.Scree => .08 + .55 * Smooth(.45, .75, cluster), _ => .025 + .10 * cluster };
                if (ValueNoise.LatticeValue(x, z, seed ^ AcceptanceSalt) >= chance) continue;
                var candidate = Transform(x, z, width, seed, kind);
                var fx = (double)candidate.X - x; var fz = (double)candidate.Z - z;
                var (min, max) = Support(heights, width, i, fx, fz, candidate.ScaleX);
                if (max - min > SupportFraction * candidate.ScaleY) continue;
                candidate = candidate with { Y = (float)(min - Embedding * candidate.ScaleY), GroundY = VegetationGenerator.Surface(heights, width, i, fx, fz) };
                if (TreeOverlap(candidate, treeGrid, trees, width, height)) continue;
                candidates[count++] = candidate;
            }
        return Select(candidates, count, width, height);
    }

    internal static double Cluster(int x, int z, uint seed, double scale) =>
        TerrainComposer.Fbm(x * scale * .8 + 71, z * scale * .8 + 29, seed ^ ClusterSalt, 3);

    internal static Candidate Transform(int x, int z, int width, uint seed, RockKind kind)
    {
        double Hash(uint salt) => ValueNoise.LatticeValue(x, z, seed ^ salt);
        var size = Hash(SizeSalt);
        var sx = (float)(kind switch { RockKind.Outcrop => .28 + .08 * size, RockKind.Scree => .12 + .06 * size, _ => .22 + .10 * size });
        var sy = (float)(kind switch { RockKind.Outcrop => .48 + .32 * size, RockKind.Scree => .10 + .10 * size, _ => .24 + .18 * size });
        return new(z * width + x, (float)(x + .4 + .2 * Hash(XSalt)), 0, (float)(z + .4 + .2 * Hash(ZSalt)),
            sx, sy, (float)(sx * (.7 + .3 * Hash(AspectSalt))), (float)(2 * Math.PI * Hash(RotationSalt)), 0,
            kind, Hash(VariantSalt) < .5 ? RockVariant.Angular : RockVariant.Rounded, Hash(PrioritySalt));
    }

    /// <summary>Extrema on a square cut by the rendered triangle diagonal (no sampling approximation).</summary>
    internal static (double Min, double Max) Support(float[] values, int width, int i, double x, double z, double radius)
    {
        var x0 = x - radius; var x1 = x + radius; var z0 = z - radius; var z1 = z + radius;
        var min = double.PositiveInfinity; var max = double.NegativeInfinity;
        Include(x0, z0); Include(x1, z0); Include(x0, z1); Include(x1, z1);
        Cross(x0, 1 - x0); Cross(x1, 1 - x1); Cross(1 - z0, z0); Cross(1 - z1, z1);
        return (min, max);
        void Cross(double px, double pz) { if (px >= x0 && px <= x1 && pz >= z0 && pz <= z1) Include(px, pz); }
        void Include(double px, double pz)
        {
            var value = px + pz <= 1
                ? values[i] + ((double)values[i + 1] - values[i]) * px + ((double)values[i + width] - values[i]) * pz
                : values[i + width + 1] + ((double)values[i + width] - values[i + width + 1]) * (1 - px) + ((double)values[i + 1] - values[i + width + 1]) * (1 - pz);
            min = Math.Min(min, value); max = Math.Max(max, value);
        }
    }

    internal static RockInstance[] Select(Candidate[] candidates, int count, int width, int height)
    {
        Array.Sort(candidates, 0, count, PriorityOrder);
        var grid = new int[width * height];
        var accepted = new RockInstance[Math.Min(count, TerrainLimits.MaxRocks)]; var used = 0;
        for (var c = 0; c < count && used < TerrainLimits.MaxRocks; c++)
        {
            var rock = candidates[c]; var collision = false;
            var x = rock.CellIndex % width; var z = rock.CellIndex / width;
            for (var nz = Math.Max(0, z - 2); nz <= Math.Min(height - 2, z + 2) && !collision; nz++)
                for (var nx = Math.Max(0, x - 2); nx <= Math.Min(width - 2, x + 2); nx++)
                {
                    var slot = grid[nz * width + nx]; if (slot == 0) continue;
                    var other = accepted[slot - 1];
                    if (Overlaps(rock.X, rock.Z, other.X, other.Z, (double)rock.ScaleX + other.ScaleX + RockGap)) { collision = true; break; }
                }
            if (collision) continue;
            accepted[used] = rock.ToInstance(); grid[rock.CellIndex] = ++used;
        }
        Array.Resize(ref accepted, used);
        Array.Sort(accepted, (a, b) => a.CellIndex.CompareTo(b.CellIndex));
        return accepted;
    }

    private static bool TreeOverlap(Candidate rock, int[] grid, TreeInstance[] trees, int width, int height)
    {
        var x = rock.CellIndex % width; var z = rock.CellIndex / width;
        for (var nz = Math.Max(0, z - 2); nz <= Math.Min(height - 2, z + 2); nz++)
            for (var nx = Math.Max(0, x - 2); nx <= Math.Min(width - 2, x + 2); nx++)
            {
                var slot = grid[nz * width + nx]; if (slot == 0) continue;
                var tree = trees[slot - 1];
                if (Overlaps(rock.X, rock.Z, tree.X, tree.Z, rock.ScaleX + TrunkRadius * tree.Scale + TreeGap)) return true;
            }
        return false;
    }
    private static bool Overlaps(float x, float z, float ox, float oz, double clearance) =>
        ((double)x - ox) * ((double)x - ox) + ((double)z - oz) * ((double)z - oz) < clearance * clearance;
    private static double Smooth(double a, double b, double x) { var u = Math.Clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); }
}
