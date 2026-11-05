namespace WorldGenerator.Hosts;

/// <summary>
/// Transport request with nullable members so omitted inputs can be detected.
/// Missing or null members must not become valid default values.
/// </summary>
public sealed record HeightMapWireRequest(
    int? Seed,
    int? Width,
    int? Height,
    double? NoiseScale,
    int? Octaves,
    double? HeightMultiplier,
    string? AlgorithmVersion);
