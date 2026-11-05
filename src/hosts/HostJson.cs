using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.Json.Serialization.Metadata;

namespace WorldGenerator.Hosts;

/// <summary>
/// Shared JSON rules for heightmap transport in both hosts.
/// </summary>
public static class HostJson
{
    /// <summary>
    /// Creates options with the shared strict transport rules and a metadata resolver.
    /// </summary>
    public static JsonSerializerOptions CreateOptions(IJsonTypeInfoResolver resolver)
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        Configure(options);
        options.TypeInfoResolver = resolver;

        return options;
    }

    /// <summary>
    /// Gets generated or reflection-based metadata for a transport type.
    /// </summary>
    public static System.Text.Json.Serialization.Metadata.JsonTypeInfo<T> GetTypeInfo<T>(
        JsonSerializerOptions options) =>
        (System.Text.Json.Serialization.Metadata.JsonTypeInfo<T>)options.GetTypeInfo(typeof(T));

    /// <summary>
    /// Applies the shared strict transport rules to an existing options instance.
    /// </summary>
    public static void Configure(JsonSerializerOptions options)
    {
        options.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        options.PropertyNameCaseInsensitive = false;
        options.NumberHandling = JsonNumberHandling.Strict;
        options.AllowTrailingCommas = false;
        options.ReadCommentHandling = JsonCommentHandling.Disallow;
        options.UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow;
    }
}
