namespace WorldGenerator.Core;

/// <summary>
/// Canonical result contract for heightmap generation.
/// </summary>
/// <remarks>
/// Invariants:
/// <list type="bullet">
/// <item><description><see cref="Values"/> contains exactly <see cref="Width"/> * <see cref="Height"/> elements.</description></item>
/// <item><description>Values use row-major indexing: <c>Values[y * Width + x]</c>.</description></item>
/// <item><description>Every value is a finite float32 height in world units.</description></item>
/// <item><description>The request's height multiplier has already been applied by the generator; the expected range is 0 to the request's height multiplier.</description></item>
/// </list>
/// </remarks>
/// <param name="Width">Map width in cells.</param>
/// <param name="Height">Map height in cells.</param>
/// <param name="Values">Height values in row-major order.</param>
/// <param name="Biomes">Numeric biome IDs, one per height, using the same row-major order.</param>
/// <param name="ResultVersion">Version of the extended result and classification rules.</param>
/// <param name="AlgorithmVersion">Algorithm version that produced the result.</param>
public sealed record HeightMapResult(
    int Width,
    int Height,
    float[] Values,
    string AlgorithmVersion,
    BiomeId[] Biomes,
    string ResultVersion)
{
    public const string CurrentVersion = "heightmap-biomes-v1";
}
