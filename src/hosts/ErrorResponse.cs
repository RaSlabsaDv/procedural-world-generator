namespace WorldGenerator.Hosts;

/// <summary>
/// Shared transport error envelope used by both hosts.
/// </summary>
/// <param name="Error">Stable category for the failure.</param>
/// <param name="Fields">Field diagnostics for validation failures, or null when not applicable.</param>
public sealed record ErrorResponse(string Error, Dictionary<string, string>? Fields)
{
    /// <summary>
    /// Creates an error for malformed or incompatible JSON input.
    /// </summary>
    public static ErrorResponse InvalidJson() => new("invalid_json", null);

    /// <summary>
    /// Creates an error for missing or invalid request fields.
    /// </summary>
    public static ErrorResponse Validation(Dictionary<string, string> fields) =>
        new("validation", fields);
}
