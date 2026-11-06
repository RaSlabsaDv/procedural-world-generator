namespace WorldGenerator.Core;

/// <summary>
/// Stable machine-readable codes for heightmap request validation failures.
/// </summary>
public static class HeightMapValidationErrorCodes
{
    /// <summary>The request itself is missing.</summary>
    public const string RequestRequired = "request.required";

    /// <summary>A required request field is missing or empty.</summary>
    public const string FieldRequired = "field.required";

    /// <summary>A value is outside its inclusive range.</summary>
    public const string ValueOutOfRange = "value.out_of_range";

    /// <summary>A floating-point value is NaN or an infinity.</summary>
    public const string ValueNotFinite = "value.not_finite";

    /// <summary>The requested width and height exceed the maximum cell count.</summary>
    public const string CellCountExceeded = "cell_count.exceeded";

    /// <summary>The algorithm version is not supported.</summary>
    public const string AlgorithmVersionUnsupported = "algorithm_version.unsupported";
}

/// <summary>
/// A structured heightmap request validation failure.
/// </summary>
/// <param name="Code">Stable machine-readable code from <see cref="HeightMapValidationErrorCodes"/>.</param>
/// <param name="Field">Request field affected by the failure.</param>
/// <param name="Message">English diagnostic message for humans.</param>
public sealed record ValidationError(string Code, string Field, string Message);
