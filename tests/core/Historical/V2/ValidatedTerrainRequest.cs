namespace WorldGenerator.Core.Tests.Historical.V2;

public sealed class ValidatedTerrainRequest
{
    internal ValidatedTerrainRequest(TerrainRequest request) => Request = request with { HeightMap = request.HeightMap with { } };
    internal TerrainRequest Request { get; }
}

