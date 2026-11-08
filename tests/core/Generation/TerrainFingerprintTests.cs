using System.Security.Cryptography;
using System.Text.Json;
using Xunit;

namespace WorldGenerator.Core.Tests;

public sealed class TerrainFingerprintTests
{
    [Fact]
    public void CompleteV8ResultsRemainIdenticalAcrossOrganizationalRefactoring()
    {
        var directory = Path.Combine(AppContext.BaseDirectory, "Fixtures");
        using var manifest = JsonDocument.Parse(File.ReadAllText(Path.Combine(directory, "landscape-v8-fingerprints.json")));
        using var requests = JsonDocument.Parse(File.ReadAllText(Path.Combine(directory, manifest.RootElement.GetProperty("requestFixture").GetString()!)));
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        Assert.Equal(TerrainLimits.AlgorithmVersion, manifest.RootElement.GetProperty("algorithmVersion").GetString());
        Assert.Equal(TerrainLimits.ResultVersion, manifest.RootElement.GetProperty("resultVersion").GetString());
        foreach (var item in manifest.RootElement.GetProperty("cases").EnumerateArray())
        {
            var request = requests.RootElement.GetProperty("cases")[item.GetProperty("index").GetInt32()]
                .GetProperty("request").Deserialize<TerrainRequest>(options)! with { AlgorithmVersion = TerrainLimits.AlgorithmVersion };
            var result = TerrainGenerator.Generate(request);
            Assert.Equal(item.GetProperty("resultSha256").GetString(), Hash(result.HeightMap));
            Assert.Equal(item.GetProperty("simulationSha256").GetString(), Hash(result.Simulation));
        }
        string Hash(object value) => Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(value, options))).ToLowerInvariant();
    }
}
