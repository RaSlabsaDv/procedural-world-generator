namespace WorldGenerator.Core.Tests.Historical.V2;

/// <summary>Frozen ecological rule precedence. New biome semantics require a new result version.</summary>
internal static class LandscapeBiomeClassifier
{
    internal const double MaxForestSlope = .5;

    internal static LandscapeBiome Classify(bool ocean, double height, double moisture,
        double temperature, double slope, double patch)
    {
        if (ocean) return LandscapeBiome.Ocean;
        if (slope > .8 || height > .86 && temperature < .4) return LandscapeBiome.Rock;
        if (moisture < .36) return LandscapeBiome.DryGrassland;
        if (moisture >= .53 && temperature > .25 && slope < MaxForestSlope && patch > .42)
            return LandscapeBiome.Forest;
        return LandscapeBiome.Grassland;
    }
}
