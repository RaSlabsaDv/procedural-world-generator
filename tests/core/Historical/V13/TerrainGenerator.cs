namespace WorldGenerator.Core.Tests.Historical.V13;

// Test-only frozen composition/erosion/ecology pipeline; does not accept current host traffic.
internal static class TerrainGenerator
{
    internal static PreChannelResult Generate(TerrainRequest input)
    {
        input = input with { AlgorithmVersion = "diverse-landscape-v13" };
        var map = input.HeightMap;
        var seed = unchecked((uint)map.Seed);
        var bound = (float)map.HeightMultiplier;
        var terrain = new double[map.Width * map.Height];
        for (var y = 0; y < map.Height; y++)
            for (var x = 0; x < map.Width; x++)
                terrain[y * map.Width + x] = TerrainComposer.Compose(x, y, seed, input) * bound;
        var simulation = HydraulicSimulation.Run(terrain, map.Width, map.Height, bound,
            input.Iterations, input.Rainfall, input.Evaporation);
        var values = Array.ConvertAll(terrain, value => (float)value);
        return new(LandscapeEcology.Derive(values, input), simulation);
    }
}
