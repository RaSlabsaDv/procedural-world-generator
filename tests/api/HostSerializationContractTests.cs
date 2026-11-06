using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using WorldGenerator.Core;
using WorldGenerator.Hosts;
using Xunit;

namespace WorldGenerator.Api.Tests;

public sealed class HostSerializationContractTests
{
    private const double TestComputeMs = 12.5;
    private const string TestCoreBuildId = "test-core-build-id";

    [Fact]
    public void GenerationResponse_SerializesWithExactContract()
    {
        var response = new GenerationResponse(
            CreateResult(),
            TestComputeMs,
            TestCoreBuildId);

        Assert.Equal("heightmap+biomes", response.Workload);

        var json = JsonSerializer.Serialize(
            response,
            new JsonSerializerOptions(JsonSerializerDefaults.Web));

        AssertContract(json);
    }

    [Fact]
    public void GenerationResponse_WasmSourceGeneratedSerializerSupportsContract()
    {
        var wasmAssembly = Assembly.Load("WorldGenerator.Wasm");
        var responseType = wasmAssembly.GetType(
            "WorldGenerator.Hosts.GenerationResponse",
            throwOnError: true)!;
        var response = Activator.CreateInstance(
            responseType,
            CreateResult(),
            TestComputeMs,
            TestCoreBuildId)!;

        var contextType = wasmAssembly.GetType("HostJsonContext", throwOnError: true)!;
        var context = (JsonSerializerContext)contextType
            .GetProperty("Default", BindingFlags.Public | BindingFlags.Static)!
            .GetValue(null)!;

        var json = JsonSerializer.Serialize(response, responseType, context);

        AssertContract(json);
    }

    private static HeightMapResult CreateResult() => new(
        Width: 2,
        Height: 1,
        Values: [1.25f, 2.5f],
        AlgorithmVersion: HeightMapLimits.SupportedAlgorithmVersion,
        Biomes: [BiomeId.Plains, BiomeId.Forest],
        ResultVersion: HeightMapResult.CurrentVersion);

    private static void AssertContract(string json)
    {
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;

        Assert.Equal(
            ["computeMs", "coreBuildId", "result", "workload"],
            root.EnumerateObject()
                .Select(property => property.Name)
                .OrderBy(name => name, StringComparer.Ordinal)
                .ToArray());
        Assert.Equal(TestCoreBuildId, root.GetProperty("coreBuildId").GetString());
        Assert.Equal(TestComputeMs, root.GetProperty("computeMs").GetDouble());
        Assert.Equal("heightmap+biomes", root.GetProperty("workload").GetString());

        var result = root.GetProperty("result");
        Assert.Equal("heightmap-biomes-v1", result.GetProperty("resultVersion").GetString());
        Assert.Equal(new[] { 1, 2 }, result.GetProperty("biomes").EnumerateArray().Select(v => v.GetInt32()).ToArray());

        Assert.Equal(
            ["algorithmVersion", "biomes", "height", "resultVersion", "values", "width"],
            result.EnumerateObject()
                .Select(property => property.Name)
                .OrderBy(name => name, StringComparer.Ordinal)
                .ToArray());
        Assert.Equal(2, result.GetProperty("width").GetInt32());
        Assert.Equal(1, result.GetProperty("height").GetInt32());
        Assert.Equal(
            HeightMapLimits.SupportedAlgorithmVersion,
            result.GetProperty("algorithmVersion").GetString());
        Assert.Equal(
            new[] { 1.25f, 2.5f },
            result.GetProperty("values")
                .EnumerateArray()
                .Select(value => value.GetSingle())
                .ToArray());
    }
}
