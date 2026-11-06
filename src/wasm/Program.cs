using System.Diagnostics;
using System.Runtime.InteropServices.JavaScript;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.Json.Serialization.Metadata;
using WorldGenerator.Core;
using WorldGenerator.Hosts;

public static partial class WorldGeneratorInterop
{
    private static readonly JsonSerializerOptions HostJsonOptions =
        HostJson.CreateOptions(HostJsonContext.Default);

    private static readonly JsonTypeInfo<ErrorResponse> ErrorResponseTypeInfo =
        HostJson.GetTypeInfo<ErrorResponse>(HostJsonOptions);

    [JSExport]
    public static string GenerateTerrainJson(string requestJson)
    {
        var preparation = TerrainTransport.ParseAndPrepare(requestJson,
            HostJson.GetTypeInfo<TerrainWireRequest>(HostJsonOptions));
        if (!preparation.IsValid)
            return JsonSerializer.Serialize(preparation.Error!, ErrorResponseTypeInfo);
        var started = Stopwatch.GetTimestamp();
        var result = TerrainGenerator.GenerateValidated(preparation.ValidatedRequest!);
        var computeMs = Stopwatch.GetElapsedTime(started).TotalMilliseconds;
        return JsonSerializer.Serialize(new TerrainGenerationResponse(result.HeightMap, result.Simulation,
            preparation.Parameters!, computeMs, CoreBuildId.Value),
            HostJson.GetTypeInfo<TerrainGenerationResponse>(HostJsonOptions));
    }

    public static void Main()
    {
    }
}

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(TerrainWireRequest))]
[JsonSerializable(typeof(TerrainGenerationResponse))]
[JsonSerializable(typeof(HeightMapWireRequest))]
[JsonSerializable(typeof(ErrorResponse))]
internal sealed partial class HostJsonContext : JsonSerializerContext;
