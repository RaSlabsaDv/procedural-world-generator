namespace WorldGenerator.Core;

/// <summary>
/// Canonical validation for <see cref="HeightMapRequest"/> values.
/// Hosts must call this validator rather than duplicate the limits or comparison rules.
/// </summary>
public static class HeightMapValidator
{
    private const string RequestField = "request";
    private const string AlgorithmVersionField = "algorithmVersion";
    private const string CellCountField = "width * height";

    /// <summary>
    /// Validates a request and returns all applicable errors in a deterministic order:
    /// width, height, cell count, noise scale, octaves, height multiplier, algorithm version.
    /// A null request returns one <see cref="HeightMapValidationErrorCodes.RequestRequired"/> error.
    /// </summary>
    public static IReadOnlyList<ValidationError> Validate(HeightMapRequest? request)
    {
        if (request is null)
        {
            return
            [
                new ValidationError(
                    HeightMapValidationErrorCodes.RequestRequired,
                    RequestField,
                    "A heightmap request is required.")
            ];
        }

        var errors = new List<ValidationError>(8);

        ValidateIntegerRange(errors, "width", request.Width, HeightMapLimits.MinWidth, HeightMapLimits.MaxWidth);
        ValidateIntegerRange(errors, "height", request.Height, HeightMapLimits.MinHeight, HeightMapLimits.MaxHeight);

        // Int32 multiplication can overflow, so promote before multiplying. The explicit
        // cell-count check remains even though the current dimension limits imply it.
        var cellCount = (long)request.Width * request.Height;
        if (cellCount > HeightMapLimits.MaxCellCount)
        {
            errors.Add(new ValidationError(
                HeightMapValidationErrorCodes.CellCountExceeded,
                CellCountField,
                $"The cell count must be at most {HeightMapLimits.MaxCellCount}."));
        }

        ValidateFiniteRange(
            errors,
            "noiseScale",
            request.NoiseScale,
            HeightMapLimits.MinNoiseScale,
            HeightMapLimits.MaxNoiseScale);
        ValidateIntegerRange(errors, "octaves", request.Octaves, HeightMapLimits.MinOctaves, HeightMapLimits.MaxOctaves);
        ValidateFiniteRange(
            errors,
            "heightMultiplier",
            request.HeightMultiplier,
            HeightMapLimits.MinHeightMultiplier,
            HeightMapLimits.MaxHeightMultiplier);
        ValidateAlgorithmVersion(errors, request.AlgorithmVersion);

        return errors;
    }

    /// <summary>
    /// Returns <see langword="true"/> when the request has no validation errors.
    /// A null request is invalid.
    /// </summary>
    public static bool IsValid(HeightMapRequest? request) => Validate(request).Count == 0;

    /// <summary>
    /// Validates a request and returns either an immutable validated snapshot or the
    /// canonical validation errors.
    /// </summary>
    public static HeightMapPreparation Prepare(HeightMapRequest? request)
    {
        var errors = Validate(request);

        return errors.Count == 0
            ? new HeightMapPreparation(
                new ValidatedHeightMapRequest(request!),
                Array.Empty<ValidationError>())
            : new HeightMapPreparation(null, errors);
    }

    private static void ValidateIntegerRange(
        List<ValidationError> errors,
        string field,
        int value,
        int minimum,
        int maximum)
    {
        if (value < minimum || value > maximum)
        {
            errors.Add(new ValidationError(
                HeightMapValidationErrorCodes.ValueOutOfRange,
                field,
                $"Expected an integer from {minimum} to {maximum}."));
        }
    }

    private static void ValidateFiniteRange(
        List<ValidationError> errors,
        string field,
        double value,
        double minimum,
        double maximum)
    {
        if (!double.IsFinite(value))
        {
            errors.Add(new ValidationError(
                HeightMapValidationErrorCodes.ValueNotFinite,
                field,
                "Expected a finite number."));
            return;
        }

        if (value < minimum || value > maximum)
        {
            errors.Add(new ValidationError(
                HeightMapValidationErrorCodes.ValueOutOfRange,
                field,
                $"Expected a finite number from {minimum} to {maximum}."));
        }
    }

    private static void ValidateAlgorithmVersion(List<ValidationError> errors, string? algorithmVersion)
    {
        if (string.IsNullOrEmpty(algorithmVersion))
        {
            errors.Add(new ValidationError(
                HeightMapValidationErrorCodes.FieldRequired,
                AlgorithmVersionField,
                "Required."));
            return;
        }

        if (!string.Equals(algorithmVersion, HeightMapLimits.SupportedAlgorithmVersion, StringComparison.Ordinal))
        {
            errors.Add(new ValidationError(
                HeightMapValidationErrorCodes.AlgorithmVersionUnsupported,
                AlgorithmVersionField,
                $"The supported algorithm version is '{HeightMapLimits.SupportedAlgorithmVersion}'."));
        }
    }
}
