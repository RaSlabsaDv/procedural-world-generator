using WorldGenerator.Core;

namespace WorldGenerator.Hosts;

/// <summary>
/// Result of parsing and preparing a heightmap transport request.
/// </summary>
public sealed record HeightMapHostPreparation(
    ValidatedHeightMapRequest? ValidatedRequest,
    ErrorResponse? Error)
{
    /// <summary>
    /// Returns <see langword="true"/> when parsing and validation succeeded.
    /// </summary>
    public bool IsValid => ValidatedRequest is not null;
}

/// <summary>
/// Shared host parsing and preparation for heightmap requests.
/// Canonical limits and algorithm-version rules remain in Core.
/// </summary>
public static class HeightMapTransport
{
    /// <summary>
    /// Rejects omitted inputs, then applies the canonical Core validation.
    /// </summary>
    public static HeightMapHostPreparation Prepare(HeightMapWireRequest? request)
    {
        if (request is null)
        {
            return Failure(ErrorResponse.InvalidJson());
        }

        // A valid JSON number such as 1e400 can deserialize to infinity without
        // throwing. It cannot be represented by the wire contract's double fields.
        // Reject this transport overflow before applying Core's parameter rules.
        if ((request.NoiseScale is { } noiseScale && !double.IsFinite(noiseScale)) ||
            (request.HeightMultiplier is { } heightMultiplier && !double.IsFinite(heightMultiplier)))
        {
            return Failure(ErrorResponse.InvalidJson());
        }

        var fields = new Dictionary<string, string>(StringComparer.Ordinal);
        AddRequired(fields, "seed", request.Seed is null);
        AddRequired(fields, "width", request.Width is null);
        AddRequired(fields, "height", request.Height is null);
        AddRequired(fields, "noiseScale", request.NoiseScale is null);
        AddRequired(fields, "octaves", request.Octaves is null);
        AddRequired(fields, "heightMultiplier", request.HeightMultiplier is null);
        AddRequired(fields, "algorithmVersion", request.AlgorithmVersion is null);

        if (fields.Count > 0)
        {
            return Failure(ErrorResponse.Validation(fields));
        }

        var coreRequest = new HeightMapRequest(
            Seed: request.Seed!.Value,
            Width: request.Width!.Value,
            Height: request.Height!.Value,
            NoiseScale: request.NoiseScale!.Value,
            Octaves: request.Octaves!.Value,
            HeightMultiplier: request.HeightMultiplier!.Value,
            AlgorithmVersion: request.AlgorithmVersion!);

        var preparation = HeightMapValidator.Prepare(coreRequest);
        if (preparation.IsValid)
        {
            return new HeightMapHostPreparation(preparation.ValidatedRequest, null);
        }

        var coreFields = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var error in preparation.Errors)
        {
            AddFieldError(
                coreFields,
                error.Field,
                $"{error.Code}: {error.Message}");
        }

        return Failure(ErrorResponse.Validation(coreFields));
    }

    private static HeightMapHostPreparation Failure(ErrorResponse error) =>
        new(null, error);

    private static void AddRequired(
        Dictionary<string, string> fields,
        string field,
        bool missing)
    {
        if (missing)
        {
            AddFieldError(
                fields,
                field,
                $"{HeightMapValidationErrorCodes.FieldRequired}: Required.");
        }
    }

    private static void AddFieldError(
        Dictionary<string, string> fields,
        string field,
        string message)
    {
        if (fields.TryGetValue(field, out var existing))
        {
            fields[field] = $"{existing}; {message}";
            return;
        }

        fields[field] = message;
    }
}
