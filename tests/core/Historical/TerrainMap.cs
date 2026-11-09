namespace WorldGenerator.Core.Tests.Historical;

// Pre-hydrology wire shape; preserve historical fingerprint meaning.
internal sealed record PreHydrologyResult(PreHydrologyMap HeightMap, SimulationSummary Simulation);
internal sealed record PreHydrologyMap(int Width, int Height, float[] Values, string AlgorithmVersion,
    LandscapeBiome[] Biomes, string ResultVersion, float[] Moisture, float[] Temperature,
    float[] Slope, float[] VegetationDensity, TreeInstance[] Trees, float[] SurfaceWeights, RockInstance[] Rocks);

// Frozen pre-channel shape, including drainage, river and lake metadata.
internal sealed record PreChannelResult(PreChannelMap HeightMap, SimulationSummary Simulation);
internal sealed record PreChannelMap(int Width, int Height, float[] Values, string AlgorithmVersion,
    LandscapeBiome[] Biomes, string ResultVersion, float[] Moisture, float[] Temperature,
    float[] Slope, float[] VegetationDensity, TreeInstance[] Trees, float[] SurfaceWeights,
    RockInstance[] Rocks, HydrologyResult Hydrology, RiverNetworkResult Rivers, LakeMapResult Lakes);
