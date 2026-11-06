using System.Reflection;
using System.Text.Json;
using WorldGenerator.Hosts;
using Xunit;

namespace WorldGenerator.Api.Tests;

public sealed class WasmHeightMapExportTests
{
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

    [Fact]
    public void GenerateHeightMapJson_SerializesSuccessEnvelope()
    {
        using var document = JsonDocument.Parse(InvokeExport(ValidJson));
        var root = document.RootElement;

        Assert.Equal(
            ["computeMs", "coreBuildId", "result", "workload"],
            root.EnumerateObject()
                .Select(property => property.Name)
                .OrderBy(name => name, StringComparer.Ordinal)
                .ToArray());

        Assert.Equal(CoreBuildId.Value, root.GetProperty("coreBuildId").GetString());
        Assert.True(double.IsFinite(root.GetProperty("computeMs").GetDouble()));
        Assert.True(root.GetProperty("computeMs").GetDouble() >= 0);
        Assert.Equal("heightmap+biomes", root.GetProperty("workload").GetString());

        var result = root.GetProperty("result");
        Assert.Equal("heightmap-biomes-v1", result.GetProperty("resultVersion").GetString());
        Assert.Equal(new[] { 0, 0, 0, 0, 0, 0 }, result.GetProperty("biomes").EnumerateArray().Select(v => v.GetInt32()).ToArray());
        Assert.Equal(3, result.GetProperty("width").GetInt32());
        Assert.Equal(2, result.GetProperty("height").GetInt32());
        Assert.Equal(AlgorithmVersion, result.GetProperty("algorithmVersion").GetString());
        Assert.Equal(
            GoldenValues,
            result.GetProperty("values")
                .EnumerateArray()
                .Select(value => value.GetSingle())
                .ToArray());
    }

    [Fact]
    public void GenerateHeightMapJson_SerializesValidationError()
    {
        var json = ValidJson.Replace("\"width\":3,", string.Empty, StringComparison.Ordinal);

        using var document = JsonDocument.Parse(InvokeExport(json));
        var root = document.RootElement;

        Assert.Equal("validation", root.GetProperty("error").GetString());
        Assert.True(root.GetProperty("fields").TryGetProperty("width", out var width));
        Assert.Contains("field.required", width.GetString(), StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("{")]
    [InlineData("null")]
    [InlineData("[]")]
    [InlineData("""{"seed":42,"width":"3","height":2,"noiseScale":0.37,"octaves":3,"heightMultiplier":30.0,"algorithmVersion":"value-noise-fbm-v1"}""")]
    [InlineData("""{"seed":42,"width":3,"height":2,"noiseScale":0.37,"octaves":3,"heightMultiplier":30.0,"algorithmVersion":"value-noise-fbm-v1","unexpected":true}""")]
    [InlineData("""{"Seed":42,"width":3,"height":2,"noiseScale":0.37,"octaves":3,"heightMultiplier":30.0,"algorithmVersion":"value-noise-fbm-v1"}""")]
    public void GenerateHeightMapJson_SerializesInvalidJsonError(string requestJson)
    {
        using var document = JsonDocument.Parse(InvokeExport(requestJson));
        var root = document.RootElement;

        Assert.Equal("invalid_json", root.GetProperty("error").GetString());
        Assert.Equal(JsonValueKind.Null, root.GetProperty("fields").ValueKind);
    }

    [Theory]
    [InlineData("noiseScale", "1e400")]
    [InlineData("noiseScale", "-1e400")]
    [InlineData("heightMultiplier", "1e400")]
    [InlineData("heightMultiplier", "-1e400")]
    public void GenerateHeightMapJson_ReportsDoubleOverflowAsInvalidJson(string field, string number)
    {
        var token = field == "noiseScale" ? "0.37" : "30.0";
        var json = ValidJson.Replace($"\"{field}\":{token}", $"\"{field}\":{number}", StringComparison.Ordinal);

        using var document = JsonDocument.Parse(InvokeExport(json));

        Assert.Equal("invalid_json", document.RootElement.GetProperty("error").GetString());
        Assert.Equal(JsonValueKind.Null, document.RootElement.GetProperty("fields").ValueKind);
    }

    [Theory]
    [InlineData("noiseScale")]
    [InlineData("heightMultiplier")]
    public void GenerateHeightMapJson_ReportsRepresentableOutOfRangeNumbersAsValidation(string field)
    {
        var token = field == "noiseScale" ? "0.37" : "30.0";
        var json = ValidJson.Replace($"\"{field}\":{token}", $"\"{field}\":1e308", StringComparison.Ordinal);

        using var document = JsonDocument.Parse(InvokeExport(json));

        Assert.Equal("validation", document.RootElement.GetProperty("error").GetString());
        Assert.True(document.RootElement.GetProperty("fields").TryGetProperty(field, out _));
    }

    [Fact]
    public void GenerateHeightMapJson_ProducesStableValuesAcrossCalls()
    {
        using var first = JsonDocument.Parse(InvokeExport(ValidJson));
        using var second = JsonDocument.Parse(InvokeExport(ValidJson));

        Assert.Equal(
            first.RootElement.GetProperty("result").GetProperty("values").GetRawText(),
            second.RootElement.GetProperty("result").GetProperty("values").GetRawText());
        Assert.Equal(CoreBuildId.Value, second.RootElement.GetProperty("coreBuildId").GetString());
    }

    private static string InvokeExport(string requestJson)
    {
        var assembly = Assembly.Load("WorldGenerator.Wasm");
        var type = assembly.GetType("WorldGeneratorInterop", throwOnError: true)!;
        var method = type.GetMethod(
            "GenerateHeightMapJson",
            BindingFlags.Public | BindingFlags.Static)!;

        return (string)method.Invoke(null, new object?[] { requestJson })!;
    }
}
