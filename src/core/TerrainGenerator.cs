namespace WorldGenerator.Core;

public sealed record SimulationSummary(
    int Iterations, long CellIterations, double InitialTerrainMass, double FinalTerrainMass,
    double SuspendedSediment, double WaterAdded, double WaterRemaining, double WaterEvaporated);

public sealed record TerrainResult(HeightMapResult HeightMap, SimulationSummary Simulation);

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
        {
            var px = x * map.NoiseScale;
            var py = y * map.NoiseScale;
            var wx = px + input.WarpStrength * (2 * Fbm(px * .35 + 17, py * .35 + 31, seed ^ 0xA341316Cu, 3) - 1);
            var wy = py + input.WarpStrength * (2 * Fbm(px * .35 + 47, py * .35 + 13, seed ^ 0xC8013EA4u, 3) - 1);
            var broad = Fbm(wx * .2, wy * .2, seed ^ 0xAD90777Du, map.Octaves);
            broad *= broad;
            var ridge = 1 - Math.Abs(2 * Fbm(wx * .8, wy * .8, seed ^ 0x7E95761Eu, map.Octaves) - 1);
            ridge = ridge * ridge * ridge;
            var detail = Fbm(wx * 2, wy * 2, seed ^ 0x9E3779B9u, map.Octaves);
            terrain[y * map.Width + x] = Math.Clamp((1 - input.MountainStrength) * broad + input.MountainStrength * ridge + .1 * (detail - .5), 0, 1) * bound;
        }
        var simulation = HydraulicSimulation.Run(terrain, map.Width, map.Height, bound,
            input.Iterations, input.Rainfall, input.Evaporation);
        var values = new float[terrain.Length];
        var biomes = new BiomeId[terrain.Length];
        for (var i = 0; i < terrain.Length; i++)
        {
            values[i] = (float)terrain[i];
            biomes[i] = BiomeClassifier.Classify(values[i], bound);
        }
        return new(new(map.Width, map.Height, values, input.AlgorithmVersion, biomes, HeightMapResult.CurrentVersion), simulation);
    }

    private static double Fbm(double x, double y, uint seed, int octaves)
    {
        double sum = 0, amplitudeSum = 0, amplitude = 1, frequency = 1;
        for (var octave = 0; octave < octaves; octave++)
        {
            sum += ValueNoise.Sample(x * frequency, y * frequency, seed) * amplitude;
            amplitudeSum += amplitude;
            frequency *= 2;
            amplitude *= .5;
        }
        return Math.Clamp(sum / amplitudeSum, 0, 1);
    }
}
