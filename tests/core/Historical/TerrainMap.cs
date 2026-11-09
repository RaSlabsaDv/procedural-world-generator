namespace WorldGenerator.Core.Tests.Historical;

// Pre-hydrology wire shape; preserve historical fingerprint meaning.
internal sealed record PreHydrologyResult(PreHydrologyMap HeightMap, SimulationSummary Simulation);
internal sealed record PreHydrologyMap(int Width, int Height, float[] Values, string AlgorithmVersion,
    LandscapeBiome[] Biomes, string ResultVersion, float[] Moisture, float[] Temperature,
    float[] Slope, float[] VegetationDensity, TreeInstance[] Trees, float[] SurfaceWeights, RockInstance[] Rocks);
