namespace WorldGenerator.Core.Tests.Historical.V3;

/// <summary>Core-owned placement and bounded priority selection, independent of rendering.</summary>
internal static class HistoricalVegetation
{
    internal static HistoricalTreeInstance[] PlaceTrees(float[] heights, LandscapeBiome[] biomes, float[] slopes, float[] density, int width, int height, uint seed)
    {
        var chosen = new PriorityQueue<HistoricalTreeInstance, (double Priority, int Index)>();
        for (var z = 0; z < height - 1; z++)
            for (var x = 0; x < width - 1; x++)
            {
                var i = z * width + x;
                var kind = LandscapeBiomeClassifier.Kind(biomes[i]);
                if (kind is null || !Eligible(i, kind.Value) || !Eligible(i + 1, kind.Value) || !Eligible(i + width, kind.Value) || !Eligible(i + width + 1, kind.Value)) continue;
                var chance = ((double)density[i] + density[i + 1] + density[i + width] + density[i + width + 1]) / 4 * .65;
                if (Hash(0xC2B2AE35u) >= chance) continue;
                var tx = (float)(x + .15 + .7 * Hash(0x27D4EB2Fu));
                var tz = (float)(z + .15 + .7 * Hash(0x165667B1u));
                var tree = new HistoricalTreeInstance(i, tx, Surface(heights, width, i, tx - x, tz - z), tz,
                    (float)(.6 + .8 * Hash(0x94D049BBu)), (float)(2 * Math.PI * Hash(0x369DEA0Fu)), kind.Value);
                chosen.Enqueue(tree, (-Hash(0xDB4F0B91u), -i));
                if (chosen.Count > TerrainLimits.MaxTrees) chosen.Dequeue();
                double Hash(uint salt) => ValueNoise.LatticeValue(x, z, seed ^ salt);
            }
        return chosen.UnorderedItems.Select(item => item.Element).OrderBy(tree => tree.CellIndex).ToArray();
        bool Eligible(int j, TreeKind kind) => LandscapeBiomeClassifier.Kind(biomes[j]) == kind && slopes[j] < LandscapeBiomeClassifier.MaxForestSlope;
    }

    internal static float Surface(float[] heights, int width, int i, double x, double z) => (float)(x + z <= 1
        ? heights[i] + ((double)heights[i + 1] - heights[i]) * x + ((double)heights[i + width] - heights[i]) * z
        : heights[i + width + 1] + ((double)heights[i + width] - heights[i + width + 1]) * (1 - x) + ((double)heights[i + 1] - heights[i + width + 1]) * (1 - z));
}

internal sealed record HistoricalTreeInstance(int CellIndex, float X, float Y, float Z, float Scale, float Rotation, TreeKind Kind);
