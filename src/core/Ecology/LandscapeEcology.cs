namespace WorldGenerator.Core;

internal static class LandscapeEcology
{
    internal static TerrainMap Derive(float[] values, TerrainRequest request)
    {
        var map = request.HeightMap;
        var count = values.Length;
        var bound = (float)map.HeightMultiplier;
        var seed = unchecked((uint)map.Seed);
        var ocean = OceanClassifier.Ocean(values, map.Width, map.Height, request.SeaLevel * bound);
        var moisture = new float[count]; var temperature = new float[count]; var slope = new float[count];
        var density = new float[count]; var biomes = new LandscapeBiome[count];
        for (var y = 0; y < map.Height; y++)
            for (var x = 0; x < map.Width; x++)
            {
                var i = y * map.Width + x;
                var h = bound == 0 ? 0 : values[i] / (double)bound;
                var px = x * map.NoiseScale; var py = y * map.NoiseScale;
                var patch = TerrainComposer.Fbm(px * 1.3, py * 1.3, seed ^ 0x85EBCA6Bu, 3);
                (moisture[i], temperature[i]) = RegionalClimate.Sample(x, y, seed, h, request.GlobalMoisture, request.GlobalWarmth);
                var left = Math.Max(0, x - 1); var right = Math.Min(map.Width - 1, x + 1);
                var top = Math.Max(0, y - 1); var bottom = Math.Min(map.Height - 1, y + 1);
                var dx = ((double)values[y * map.Width + right] - values[y * map.Width + left]) / (right - left);
                var dz = ((double)values[bottom * map.Width + x] - values[top * map.Width + x]) / (bottom - top);
                slope[i] = (float)Math.Sqrt(dx * dx + dz * dz);
                biomes[i] = LandscapeBiomeClassifier.Classify(ocean[i], h, moisture[i], temperature[i], slope[i], patch);
                density[i] = LandscapeBiomeClassifier.Density(biomes[i], moisture[i], slope[i], patch, 1);
            }
        VegetationStructure.Apply(density, biomes, slope, request);
        var surfaceWeights = SurfaceCoverage.Derive(values, biomes, moisture, temperature, slope, bound);
        var trees = VegetationGenerator.PlaceTrees(values, biomes, slope, density, map.Width, map.Height, seed);
        var rocks = RockPlacement.Place(values, biomes, slope, surfaceWeights, trees, map.Width, map.Height, seed);
        // Placement consumes frozen base coverage; coastal appearance must not change rocks.
        CoastalSurfaces.Apply(surfaceWeights, values, ocean, moisture, temperature, slope, map.Width, map.Height, bound, request.SeaLevel);
        return new(map.Width, map.Height, values, request.AlgorithmVersion, biomes, TerrainLimits.ResultVersion,
            moisture, temperature, slope, density, trees, surfaceWeights, rocks);
    }
}
