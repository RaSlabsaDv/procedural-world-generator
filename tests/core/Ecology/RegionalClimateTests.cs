using System.Security.Cryptography;
using System.Text.Json;
using Xunit;

namespace WorldGenerator.Core.Tests;

public sealed class RegionalClimateTests
{
    private static TerrainRequest Request(int seed = 42) => TerrainTests.Request(16) with
    {
        HeightMap = TerrainTests.Request().HeightMap with { Width = 129, Height = 97, NoiseScale = .03, Octaves = 4, Seed = seed }
    };

    // Independent literals: python3 tests/reference/regional_climate_reference.py.
    [Theory]
    [InlineData(0, 0, 42, .55, .65, .6, .8654422760009766f, .1898556351661682f)]
    [InlineData(64, 48, 42, .2, .65, .6, .6222646832466125f, .5087660551071167f)]
    [InlineData(255, 127, int.MinValue, .6, .8, .38, .5905462503433228f, .0554271936416626f)]
    [InlineData(511, 511, int.MaxValue, 0, .2, .9, .13835382461547852f, .9553868174552917f)]
    [InlineData(97, 33, -7, .48, .45, .6, .3700665235519409f, .3404873311519623f)]
    public void ClimateMatchesIndependentFloat32Literals(int x, int y, int seed, double h, double m, double t, float moisture, float temperature) =>
        Assert.Equal((moisture, temperature), RegionalClimate.Sample(x, y, unchecked((uint)seed), h, m, t));

    [Fact]
    public void CoverageMatchesIndependentFloat32Literals()
    {
        var output = new float[5];
        SurfaceCoverage.Write(output, false, .49, .44f, .29f, .75f);
        Assert.Equal(new[] { .10776560753583908f, .2672343850135803f, 0, .3749999701976776f, .2500000298023224f }, output);
        SurfaceCoverage.Write(output, false, .4, .65f, .35f, 0);
        Assert.Equal(new[] { .9376295208930969f, .0606452152132988f, 0, 0, .001725242007523775f }, output);
        SurfaceCoverage.Write(output, false, .7, .65f, .1f, 1.2f);
        Assert.Equal(new[] { 0f, 0, 0, .5000001788139343f, .4999998211860657f }, output);
        SurfaceCoverage.Write(output, true, .7, .65f, .1f, 0);
        Assert.Equal(new float[5], output);
    }

    [Theory]
    [InlineData(true, .7, .1, 0, LandscapeBiome.Ocean)]
    [InlineData(false, .48, .26, 1.2, LandscapeBiome.SnowHighlands)]
    [InlineData(false, .479999, .26, 0, LandscapeBiome.Tundra)]
    [InlineData(false, .48, .260001, 0, LandscapeBiome.Tundra)]
    [InlineData(false, .48, .26, 1.200001, LandscapeBiome.Rock)]
    [InlineData(false, .7, .8, 0, LandscapeBiome.BroadleafForest)]
    public void SnowCategoryHasExplicitPrecedenceAndBoundaries(bool ocean, double h, double t, double s, LandscapeBiome expected) =>
        Assert.Equal(expected, LandscapeBiomeClassifier.Classify(ocean, h, .7, t, s, .8));

    [Fact]
    public void SnowFadesContinuouslyAndSteepCliffsStayRock()
    {
        Assert.Equal(0, SnowCover.Fraction(.38, 0, 0));
        Assert.Equal(1, SnowCover.Fraction(.60, .20, 1));
        Assert.Equal(0, SnowCover.Fraction(1, .38, 0));
        Assert.Equal(0, SnowCover.Fraction(1, 0, 1.4));
        Assert.InRange(SnowCover.Fraction(.38 + 1e-6, 0, 0), 0, 1e-8);
        Assert.InRange(1 - SnowCover.Fraction(.60 - 1e-6, 0, 0), 0, 1e-8);
        Assert.InRange(SnowCover.Fraction(1, .38 - 1e-6, 0), 0, 1e-8);
        Assert.InRange(SnowCover.Fraction(1, 0, 1.4 - 1e-6), 0, 1e-8);
        var weights = new float[5];
        SurfaceCoverage.Write(weights, false, .8, .8f, 0, 1.5f);
        Assert.Equal(new[] { 0f, 0, 0, 1, 0 }, weights);
        Assert.True(SnowCover.Fraction(.45, .25, .2) > 0);
        Assert.False(SnowCover.IsHighland(.45, .25, .2)); // Coverage is not a category mask.
    }

    [Theory]
    [InlineData(42)]
    [InlineData(2026)]
    [InlineData(-7)]
    public void WarmthSweepsNeverIncreaseSnowAndPreserveTerrain(int seed)
    {
        var r = Request(seed);
        var previous = TerrainGenerator.Generate(r with { GlobalWarmth = 0 });
        foreach (var warmth in new[] { .18, .38, .6, .9, 1 })
        {
            var current = TerrainGenerator.Generate(r with { GlobalWarmth = warmth });
            var a = previous.HeightMap; var b = current.HeightMap;
            Assert.Equal(a.Values, b.Values); Assert.Equal(a.Slope, b.Slope);
            Assert.Equal(previous.Simulation, current.Simulation);
            for (var i = 0; i < a.Values.Length; i++)
            {
                Assert.True(b.Temperature[i] >= a.Temperature[i]);
                Assert.True(b.SurfaceWeights[i * 5 + 4] <= a.SurfaceWeights[i * 5 + 4]);
                Assert.Equal(a.Biomes[i] == LandscapeBiome.Ocean, b.Biomes[i] == LandscapeBiome.Ocean);
            }
            previous = current;
        }
    }

    [Fact]
    public void ReferenceScenesHaveColdHighlandsWithoutSnowInHotLowlands()
    {
        var cold = TerrainGenerator.Generate(Request(2026) with { GlobalWarmth = .18 }).HeightMap;
        var mixed = TerrainGenerator.Generate(Request()).HeightMap;
        Assert.Contains(LandscapeBiome.SnowHighlands, cold.Biomes);
        Assert.Contains(LandscapeBiome.Tundra, cold.Biomes);
        Assert.Contains(Enumerable.Range(0, mixed.Values.Length), i => mixed.SurfaceWeights[i * 5 + 4] > .2);
        Assert.Contains(LandscapeBiome.BroadleafForest, mixed.Biomes);
        Assert.Contains(LandscapeBiome.ConiferForest, mixed.Biomes);
        foreach (var seed in new[] { 42, -7, int.MinValue, int.MaxValue })
        {
            var hot = LandscapeEcology.Derive(Enumerable.Repeat(9f, 129 * 97).ToArray(), Request(seed) with { GlobalWarmth = .9 });
            Assert.All(hot.Temperature, t => Assert.True(t >= .485f));
            for (var i = 0; i < hot.Values.Length; i++) Assert.Equal(0, hot.SurfaceWeights[i * 5 + 4]);
            Assert.DoesNotContain(LandscapeBiome.SnowHighlands, hot.Biomes);
        }
    }

    [Fact]
    public void ClimateIsAnchoredToWorldGridWithBoundedNeighborVariation()
    {
        var r = Request();
        var a = LandscapeEcology.Derive(Enumerable.Repeat(6f, 129 * 97).ToArray(), r);
        var small = r with { HeightMap = r.HeightMap with { Width = 65, Height = 49, NoiseScale = 1 }, LandformRegionScale = 4 };
        var b = LandscapeEcology.Derive(Enumerable.Repeat(6f, 65 * 49).ToArray(), small);
        for (var y = 0; y < 49; y++) for (var x = 0; x < 65; x++)
        {
            Assert.Equal(a.Moisture[y * 129 + x], b.Moisture[y * 65 + x]);
            Assert.Equal(a.Temperature[y * 129 + x], b.Temperature[y * 65 + x]);
        }
        // Quintic derivative <=1.875; three amplitude*frequency terms total 3 / 1.75.
        var moistureBound = .8 / 144 * 1.875 * 3 / 1.75 + 1e-6;
        var temperatureBound = .5 / 128 * 1.875 * 3 / 1.75 + 1e-6;
        for (var y = 0; y < 97; y++) for (var x = 0; x < 129; x++)
        {
            var i = y * 129 + x;
            if (x > 0) Check(i, i - 1);
            if (y > 0) Check(i, i - 129);
        }
        void Check(int i, int j)
        {
            Assert.InRange(Math.Abs(a.Moisture[i] - a.Moisture[j]), 0, moistureBound);
            Assert.InRange(Math.Abs(a.Temperature[i] - a.Temperature[j]), 0, temperatureBound);
        }
    }

    [Fact]
    public void ClimateSamplingAddsNoMapSizedAllocation()
    {
        RegionalClimate.Sample(0, 0, 42, .5, .65, .6);
        var before = GC.GetAllocatedBytesForCurrentThread();
        double checksum = 0;
        for (var y = 0; y < 512; y++) for (var x = 0; x < 512; x++)
        {
            var sample = RegionalClimate.Sample(x, y, 42, .5, .65, .6);
            checksum += sample.Moisture + sample.Temperature;
        }
        var bytes = GC.GetAllocatedBytesForCurrentThread() - before;
        Assert.InRange(bytes, 0, 256); Assert.True(checksum > 0);
    }

    [Fact]
    public void HeightsSlopesOceanAndSimulationMatchAllPreClimateFingerprints()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        using var fixture = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "landscape-v7-fingerprints.json")));
        foreach (var item in fixture.RootElement.GetProperty("cases").EnumerateArray())
        {
            var request = item.GetProperty("request").Deserialize<TerrainRequest>(options)! with { AlgorithmVersion = TerrainLimits.AlgorithmVersion };
            var result = TerrainGenerator.Generate(request); var m = result.HeightMap;
            foreach (var (name, value) in new Dictionary<string, object> { ["values"] = m.Values, ["slope"] = m.Slope, ["simulation"] = result.Simulation })
                Assert.Equal(item.GetProperty("hashes").GetProperty(name).GetString(), Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(value, options))).ToLowerInvariant());
            Assert.Equal(OceanClassifier.Ocean(m.Values, m.Width, m.Height, request.SeaLevel * (float)request.HeightMap.HeightMultiplier), m.Biomes.Select(b => b == LandscapeBiome.Ocean));
            Assert.All(m.Moisture.Concat(m.Temperature), v => { Assert.True(float.IsFinite(v)); Assert.InRange(v, 0, 1); });
            Assert.InRange(m.Trees.Length, 0, TerrainLimits.MaxTrees); Assert.InRange(m.Rocks.Length, 0, TerrainLimits.MaxRocks);
            foreach (var tree in m.Trees) Assert.Equal(LandscapeBiomeClassifier.Kind(m.Biomes[tree.CellIndex]), tree.Kind);
            for (var i = 0; i < m.Values.Length; i++)
            {
                var sum = 0d;
                for (var c = 0; c < 5; c++) { var weight = m.SurfaceWeights[i * 5 + c]; Assert.True(float.IsFinite(weight)); Assert.InRange(weight, 0, 1); sum += weight; }
                Assert.InRange(Math.Abs(sum - (m.Biomes[i] == LandscapeBiome.Ocean ? 0 : 1)), 0, 1e-6);
            }
        }
    }
}
