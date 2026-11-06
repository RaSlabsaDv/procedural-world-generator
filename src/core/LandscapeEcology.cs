namespace WorldGenerator.Core;

internal static class LandscapeEcology
{
    internal static TerrainMap Derive(float[] values, TerrainRequest request)
    {
        var map = request.HeightMap;
        var count = values.Length;
        var bound = (float)map.HeightMultiplier;
        var seed = unchecked((uint)map.Seed);
        var ocean = Ocean(values, map.Width, map.Height, request.SeaLevel * bound);
        var moisture = new float[count]; var temperature = new float[count]; var slope = new float[count];
        var density = new float[count]; var biomes = new LandscapeBiome[count];
        for (var y = 0; y < map.Height; y++)
        for (var x = 0; x < map.Width; x++)
        {
            var i = y * map.Width + x;
            var h = bound == 0 ? 0 : values[i] / (double)bound;
            var px = x * map.NoiseScale; var py = y * map.NoiseScale;
            var patch = TerrainGenerator.Fbm(px * 1.3, py * 1.3, seed ^ 0x85EBCA6Bu, 3);
            moisture[i] = (float)Math.Clamp(request.GlobalMoisture + .7 * (TerrainGenerator.Fbm(px * .65 + 11, py * .65 + 23, seed ^ 0xB5297A4Du, 4) - .5) - .15 * h, 0, 1);
            temperature[i] = (float)Math.Clamp(.78 - .5 * h + .18 * (TerrainGenerator.Fbm(px * .3, py * .3, seed ^ 0x1B56C4E9u, 3) - .5), 0, 1);
            var left = Math.Max(0, x - 1); var right = Math.Min(map.Width - 1, x + 1);
            var top = Math.Max(0, y - 1); var bottom = Math.Min(map.Height - 1, y + 1);
            var dx = ((double)values[y * map.Width + right] - values[y * map.Width + left]) / (right - left);
            var dz = ((double)values[bottom * map.Width + x] - values[top * map.Width + x]) / (bottom - top);
            slope[i] = (float)Math.Sqrt(dx * dx + dz * dz);
            biomes[i] = Classify(ocean[i], h, moisture[i], temperature[i], slope[i], patch);
            density[i] = biomes[i] == LandscapeBiome.Forest
                ? (float)(Math.Clamp((moisture[i] - .45) / .4, 0, 1) * (.45 + .55 * patch) * Math.Clamp(1 - slope[i] / .8, 0, 1)) : 0;
        }
        var trees = PlaceTrees(values, biomes, slope, density, map.Width, map.Height, seed);
        return new(map.Width, map.Height, values, request.AlgorithmVersion, biomes, TerrainLimits.ResultVersion,
            moisture, temperature, slope, density, trees);
    }

    internal static LandscapeBiome Classify(bool ocean, double height, double moisture, double temperature, double slope, double patch) =>
        ocean ? LandscapeBiome.Ocean : slope > .8 || height > .86 && temperature < .4 ? LandscapeBiome.Rock :
        moisture < .36 ? LandscapeBiome.DryGrassland : moisture >= .53 && temperature > .25 && slope < .5 && patch > .42
            ? LandscapeBiome.Forest : LandscapeBiome.Grassland;

    internal static bool[] Ocean(float[] values, int width, int height, double sea)
    {
        var ocean = new bool[values.Length]; var queue = new Queue<int>();
        for (var i = 0; i < values.Length; i++)
            if ((i < width || i >= width * (height - 1) || i % width == 0 || i % width == width - 1) && values[i] <= sea)
            { ocean[i] = true; queue.Enqueue(i); }
        while (queue.TryDequeue(out var i))
        {
            var x = i % width; var y = i / width;
            Visit(x > 0 ? i - 1 : -1); Visit(x + 1 < width ? i + 1 : -1);
            Visit(y > 0 ? i - width : -1); Visit(y + 1 < height ? i + width : -1);
        }
        return ocean;
        void Visit(int j)
        {
            if (j >= 0 && !ocean[j] && values[j] <= sea) { ocean[j] = true; queue.Enqueue(j); }
        }
    }

    internal static TreeInstance[] PlaceTrees(float[] heights, LandscapeBiome[] biomes, float[] slopes, float[] density, int width, int height, uint seed)
    {
        var chosen = new PriorityQueue<TreeInstance, (double Priority, int Index)>();
        for (var z = 0; z < height - 1; z++)
        for (var x = 0; x < width - 1; x++)
        {
            var i = z * width + x;
            if (!Eligible(i) || !Eligible(i + 1) || !Eligible(i + width) || !Eligible(i + width + 1)) continue;
            var chance = ((double)density[i] + density[i + 1] + density[i + width] + density[i + width + 1]) / 4 * .65;
            if (Hash(0xC2B2AE35u) >= chance) continue;
            var tx = (float)(x + .15 + .7 * Hash(0x27D4EB2Fu));
            var tz = (float)(z + .15 + .7 * Hash(0x165667B1u));
            var tree = new TreeInstance(i, tx, Surface(heights, width, i, tx - x, tz - z), tz,
                (float)(.6 + .8 * Hash(0x94D049BBu)), (float)(2 * Math.PI * Hash(0x369DEA0Fu)));
            chosen.Enqueue(tree, (-Hash(0xDB4F0B91u), -i));
            if (chosen.Count > TerrainLimits.MaxTrees) chosen.Dequeue();
            double Hash(uint salt) => ValueNoise.LatticeValue(x, z, seed ^ salt);
        }
        return chosen.UnorderedItems.Select(item => item.Element).OrderBy(tree => tree.CellIndex).ToArray();
        bool Eligible(int i) => biomes[i] == LandscapeBiome.Forest && slopes[i] < .5;
    }

    internal static float Surface(float[] heights, int width, int i, double x, double z) => (float)(x + z <= 1
        ? heights[i] + ((double)heights[i + 1] - heights[i]) * x + ((double)heights[i + width] - heights[i]) * z
        : heights[i + width + 1] + ((double)heights[i + width] - heights[i + width + 1]) * (1 - x) + ((double)heights[i + 1] - heights[i + width + 1]) * (1 - z));
}
