namespace WorldGenerator.Core;

/// <summary>Sparse multi-cell decorative placement; frozen policy in ROCK_PLACEMENT_V2.md.</summary>
internal static class RockPlacement
{
    internal const double MaxSlope = 1.8, SupportFraction = .5, Embedding = .12;
    internal const double TreeGap = .25, RockGap = .40, TreeRadius = 1.05;
    internal const int NeighborCells = 8;
    internal const double MaxRadius = 3;
    private const uint ClassSalt = 0x3C6EF372u;
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
        float[] weights, TreeInstance[] trees, int width, int height, uint seed)
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
                var cluster = Cluster(x, z, seed);
                var kind = slope >= .35 && rock >= .2 ? RockKind.Outcrop : slope >= .12 && cluster >= .55 ? RockKind.Scree : RockKind.Boulder;
                var chance = (.003 + .05 * Smooth(.48, .72, cluster)) * (.35 + .65 * Math.Clamp(rock + .5 * slope, 0, 1));
                if (ValueNoise.LatticeValue(x, z, seed ^ AcceptanceSalt) >= chance) continue;
                var candidate = Transform(x, z, width, seed, kind);
                var fx = (double)candidate.X - x; var fz = (double)candidate.Z - z;
                if (!RockSupport.Try(heights, biomes, slopes, width, height, candidate.X, candidate.Z, candidate.ScaleX, out var support)) continue;
                var (min, max) = support;
                if (max - min > SupportFraction * candidate.ScaleY) continue;
                candidate = candidate with { Y = (float)(min - Embedding * candidate.ScaleY), GroundY = VegetationGenerator.Surface(heights, width, i, fx, fz) };
                if (TreeOverlap(candidate, treeGrid, trees, width, height)) continue;
                candidates[count++] = candidate;
            }
        return Select(candidates, count, width, height);
    }

    internal static double Cluster(int x, int z, uint seed) =>
        TerrainComposer.Fbm(x / 48.0 + 71, z / 48.0 + 29, seed ^ ClusterSalt, 2);

    internal static Candidate Transform(int x, int z, int width, uint seed, RockKind kind)
    {
        double Hash(uint salt) => ValueNoise.LatticeValue(x, z, seed ^ salt);
        var size = Hash(SizeSalt);
        var classHash = Hash(ClassSalt);
        var sizeClass = classHash < .10 ? 2 : classHash < .45 ? 1 : 0;
        if (kind == RockKind.Scree && sizeClass == 2) sizeClass = 1;
        var (minX, gainX, minY, gainY) = (kind, sizeClass) switch
        {
            (RockKind.Boulder, 0) => (.22, .23, .22, .23),
            (RockKind.Boulder, 1) => (.70, .65, .70, .50),
            (RockKind.Boulder, _) => (1.80, 1.20, 1.60, 1.00),
            (RockKind.Outcrop, 0) => (.30, .20, .45, .25),
            (RockKind.Outcrop, 1) => (.80, .60, 1.10, .70),
            (RockKind.Outcrop, _) => (1.80, 1.20, 2.00, 1.20),
            (_, 0) => (.18, .17, .12, .10),
            _ => (.40, .25, .25, .15)
        };
        var sx = (float)(minX + gainX * size); var sy = (float)(minY + gainY * size);
        var aspect = kind == RockKind.Outcrop ? .35 + .20 * Hash(AspectSalt) : .65 + .30 * Hash(AspectSalt);
        return new(z * width + x, (float)(x + .04 + .92 * Hash(XSalt)), 0, (float)(z + .04 + .92 * Hash(ZSalt)),
            sx, sy, (float)(sx * aspect), (float)(2 * Math.PI * Hash(RotationSalt)), 0,
            kind, Hash(VariantSalt) < .5 ? RockVariant.Angular : RockVariant.Rounded, Hash(PrioritySalt));
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
            for (var nz = Math.Max(0, z - NeighborCells); nz <= Math.Min(height - 2, z + NeighborCells) && !collision; nz++)
                for (var nx = Math.Max(0, x - NeighborCells); nx <= Math.Min(width - 2, x + NeighborCells); nx++)
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
        for (var nz = Math.Max(0, z - NeighborCells); nz <= Math.Min(height - 2, z + NeighborCells); nz++)
            for (var nx = Math.Max(0, x - NeighborCells); nx <= Math.Min(width - 2, x + NeighborCells); nx++)
            {
                var slot = grid[nz * width + nx]; if (slot == 0) continue;
                var tree = trees[slot - 1];
                if (Overlaps(rock.X, rock.Z, tree.X, tree.Z, rock.ScaleX + TreeRadius * tree.Scale + TreeGap)) return true;
            }
        return false;
    }
    private static bool Overlaps(float x, float z, float ox, float oz, double clearance) =>
        ((double)x - ox) * ((double)x - ox) + ((double)z - oz) * ((double)z - oz) < clearance * clearance;
    private static double Smooth(double a, double b, double x) { var u = Math.Clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); }
}
