using System.Diagnostics;
using System.Runtime.InteropServices.JavaScript;
using System.Text.Json;
using System.Text.Json.Serialization;
using WorldGenerator.Core;
using WorldGenerator.Hosts;

public static partial class WorldGeneratorInterop
{
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

    public static void Main()
    {
    }
}

public sealed record SampleResponse(float[] Values, double ComputeMs);

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(SampleResponse))]
[JsonSerializable(typeof(GenerationResponse))]
internal sealed partial class HostJsonContext : JsonSerializerContext;
