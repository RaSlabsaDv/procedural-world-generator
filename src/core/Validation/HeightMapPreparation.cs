namespace WorldGenerator.Core;

/// <summary>
/// Result of preparing a heightmap request for generation.
/// A successful preparation contains a validated snapshot and no errors.
/// </summary>
public sealed class HeightMapPreparation
{
    internal HeightMapPreparation(
        ValidatedHeightMapRequest? validatedRequest,
        IReadOnlyList<ValidationError> errors)
    {
        ValidatedRequest = validatedRequest;
        Errors = errors;
    }

    /// <summary>
    /// The validated request snapshot, or <see langword="null"/> when validation failed.
    /// </summary>
    public ValidatedHeightMapRequest? ValidatedRequest { get; }

    /// <summary>
    /// Validation errors in canonical order. Empty when <see cref="ValidatedRequest"/> is present.
    /// </summary>
    public IReadOnlyList<ValidationError> Errors { get; }

    /// <summary>
    /// Returns <see langword="true"/> when preparation produced a validated request.
    /// </summary>
    public bool IsValid => ValidatedRequest is not null;
}
