namespace WorldGenerator.Core;

/// <summary>
/// Immutable input contract for heightmap generation.
/// Every constructor parameter is required; invalid values are reported by <see cref="HeightMapValidator"/>.
/// </summary>
/// <param name="Seed">Signed 32-bit seed. Every Int32 value is valid and negative seeds are allowed.</param>
/// <param name="Width">Map width in cells.</param>
/// <param name="Height">Map height in cells.</param>
/// <param name="NoiseScale">Sampling frequency per cell.</param>
/// <param name="Octaves">Number of value-noise fBm octaves.</param>
/// <param name="HeightMultiplier">Height scale in world units. The generator applies this multiplier.</param>
/// <param name="AlgorithmVersion">
/// Exact algorithm version. See <see cref="HeightMapLimits.SupportedAlgorithmVersion"/>.
/// </param>
public sealed record HeightMapRequest(
    int Seed,
    int Width,
    int Height,
    double NoiseScale,
    int Octaves,
    double HeightMultiplier,
    string AlgorithmVersion);
