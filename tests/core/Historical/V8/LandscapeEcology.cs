// Frozen pre-regional-climate behavior; verified by unchanged v8 fingerprints.
namespace WorldGenerator.Core.Tests.Historical.V8;

internal static class LandscapeEcology
{
    internal static global::WorldGenerator.Core.Tests.Historical.PreHydrologyMap Derive(float[] values, TerrainRequest request)
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
                moisture[i] = (float)Math.Clamp(request.GlobalMoisture + .7 * (TerrainComposer.Fbm(px * .65 + 11, py * .65 + 23, seed ^ 0xB5297A4Du, 4) - .5) - .15 * h - .10 * Math.Max(0, request.GlobalWarmth - .6), 0, 1);
                temperature[i] = (float)Math.Clamp(request.GlobalWarmth + .18 - .5 * h + .24 * (TerrainComposer.Fbm(px * .3, py * .3, seed ^ 0x1B56C4E9u, 3) - .5), 0, 1);
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
        var rocks = RockPlacement.Place(values, biomes, slope, surfaceWeights, trees, map.Width, map.Height, seed, map.NoiseScale);
        // Placement consumes frozen base coverage; coastal appearance must not change rocks.
        CoastalSurfaces.Apply(surfaceWeights, values, ocean, moisture, temperature, slope, map.Width, map.Height, bound, request.SeaLevel);
        return new(map.Width, map.Height, values, request.AlgorithmVersion, biomes, "landscape-ecology-v8",
            moisture, temperature, slope, density, trees, surfaceWeights, rocks);
    }
}
