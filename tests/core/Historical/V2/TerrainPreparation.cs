namespace WorldGenerator.Core.Tests.Historical.V2;

public sealed record TerrainPreparation(ValidatedTerrainRequest? ValidatedRequest, IReadOnlyList<ValidationError> Errors)
{
    public bool IsValid => ValidatedRequest is not null;
}

