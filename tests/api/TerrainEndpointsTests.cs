using System.Net;
using System.Reflection;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace WorldGenerator.Api.Tests;

public sealed class TerrainEndpointsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient client;
    public TerrainEndpointsTests(WebApplicationFactory<Program> factory) => client = factory.CreateClient();
    internal const string Valid = """{"heightMap":{"seed":42,"width":5,"height":3,"noiseScale":0.37,"octaves":3,"heightMultiplier":30,"algorithmVersion":"value-noise-fbm-v1"},"mountainStrength":0.55,"warpStrength":2,"iterations":8,"rainfall":0.05,"evaporation":0.1,"plainsCoverage":0.45,"mountainCoverage":0.3,"globalMoisture":0.65,"seaLevel":0.16,"algorithmVersion":"diverse-landscape-v2"}""";

    [Fact]
    public async Task BothHostsSerializeIdenticalFullResultsParametersAndConservationSummary()
    {
        using var response = await Post(Valid);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("no-store", response.Headers.CacheControl!.ToString());
        using var api = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        using var wasm = JsonDocument.Parse(Export(Valid));
        var a = api.RootElement;
        var b = wasm.RootElement;
        foreach (var key in new[] { "result", "simulation", "parameters", "coreBuildId", "workload", "simulationVersion", "executionProfile" })
            Assert.Equal(a.GetProperty(key).GetRawText(), b.GetProperty(key).GetRawText());
        Assert.Equal("landscape-ecology-hydraulic-v2", a.GetProperty("workload").GetString());
        Assert.Equal("hydraulic-grid-v1", a.GetProperty("simulationVersion").GetString());
        Assert.Equal("diverse-landscape-v2", a.GetProperty("result").GetProperty("algorithmVersion").GetString());
        Assert.Equal(15, a.GetProperty("result").GetProperty("values").GetArrayLength());
        Assert.Equal(15, a.GetProperty("result").GetProperty("biomes").GetArrayLength());
        Assert.Equal(120, a.GetProperty("simulation").GetProperty("cellIterations").GetInt64());
        foreach (var root in new[] { a, b })
            Assert.True(double.IsFinite(root.GetProperty("computeMs").GetDouble()) && root.GetProperty("computeMs").GetDouble() >= 0);
    }

    [Theory]
    [InlineData("null", "invalid_json")]
    [InlineData("{}", "validation")]
    [InlineData("{broken", "invalid_json")]
    [InlineData("overflow", "invalid_json")]
    [InlineData("unknown", "invalid_json")]
    [InlineData("nestedUnknown", "invalid_json")]
    [InlineData("missing", "validation")]
    [InlineData("version", "validation")]
    [InlineData("negative", "validation")]
    [InlineData("budget", "validation")]
    public async Task BothHostsRejectInvalidRequestsConsistently(string input, string category)
    {
        var json = input switch {
            "overflow" => Valid.Replace("\"rainfall\":0.05", "\"rainfall\":1e400"),
            "unknown" => Valid.Replace("\"mountainStrength\"", "\"unexpected\""),
            "nestedUnknown" => Valid.Replace("\"seed\"", "\"unknownSeed\""),
            "missing" => Valid.Replace("\"rainfall\":0.05,", ""),
            "version" => Valid.Replace("diverse-landscape-v2", "v2"),
            "negative" => Valid.Replace("\"iterations\":8", "\"iterations\":-1"),
            "budget" => Valid.Replace("\"width\":5", "\"width\":512").Replace("\"height\":3", "\"height\":512").Replace("\"iterations\":8", "\"iterations\":129"),
            _ => input
        };
        using var response = await Post(json);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("no-store", response.Headers.CacheControl!.ToString());
        var api = await response.Content.ReadAsStringAsync();
        var wasm = Export(json);
        Assert.Equal(api, wasm);
        using var document = JsonDocument.Parse(api);
        Assert.Equal(category, document.RootElement.GetProperty("error").GetString());
    }

    [Theory]
    [InlineData("/api/v1/regions")]
    [InlineData("/api/v1/heightmaps")]
    [InlineData("/api/v1/probe/add")]
    [InlineData("/api/v1/probe/samples")]
    public async Task RemovedRoutesReturnNotFound(string path)
    {
        using var response = await client.PostAsync(path, new StringContent("{}", Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public void WasmExposesOnlyTerrainGeneration()
    {
        var methods = Assembly.Load("WorldGenerator.Wasm").GetType("WorldGeneratorInterop")!
            .GetMethods(BindingFlags.Public | BindingFlags.Static | BindingFlags.DeclaredOnly)
            .Where(method => method.GetCustomAttributesData().Any(attribute => attribute.AttributeType.Name == "JSExportAttribute"))
            .Select(method => method.Name).ToArray();
        Assert.Equal(["GenerateTerrainJson"], methods);
    }

    [Theory]
    [InlineData("plainsCoverage")]
    [InlineData("mountainCoverage")]
    [InlineData("globalMoisture")]
    [InlineData("seaLevel")]
    public async Task NewFieldsAreRequiredAndRejectNonfiniteOverflow(string field)
    {
        var node = System.Text.Json.Nodes.JsonNode.Parse(Valid)!;
        node.AsObject().Remove(field);
        using var missing = await Post(node.ToJsonString());
        Assert.Equal(HttpStatusCode.BadRequest, missing.StatusCode);
        var missingJson = await missing.Content.ReadAsStringAsync();
        Assert.Equal(missingJson, Export(node.ToJsonString()));
        Assert.Contains(field, missingJson);
        var overflow = Valid.Replace("\""+field+"\":"+JsonDocument.Parse(Valid).RootElement.GetProperty(field).GetRawText(), "\""+field+"\":1e400");
        using var response = await Post(overflow);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("invalid_json", await response.Content.ReadAsStringAsync());
        Assert.Equal(await response.Content.ReadAsStringAsync(),Export(overflow));
    }

    [Fact]
    public async Task BothHostsAgreeOnForestsAndAllEnvironmentalArrays()
    {
        var json=Valid.Replace("\"width\":5", "\"width\":128").Replace("\"height\":3", "\"height\":128").Replace("0.37","0.03");
        using var response=await Post(json);
        Assert.Equal(HttpStatusCode.OK,response.StatusCode);
        using var api=JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        using var wasm=JsonDocument.Parse(Export(json));
        var a=api.RootElement.GetProperty("result");
        Assert.Equal(a.GetRawText(),wasm.RootElement.GetProperty("result").GetRawText());
        foreach(var field in new[]{"moisture","temperature","slope","vegetationDensity"}) Assert.Equal(16384,a.GetProperty(field).GetArrayLength());
        Assert.True(a.GetProperty("trees").GetArrayLength()>0);
        Assert.Equal("landscape-ecology-v2",a.GetProperty("resultVersion").GetString());
    }

    private Task<HttpResponseMessage> Post(string json) => client.PostAsync("/api/v1/terrains",
        new StringContent(json, Encoding.UTF8, "application/json"));

    private static string Export(string json) => (string)Assembly.Load("WorldGenerator.Wasm")
        .GetType("WorldGeneratorInterop")!.GetMethod("GenerateTerrainJson")!.Invoke(null, [json])!;
}
