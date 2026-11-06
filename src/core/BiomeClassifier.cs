namespace WorldGenerator.Core;

/// <summary>Stable numeric IDs for heightmap-biomes-v1. Colors belong to the renderer.</summary>
public enum BiomeId
{
    Water = 0,
    Plains = 1,
    Forest = 2,
    Mountains = 3
}

/// <summary>Classification of final float32 heights relative to the float32 height bound.</summary>
public static class BiomeClassifier
{
    public const double PlainsThreshold = 0.25;
    public const double ForestThreshold = 0.5;
    public const double MountainsThreshold = 0.75;

    /// <summary>
    /// Classifies a generated finite height. The generator supplies values in [0, heightBound].
    /// An exactly zero bound produces water. Threshold equality belongs to the higher band.
    /// </summary>
    internal static BiomeId Classify(float height, float heightBound)
    {
        if (heightBound == 0 || height < (double)heightBound * PlainsThreshold) return BiomeId.Water;
        if (height < (double)heightBound * ForestThreshold) return BiomeId.Plains;
        if (height < (double)heightBound * MountainsThreshold) return BiomeId.Forest;
        return BiomeId.Mountains;
    }
}
