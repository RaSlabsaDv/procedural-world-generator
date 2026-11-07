namespace WorldGenerator.Core.Tests.Historical.V3;
internal static class HistoricalDensity
{
    internal static float Density(LandscapeBiome biome, float moisture, float slope, double patch, double multiplier)
    {
        var baseline = biome is LandscapeBiome.BroadleafForest or LandscapeBiome.ConiferForest
            ? Math.Clamp((moisture - .45) / .4, 0, 1) * (.45 + .55 * patch) * Math.Clamp(1 - slope / .8, 0, 1)
            : biome == LandscapeBiome.Savanna
                ? .12 * Math.Clamp((moisture - .20) / .33, 0, 1) * (.35 + .65 * patch) * Math.Clamp(1 - slope / .8, 0, 1)
                : 0;
        return (float)(baseline * multiplier);
    }
}
