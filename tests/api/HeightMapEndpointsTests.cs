using System.Net;
using System.Net.Http.Json;
using System.Reflection;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using WorldGenerator.Core;
using WorldGenerator.Hosts;
using Xunit;

namespace WorldGenerator.Api.Tests;

public sealed class HeightMapEndpointsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string Endpoint = "/api/v1/heightmaps";
    private const string AlgorithmVersion = "value-noise-fbm-v1";

    private const string ValidJson =
        """{"seed":42,"width":3,"height":2,"noiseScale":0.37,"octaves":3,"heightMultiplier":30.0,"algorithmVersion":"value-noise-fbm-v1"}""";

    private static readonly float[] GoldenValues =
    [
        2.9216370582580566f,
        3.6088085174560547f,
        6.840007781982422f,
        6.314371109008789f,
        6.954989910125732f,
        6.4931135177612305f
    ];

    public static TheoryData<string> RequiredFields => new()
    {
        "seed",
        "width",
        "height",
        "noiseScale",
        "octaves",
        "heightMultiplier",
        "algorithmVersion"
    };

    public static TheoryData<string> InvalidJsonDocuments => new()
    {
        "null",
        "[]",
        "{",
        ValidJson.Replace("\"seed\":42", "\"seed\":2147483648", StringComparison.Ordinal),
        ValidJson.Replace("\"width\":3", "\"width\":\"3\"", StringComparison.Ordinal),
        ValidJson.Replace("\"noiseScale\":0.37", "\"noiseScale\":\"0.37\"", StringComparison.Ordinal),
        ValidJson.Replace("{", "{\"unexpected\":true,", StringComparison.Ordinal),
        ValidJson.Replace("\"seed\":42", "\"Seed\":42", StringComparison.Ordinal),
        ValidJson.Replace("}", ",}", StringComparison.Ordinal),
        ValidJson.Replace("{", "{// comment\n", StringComparison.Ordinal),
        ValidJson.Replace("\"noiseScale\":0.37", "\"noiseScale\":NaN", StringComparison.Ordinal)
    };

    private readonly HttpClient client;

    public HeightMapEndpointsTests(WebApplicationFactory<Program> factory)
    {
        client = factory.CreateClient();
    }

    [Fact]
    public async Task Generate_ReturnsGoldenFixtureAndComputationMetadata()
    {
        var response = await PostJsonAsync(ValidJson);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(response.Headers.CacheControl?.NoStore);

        var body = await response.Content.ReadFromJsonAsync<GenerationResponse>();

        Assert.NotNull(body);
        Assert.Equal(3, body.Result.Width);
        Assert.Equal(2, body.Result.Height);
        Assert.Equal(AlgorithmVersion, body.Result.AlgorithmVersion);
        Assert.Equal(GoldenValues, body.Result.Values);
        Assert.Equal(new WorldGenerator.Core.BiomeId[6], body.Result.Biomes);
        Assert.Equal(WorldGenerator.Core.HeightMapResult.CurrentVersion, body.Result.ResultVersion);
        Assert.Equal("heightmap+biomes", body.Workload);
        Assert.True(double.IsFinite(body.ComputeMs));
        Assert.True(body.ComputeMs >= 0);
        Assert.Equal(CoreBuildId.Value, body.CoreBuildId);
    }

    [Fact]
    public async Task Generate_SerializesExactEnvelopePropertyNames()
    {
        var response = await PostJsonAsync(ValidJson);
        response.EnsureSuccessStatusCode();

        var json = await response.Content.ReadAsStringAsync();
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;

        Assert.Equal(
            ["computeMs", "coreBuildId", "result", "workload"],
            root.EnumerateObject()
                .Select(property => property.Name)
                .OrderBy(name => name, StringComparer.Ordinal)
                .ToArray());

        var result = root.GetProperty("result");
        Assert.Equal(
            ["algorithmVersion", "biomes", "height", "resultVersion", "values", "width"],
            result.EnumerateObject()
                .Select(property => property.Name)
                .OrderBy(name => name, StringComparer.Ordinal)
                .ToArray());
    }

    [Theory]
    [MemberData(nameof(RequiredFields))]
    public async Task Generate_RejectsEachOmittedField(string field)
    {
        var payload = ValidPayload();
        payload.Remove(field);

        var response = await client.PostAsJsonAsync(Endpoint, payload);

        await AssertValidationFailureAsync(response, field);
    }

    [Theory]
    [MemberData(nameof(RequiredFields))]
    public async Task Generate_RejectsEachNullField(string field)
    {
        var payload = ValidPayload();
        payload[field] = null;

        var response = await client.PostAsJsonAsync(Endpoint, payload);

        await AssertValidationFailureAsync(response, field);
    }

    [Fact]
    public async Task Generate_DistinguishesValidZeroValuesFromMissingFields()
    {
        var payload = ValidPayload();
        payload["seed"] = 0;
        payload["heightMultiplier"] = 0.0;

        var response = await client.PostAsJsonAsync(Endpoint, payload);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<GenerationResponse>();
        Assert.NotNull(body);
        Assert.All(body.Result.Values, value => Assert.Equal(0f, value));
    }

    [Fact]
    public async Task Generate_RejectsUnexpectedFieldsBeforeCoreValidation()
    {
        var payload = ValidPayload();
        payload["unexpected"] = true;

        var response = await client.PostAsJsonAsync(Endpoint, payload);

        await AssertInvalidJsonAsync(response);
    }

    [Theory]
    [MemberData(nameof(InvalidJsonDocuments))]
    public async Task Generate_RejectsMalformedOrIncompatibleJson(string json)
    {
        var response = await PostJsonAsync(json);

        await AssertInvalidJsonAsync(response);
    }

    [Theory]
    [InlineData("noiseScale", "1e400")]
    [InlineData("noiseScale", "-1e400")]
    [InlineData("heightMultiplier", "1e400")]
    [InlineData("heightMultiplier", "-1e400")]
    public async Task Generate_ReportsDoubleOverflowAsInvalidJson(string field, string number)
    {
        var token = field == "noiseScale" ? "0.37" : "30.0";
        var json = ValidJson.Replace($"\"{field}\":{token}", $"\"{field}\":{number}", StringComparison.Ordinal);

        await AssertInvalidJsonAsync(await PostJsonAsync(json));
    }

    [Theory]
    [InlineData("noiseScale")]
    [InlineData("heightMultiplier")]
    public async Task Generate_ReportsRepresentableOutOfRangeNumbersAsValidation(string field)
    {
        var payload = ValidPayload();
        payload[field] = double.MaxValue;

        await AssertValidationFailureAsync(await client.PostAsJsonAsync(Endpoint, payload), field);
    }

    public static TheoryData<string, object?> CoreValidationFailures => new()
    {
        { "width", HeightMapLimits.MinWidth - 1 },
        { "width", HeightMapLimits.MaxWidth + 1 },
        { "height", HeightMapLimits.MinHeight - 1 },
        { "height", HeightMapLimits.MaxHeight + 1 },
        { "noiseScale", 0.0 },
        { "noiseScale", HeightMapLimits.MaxNoiseScale + 0.1 },
        { "octaves", HeightMapLimits.MinOctaves - 1 },
        { "octaves", HeightMapLimits.MaxOctaves + 1 },
        { "heightMultiplier", -1.0 },
        { "heightMultiplier", HeightMapLimits.MaxHeightMultiplier + 0.1 },
        { "algorithmVersion", "unsupported" },
        { "algorithmVersion", "" }
    };

    [Theory]
    [MemberData(nameof(CoreValidationFailures))]
    public async Task Generate_ReportsCanonicalValidationFailures(string field, object? value)
    {
        var payload = ValidPayload();
        payload[field] = value;

        var response = await client.PostAsJsonAsync(Endpoint, payload);

        await AssertValidationFailureAsync(response, field);
    }

    [Fact]
    public void CoreBuildId_IsRealAndConsistentAcrossHosts()
    {
        Assert.Matches("^git:[0-9a-f]{12}(-dirty)?$", CoreBuildId.Value);

        var wasmAssembly = Assembly.Load("WorldGenerator.Wasm");
        var type = wasmAssembly.GetType("WorldGenerator.Hosts.CoreBuildId", throwOnError: true)!;
        var wasmValue = (string)type
            .GetProperty("Value", BindingFlags.Public | BindingFlags.Static)!
            .GetValue(null)!;

        Assert.Equal(CoreBuildId.Value, wasmValue);
    }

    private static Dictionary<string, object?> ValidPayload() => new()
    {
        ["seed"] = 42,
        ["width"] = 3,
        ["height"] = 2,
        ["noiseScale"] = 0.37,
        ["octaves"] = 3,
        ["heightMultiplier"] = 30.0,
        ["algorithmVersion"] = AlgorithmVersion
    };

    private Task<HttpResponseMessage> PostJsonAsync(string json) =>
        client.PostAsync(
            Endpoint,
            new StringContent(json, Encoding.UTF8, "application/json"));

    private static async Task AssertValidationFailureAsync(
        HttpResponseMessage response,
        string field)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.True(response.Headers.CacheControl?.NoStore);

        var body = await response.Content.ReadFromJsonAsync<ErrorResponse>();
        Assert.NotNull(body);
        Assert.Equal("validation", body.Error);
        Assert.NotNull(body.Fields);
        Assert.True(body.Fields.ContainsKey(field));
        Assert.False(string.IsNullOrWhiteSpace(body.Fields[field]));
    }

    private static async Task AssertInvalidJsonAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.True(response.Headers.CacheControl?.NoStore);

        var body = await response.Content.ReadFromJsonAsync<ErrorResponse>();
        Assert.NotNull(body);
        Assert.Equal("invalid_json", body.Error);
        Assert.Null(body.Fields);
    }
}
