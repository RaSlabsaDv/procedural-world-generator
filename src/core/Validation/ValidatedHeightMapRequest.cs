namespace WorldGenerator.Core;

/// <summary>
/// Immutable snapshot of a heightmap request that has passed canonical validation.
/// Instances can only be created by Core preparation.
/// </summary>
public sealed class ValidatedHeightMapRequest
{
    private readonly HeightMapRequest request;

    internal ValidatedHeightMapRequest(HeightMapRequest request)
    {
        this.request = new HeightMapRequest(
            request.Seed,
            request.Width,
            request.Height,
            request.NoiseScale,
            request.Octaves,
            request.HeightMultiplier,
            request.AlgorithmVersion);
    }

    internal HeightMapRequest Request => request;
}
