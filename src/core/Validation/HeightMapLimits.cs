namespace WorldGenerator.Core;

/// <summary>
/// Canonical version 1 limits for heightmap requests.
/// Hosts consume <see cref="HeightMapValidator"/> instead of duplicating these values.
/// </summary>
public static class HeightMapLimits
{
    public const int MinWidth = 2;
    public const int MaxWidth = 512;
    public const int MinHeight = 2;
    public const int MaxHeight = 512;

    /// <summary>
    /// Maximum number of cells in one heightmap.
    /// </summary>
    public const long MaxCellCount = 262_144;

    public const double MinNoiseScale = 0.0001;
    public const double MaxNoiseScale = 1.0;

    public const int MinOctaves = 1;
    public const int MaxOctaves = 8;

    public const double MinHeightMultiplier = 0.0;
    public const double MaxHeightMultiplier = 1_000.0;

    /// <summary>
    /// The only supported version 1 algorithm version.
    /// </summary>
    public const string SupportedAlgorithmVersion = "value-noise-fbm-v1";
}
