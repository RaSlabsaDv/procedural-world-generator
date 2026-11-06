namespace WorldGenerator.Core.Tests.Historical.V2;
internal static class TerrainTests
{
    internal static TerrainRequest Request(int iterations = 8) => new(
        new(42, 5, 3, .37, 3, 30, HeightMapLimits.SupportedAlgorithmVersion),
        .55, 2, iterations, .05, .1, .45, .3, .65, .16, TerrainLimits.AlgorithmVersion);
}
