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

    private static readonly JsonTypeInfo<HeightMapWireRequest> HeightMapRequestTypeInfo =
        HostJson.GetTypeInfo<HeightMapWireRequest>(HostJsonOptions);

    private static readonly JsonTypeInfo<GenerationResponse> GenerationResponseTypeInfo =
        HostJson.GetTypeInfo<GenerationResponse>(HostJsonOptions);

    private static readonly JsonTypeInfo<ErrorResponse> ErrorResponseTypeInfo =
        HostJson.GetTypeInfo<ErrorResponse>(HostJsonOptions);

    [JSExport]
    public static int Add(int left, int right) => ComputationProbe.Add(left, right);

    [JSExport]
    public static string GenerateSamplesJson(int seed, int count)
    {
        var started = Stopwatch.GetTimestamp();
        var values = ComputationProbe.GenerateSamples(seed, count);
        var computeMs = Stopwatch.GetElapsedTime(started).TotalMilliseconds;

        var response = new SampleResponse(values, computeMs);
        return JsonSerializer.Serialize(response, HostJsonContext.Default.SampleResponse);
    }

    [JSExport]
    public static string GenerateHeightMapJson(string requestJson)
    {
        var preparation = HeightMapTransport.ParseAndPrepare(requestJson, HeightMapRequestTypeInfo);
        if (!preparation.IsValid)
        {
            return JsonSerializer.Serialize(preparation.Error!, ErrorResponseTypeInfo);
        }

        var started = Stopwatch.GetTimestamp();
        var result = HeightMapGenerator.GenerateValidated(preparation.ValidatedRequest!);
        var computeMs = Stopwatch.GetElapsedTime(started).TotalMilliseconds;

        var response = new GenerationResponse(result, computeMs, CoreBuildId.Value);
        return JsonSerializer.Serialize(response, GenerationResponseTypeInfo);
    }

    public static void Main()
    {
    }
}

public sealed record SampleResponse(float[] Values, double ComputeMs);

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(SampleResponse))]
[JsonSerializable(typeof(GenerationResponse))]
[JsonSerializable(typeof(HeightMapWireRequest))]
[JsonSerializable(typeof(ErrorResponse))]
internal sealed partial class HostJsonContext : JsonSerializerContext;
