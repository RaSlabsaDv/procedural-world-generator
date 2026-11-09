namespace WorldGenerator.Core;

internal static class RiverNetworkExtractor
{
    internal const string AlgorithmVersion = "river-network-v1";
    private const int MinimumCatchment = 32;
    private const int CatchmentDivisor = 512;
    private const double WidthBase = .35;
    private const double WidthScale = .25;
    private const double MinWidth = .6;
    private const double MaxWidth = 3;

    internal static int Threshold(int landCount) =>
        Math.Max(MinimumCatchment, (landCount + CatchmentDivisor - 1) / CatchmentDivisor);

    // Input is the finalized, trusted Core drainage graph; extraction never reroutes it.
    internal static RiverNetworkResult Extract(HydrologyResult hydrology, ReadOnlySpan<LandscapeBiome> biomes)
    {
        ArgumentNullException.ThrowIfNull(hydrology);
        var count = biomes.Length;
        if (count < 4 || count > HeightMapLimits.MaxCellCount ||
            hydrology.ReceiverIndex.Length != count || hydrology.FlowAccumulation.Length != count ||
            hydrology.DepressionDepth.Length != count || hydrology.AlgorithmVersion != HydrologyAnalyzer.AlgorithmVersion)
            throw new ArgumentException("River input must match finalized hydrology.", nameof(hydrology));

        var landCount = 0;
        foreach (var biome in biomes)
        {
            if ((uint)biome > (uint)LandscapeBiome.SnowHighlands)
                throw new ArgumentException("Invalid biome.", nameof(biomes));
            if (biome != LandscapeBiome.Ocean) landCount++;
        }
        var threshold = Threshold(landCount);
        var selectedCount = 0;
        for (var i = 0; i < count; i++)
            if (biomes[i] != LandscapeBiome.Ocean && hydrology.FlowAccumulation[i] >= threshold)
                selectedCount++;

        var indices = new int[selectedCount];
        var widths = new float[selectedCount];
        var cursor = 0;
        for (var i = 0; i < count; i++)
        {
            if (biomes[i] == LandscapeBiome.Ocean || hydrology.FlowAccumulation[i] < threshold) continue;
            indices[cursor] = i;
            widths[cursor++] = (float)Math.Clamp(
                WidthBase + WidthScale * Math.Sqrt(hydrology.FlowAccumulation[i] / (double)threshold), MinWidth, MaxWidth);
        }
        return new(indices, widths, AlgorithmVersion);
    }
}
