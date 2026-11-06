namespace WorldGenerator.Core.Tests.Historical.V2;

public static class TerrainGenerator
{
    public static TerrainResult Generate(TerrainRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        var preparation = TerrainValidator.Prepare(request);
        if (!preparation.IsValid)
            throw new ArgumentException(string.Join("; ", preparation.Errors.Select(e => $"{e.Field}: {e.Code}")), nameof(request));
        return GenerateValidated(preparation.ValidatedRequest!);
    }

    public static TerrainResult GenerateValidated(ValidatedTerrainRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        var input = request.Request;
        var map = input.HeightMap;
        var seed = unchecked((uint)map.Seed);
        var bound = (float)map.HeightMultiplier;
        var terrain = new double[map.Width * map.Height];
        for (var y = 0; y < map.Height; y++)
            for (var x = 0; x < map.Width; x++)
                terrain[y * map.Width + x] = TerrainComposer.Compose(x * map.NoiseScale, y * map.NoiseScale, seed, input) * bound;
        var simulation = HydraulicSimulation.Run(terrain, map.Width, map.Height, bound,
            input.Iterations, input.Rainfall, input.Evaporation);
        var values = Array.ConvertAll(terrain, value => (float)value);
        return new(LandscapeEcology.Derive(values, input), simulation);
    }
}
