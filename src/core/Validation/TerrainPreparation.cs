namespace WorldGenerator.Core;

public sealed record TerrainPreparation(ValidatedTerrainRequest? ValidatedRequest, IReadOnlyList<ValidationError> Errors)
{
    public bool IsValid => ValidatedRequest is not null;
}

