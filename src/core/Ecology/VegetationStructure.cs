namespace WorldGenerator.Core;

/// <summary>Frozen grove, clearing and edge policy; see docs/specs/VEGETATION_STRUCTURE_V1.md.</summary>
internal static class VegetationStructure
{
    private const uint GroveSalt = 0xD6E8FEB9u, ClearingSalt = 0xA5A3564Du;
    private const double GroveFrequency = .45, ClearingFrequency = 1.7;
    private const double GroveStart = .32, GroveEnd = .62, ClearingStart = .30, ClearingEnd = .52;
    private const int EdgeStart = 1, ForestEdgeEnd = 4, SavannaEdgeEnd = 3;

    internal static void Apply(float[] density, LandscapeBiome[] biomes, float[] slopes, TerrainRequest request)
    {
        var map = request.HeightMap;
        var distance = EdgeDistances(biomes, slopes, map.Width, map.Height);
        var seed = unchecked((uint)map.Seed);
        for (var y = 0; y < map.Height; y++)
            for (var x = 0; x < map.Width; x++)
            {
                var i = y * map.Width + x;
                if (distance[i] == 0 || density[i] == 0) { density[i] = 0; continue; }
                var savanna = biomes[i] == LandscapeBiome.Savanna;
                var structure = Mask(x, y, seed, map.NoiseScale, savanna);
                var edge = Smooth(EdgeStart, savanna ? SavannaEdgeEnd : ForestEdgeEnd, distance[i]);
                density[i] = (float)(((double)density[i] * structure) * edge * request.VegetationDensity);
            }
    }

    internal static double Mask(int x, int y, uint seed, double noiseScale, bool savanna)
    {
        var px = x * noiseScale; var py = y * noiseScale;
        var grove = TerrainComposer.Fbm(px * GroveFrequency + 37, py * GroveFrequency + 19, seed ^ GroveSalt, 3);
        var clearing = TerrainComposer.Fbm(px * ClearingFrequency + 53, py * ClearingFrequency + 7, seed ^ ClearingSalt, 2);
        var cluster = Smooth(GroveStart, GroveEnd, grove);
        var opening = Smooth(ClearingStart, ClearingEnd, clearing);
        return savanna ? (.70 + .30 * cluster) * (.65 + .35 * opening)
            : (.12 + .88 * cluster) * (.20 + .80 * opening);
    }

    internal static int[] EdgeDistances(LandscapeBiome[] biomes, float[] slopes, int width, int height)
    {
        var distances = new int[biomes.Length];
        var queue = new int[biomes.Length];
        int head = 0, tail = 0;
        for (var y = 0; y < height; y++)
            for (var x = 0; x < width; x++)
            {
                var i = y * width + x;
                var kind = EligibleKind(i);
                if (kind is null) continue;
                var boundary = x == 0 || x == width - 1 || y == 0 || y == height - 1
                    || EligibleKind(i - 1) != kind || EligibleKind(i + 1) != kind
                    || EligibleKind(i - width) != kind || EligibleKind(i + width) != kind;
                distances[i] = boundary ? 1 : int.MaxValue;
                if (boundary) queue[tail++] = i;
            }
        while (head < tail)
        {
            var i = queue[head++]; var kind = EligibleKind(i);
            var x = i % width; var y = i / width;
            if (x > 0) Visit(i - 1);
            if (x + 1 < width) Visit(i + 1);
            if (y > 0) Visit(i - width);
            if (y + 1 < height) Visit(i + width);
            void Visit(int next)
            {
                if (distances[next] != int.MaxValue || EligibleKind(next) != kind) return;
                distances[next] = distances[i] + 1;
                queue[tail++] = next;
            }
        }
        return distances;
        TreeKind? EligibleKind(int i) => slopes[i] < LandscapeBiomeClassifier.MaxForestSlope ? LandscapeBiomeClassifier.Kind(biomes[i]) : null;
    }

    private static double Smooth(double a, double b, double value)
    {
        var u = Math.Clamp((value - a) / (b - a), 0, 1);
        return u * u * (3 - 2 * u);
    }
}
