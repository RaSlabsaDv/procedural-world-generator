namespace WorldGenerator.Core;

/// <summary>V3 ecological rules, including explicit precedence and tree-kind eligibility.</summary>
internal static class LandscapeBiomeClassifier
{
    internal const double MaxForestSlope = .5;

    internal static LandscapeBiome Classify(bool ocean, double height, double moisture,
        double temperature, double slope, double patch)
    {
        if (ocean) return LandscapeBiome.Ocean;
        if (height >= .55 && temperature <= .20 && slope <= 1.2) return LandscapeBiome.SnowHighlands;
        if (slope > .8 || height > .86 && temperature < .4) return LandscapeBiome.Rock;
        if (temperature <= .28) return LandscapeBiome.Tundra;
        if (temperature >= .62 && moisture >= .25 && moisture < .53 && slope < MaxForestSlope)
            return LandscapeBiome.Savanna;
        if (moisture < .36) return LandscapeBiome.DryGrassland;
        if (moisture >= .53 && slope < MaxForestSlope && patch > .42)
            return temperature < .48 ? LandscapeBiome.ConiferForest : LandscapeBiome.BroadleafForest;
        return LandscapeBiome.Grassland;
    }

    internal static TreeKind? Kind(LandscapeBiome biome) => biome switch
    {
        LandscapeBiome.BroadleafForest => TreeKind.Broadleaf,
        LandscapeBiome.ConiferForest => TreeKind.Conifer,
        LandscapeBiome.Savanna => TreeKind.Savanna,
        _ => null
    };

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
