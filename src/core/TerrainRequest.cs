namespace WorldGenerator.Core;

public sealed record TerrainRequest(
    HeightMapRequest HeightMap,
    double MountainStrength,
    double WarpStrength,
    int Iterations,
    double Rainfall,
    double Evaporation,
    string AlgorithmVersion);

public static class TerrainLimits
{
    public const string AlgorithmVersion = "warped-ridged-hydraulic-v1";
    public const string SimulationVersion = "hydraulic-grid-v1";
    public const int MaxIterations = 2048;
    public const long MaxCellIterations = 33_554_432;
    public const double MaxWarpStrength = 8;
}

public sealed class ValidatedTerrainRequest
{
    internal ValidatedTerrainRequest(TerrainRequest request) => Request = request with { HeightMap = request.HeightMap with { } };
    internal TerrainRequest Request { get; }
}

public sealed record TerrainPreparation(ValidatedTerrainRequest? ValidatedRequest, IReadOnlyList<ValidationError> Errors)
{
    public bool IsValid => ValidatedRequest is not null;
}

public static class TerrainValidator
{
    public static TerrainPreparation Prepare(TerrainRequest? request)
    {
        if (request is null)
            return new(null, [new("request.required", "request", "A terrain request is required.")]);
        var errors = HeightMapValidator.Validate(request.HeightMap)
            .Select(error => error with { Field = "heightMap." + error.Field }).ToList();
        Range("mountainStrength", request.MountainStrength, 0, 1);
        Range("warpStrength", request.WarpStrength, 0, TerrainLimits.MaxWarpStrength);
        if (request.Iterations < 0 || request.Iterations > TerrainLimits.MaxIterations)
            errors.Add(new("value.out_of_range", "iterations", $"Expected 0..{TerrainLimits.MaxIterations}."));
        Range("rainfall", request.Rainfall, 0, 1);
        Range("evaporation", request.Evaporation, 0, 1);
        if (request.AlgorithmVersion != TerrainLimits.AlgorithmVersion)
            errors.Add(new("algorithm_version.unsupported", "algorithmVersion", "Unsupported terrain algorithm version."));
        if (request.HeightMap is { } map &&
            map.Width >= HeightMapLimits.MinWidth && map.Width <= HeightMapLimits.MaxWidth &&
            map.Height >= HeightMapLimits.MinHeight && map.Height <= HeightMapLimits.MaxHeight &&
            request.Iterations >= 0 && (long)map.Width * map.Height * request.Iterations > TerrainLimits.MaxCellIterations)
            errors.Add(new("work_budget.exceeded", "iterations", $"Cell-iterations must be at most {TerrainLimits.MaxCellIterations}."));
        return errors.Count == 0 ? new(new(request), []) : new(null, errors);

        void Range(string field, double value, double min, double max)
        {
            if (!double.IsFinite(value)) errors.Add(new("value.not_finite", field, "A finite number is required."));
            else if (value < min || value > max) errors.Add(new("value.out_of_range", field, $"Expected {min}..{max}."));
        }
    }
}
