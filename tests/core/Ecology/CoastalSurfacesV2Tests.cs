using System.Security.Cryptography;
using System.Text.Json;
using Xunit;

namespace WorldGenerator.Core.Tests;

public sealed class CoastalSurfacesV2Tests
{
    private readonly Xunit.Abstractions.ITestOutputHelper output;
    public CoastalSurfacesV2Tests(Xunit.Abstractions.ITestOutputHelper output) => this.output = output;

    [Fact]
    public void DistancesMatchIndependentRectangularReferenceAndStopAtSixteen()
    {
        var ocean = new bool[60]; ocean[0] = true;
        Assert.Equal(new byte[] {
            0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,255,255,255,
            1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,255,255,255,255,
            2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,255,255,255,255,255
        }, CoastalSurfaces.Distances(ocean, 20, 3));
        Assert.Equal(new byte[] { 0, 1, 1, 2 }, CoastalSurfaces.Distances([true, false, false, false], 2, 2));
        Assert.All(CoastalSurfaces.Distances(new bool[6], 3, 2), d => Assert.Equal(255, d));
        Assert.All(CoastalSurfaces.Distances(Enumerable.Repeat(true, 6).ToArray(), 3, 2), d => Assert.Equal(0, d));
        Assert.All(CoastalSurfaces.Distances(new bool[4], 2, 2), d => Assert.Equal(255, d)); // Map edge is not ocean.
    }

    [Fact]
    public void BlendMatchesIndependentFloat32Literals()
    {
        // python3 tests/reference/coasts_v2_reference.py, independent of production code.
        float[] a = [.5f, .5f, 0, 0, 0];
        CoastalSurfaces.Blend(a, 10, .04, .5f, .7f, .1f);
        Assert.Equal(new[] { .31464558839797974f, .3056669235229492f, .37968748807907104f, 0, 0 }, a);
        float[] b = [.2f, .3f, 0, .4f, .1f];
        CoastalSurfaces.Blend(b, 8, .05, .8f, .25f, .3f);
        Assert.Equal(new[] { .18937493860721588f, .32657870650291443f, .027099711820483208f, .3569466471672058f, .10000000149011612f }, b);
        float[] c = [.2f, .3f, 0, .4f, .1f];
        CoastalSurfaces.Blend(c, 4, .025, .8f, .25f, .6f);
        Assert.Equal(new[] { .19478443264961243f, .3003901541233063f, .005235250107944012f, .3995901942253113f, .10000000149011612f }, c);
    }

    [Fact]
    public void FullStrengthBeachExtendsToFourAndTenCellSandFadesGradually()
    {
        for (byte d = 1; d <= 4; d++) Assert.True(Blend(d, .02, .5f, .7f, .1f)[2] >= .85f);
        var previous = 1f;
        for (byte d = 4; d <= 16; d++)
        {
            var sand = Blend(d, .02, .5f, .7f, .1f)[2];
            Assert.True(sand <= previous); previous = sand;
        }
        Assert.True(Blend(10, .04, .5f, .7f, .1f)[2] > .2f);
        Assert.True(Blend(15, .02, .5f, .7f, .1f)[2] > 0);
        Assert.Equal(0, Blend(16, .02, .5f, .7f, .1f)[2]);
        Assert.InRange(Blend(4, .02 + 1e-6, .5f, .7f, .1f)[2], .8999999f, .9f);
        Assert.InRange(Blend(4, .10 - 1e-6, .5f, .7f, .1f)[2], 0, 1e-8f);
    }

    [Fact]
    public void SlopeAndMoistureLimitWidthWithoutRandomRibbons()
    {
        Assert.True(Blend(10, .02, .5f, .7f, .1f)[2] > Blend(10, .02, 1, .7f, .1f)[2]);
        Assert.True(Blend(10, .02, .5f, .7f, .1f)[2] > Blend(10, .02, .5f, .7f, .4f)[2]);
        Assert.Equal(0, Blend(13, .01, 1, .7f, .1f)[2]); // Wet local endDistance=12.5.
        Assert.Equal(0, Blend(6, .01, .5f, .7f, .6f)[2]); // Steep local endDistance=6.
        Assert.Equal(0, Blend(1, .03, .5f, .7f, .6f)[2]);
        var warm = Blend(1, .005, .5f, .7f, .1f);
        var cold = Blend(1, .005, .5f, .1f, .1f);
        var wet = Blend(1, .005, 1, .7f, .1f);
        Assert.True(cold[2] < warm[2]); Assert.True(wet[2] < warm[2]); Assert.True(wet[0] > warm[0]);
        float[] cliff = [.5f, .5f, 0, 0, 0];
        CoastalSurfaces.Blend(cliff, 1, .005, .5f, .7f, .95f);
        Assert.Equal(new[] { 0f, 0, 0, 1, 0 }, cliff);
        var belowSlopeBoundary = Blend(4, .01, .5f, .7f, .15f)[2];
        var aboveSlopeBoundary = Blend(4, .01, .5f, .7f, .150001f)[2];
        Assert.InRange(Math.Abs(belowSlopeBoundary - aboveSlopeBoundary), 0, 1e-6f);
    }

    [Fact]
    public void EveryMixtureIsBoundedAndSnowBitsAndOutsideCoverageRemainExact()
    {
        foreach (var snow in new[] { 0f, BitConverter.Int32BitsToSingle(int.MinValue), .1f, .8f, 1f })
        foreach (var d in new byte[] { 0, 1, 4, 6, 8, 12, 13, 15, 16, 255 })
        foreach (var e in new[] { -.01, 0, .005, .02, .03, .05, .0755, .10, .15 })
        foreach (var m in new[] { 0f, .65f, .8f, 1f })
        foreach (var t in new[] { 0f, .25f, .5f, 1f })
        foreach (var s in new[] { 0f, .15f, .3f, .6f, .9f, 1.5f })
        {
            float[] a = [(1-snow)*.25f, (1-snow)*.25f, 0, (1-snow)*.5f, snow];
            var original = Bits(a);
            CoastalSurfaces.Blend(a, d, e, m, t, s);
            Assert.All(a, v => { Assert.True(float.IsFinite(v)); Assert.InRange(v, 0, 1); });
            Assert.InRange(Math.Abs(a.Sum(v => (double)v) - 1), 0, 1e-6);
            Assert.Equal(BitConverter.SingleToInt32Bits(snow), BitConverter.SingleToInt32Bits(a[4]));
            if (d == 0 || d >= 16 || e <= 0 || e >= .10) Assert.Equal(original, Bits(a));
            if (s >= .6f && (d >= 6 || e >= .03)) Assert.Equal(original, Bits(a));
        }
    }

    [Fact]
    public void AuthoritativeOceanAndDisconnectedBelowOrEqualSeaLandAreProtected()
    {
        const int w = 24, h = 3;
        var heights = Enumerable.Repeat(6.3f, w * h).ToArray();
        for (var y = 0; y < h; y++) heights[y*w] = 6;
        heights[w+5] = 1; heights[w+6] = 6;
        // Surround the two below/equal-sea interior samples with above-sea cells.
        var ocean = OceanClassifier.Ocean(heights, w, h, 6);
        Assert.False(ocean[w+5]); Assert.False(ocean[w+6]);
        var biomes = ocean.Select(o => o ? LandscapeBiome.Ocean : LandscapeBiome.Grassland).ToArray();
        var moisture = Enumerable.Repeat(.5f, w*h).ToArray(); var temperature = Enumerable.Repeat(.7f, w*h).ToArray(); var slope = new float[w*h];
        var weights = SurfaceCoverage.Derive(heights, biomes, moisture, temperature, slope, 30);
        var original = (float[])weights.Clone();
        CoastalSurfaces.Apply(weights, heights, ocean, moisture, temperature, slope, w, h, 30, .2);
        Assert.True(weights[10*5+2] > .2);
        for (var i = 0; i < w*h; i++)
        {
            Assert.Equal(original[i*5+4], weights[i*5+4]);
            if (ocean[i] || heights[i] <= 6 || i%w >= 16)
                Assert.Equal(Bits(original.AsSpan(i*5, 5).ToArray()), Bits(weights.AsSpan(i*5, 5).ToArray()));
        }
        var noOcean = (float[])original.Clone();
        CoastalSurfaces.Apply(noOcean, heights, new bool[w*h], moisture, temperature, slope, w, h, 30, .2);
        Assert.Equal(Bits(original), Bits(noOcean));
        CoastalSurfaces.Apply(noOcean, heights, ocean, moisture, temperature, slope, w, h, 0, .2);
        Assert.Equal(Bits(original), Bits(noOcean));
    }

    [Fact]
    public void MaximumScratchAllocationStaysWithinOriginalTwoBufferBudget()
    {
        const int n = 512;
        var ocean = Enumerable.Range(0, n*n).Select(i => i%n == 0).ToArray();
        CoastalSurfaces.Distances(ocean, n, n);
        var before = GC.GetAllocatedBytesForCurrentThread();
        var distances = CoastalSurfaces.Distances(ocean, n, n);
        var allocated = GC.GetAllocatedBytesForCurrentThread() - before;
        output.WriteLine($"512x512 distance+queue allocated bytes={allocated}");
        Assert.InRange(allocated, n*n*5, n*n*5+4096); Assert.True(allocated <= 2*1024*1024);
        for (var i = 0; i < distances.Length; i++) Assert.Equal(i%n <= 16 ? i%n : 255, distances[i]);
    }

    [Fact]
    public void AllNonCoverageFieldsAndOldCoverageKeepTheirPreChangeFingerprints()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        using var fixture = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "landscape-v9-fingerprints.json")));
        var widerSamples = 0;
        foreach (var item in fixture.RootElement.GetProperty("cases").EnumerateArray())
        {
            var request = item.GetProperty("request").Deserialize<TerrainRequest>(options)! with { AlgorithmVersion = TerrainLimits.AlgorithmVersion };
            var result = TerrainGenerator.Generate(request); var m = result.HeightMap; var bound = (float)request.HeightMap.HeightMultiplier;
            var ocean = m.Biomes.Select(b => b == LandscapeBiome.Ocean).ToArray();
            var baseline = SurfaceCoverage.Derive(m.Values, m.Biomes, m.Moisture, m.Temperature, m.Slope, bound);
            var old = (float[])baseline.Clone();
            Historical.V8.CoastalSurfaces.Apply(old, m.Values, ocean, m.Moisture, m.Temperature, m.Slope, m.Width, m.Height, bound, request.SeaLevel);
            var fields = new Dictionary<string, object> { ["values"] = m.Values, ["biomes"] = m.Biomes, ["moisture"] = m.Moisture, ["temperature"] = m.Temperature, ["slope"] = m.Slope, ["vegetationDensity"] = m.VegetationDensity, ["trees"] = m.Trees, ["rocks"] = m.Rocks, ["simulation"] = result.Simulation, ["surfaceWeights"] = old };
            foreach (var (name, value) in fields)
                Assert.Equal(item.GetProperty("hashes").GetProperty(name).GetString(), Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(value, options))).ToLowerInvariant());
            var distances = CoastalSurfaces.Distances(ocean, m.Width, m.Height);
            for (var i = 0; i < m.Values.Length; i++)
            {
                var sea = request.SeaLevel * bound;
                Assert.Equal(BitConverter.SingleToInt32Bits(old[i*5+4]), BitConverter.SingleToInt32Bits(m.SurfaceWeights[i*5+4]));
                var outside = bound == 0 || ocean[i] || distances[i] >= 16 || m.Values[i] <= sea || ((double)m.Values[i]-sea)/bound >= .10;
                if (outside) Assert.Equal(Bits(baseline.AsSpan(i*5, 5).ToArray()), Bits(m.SurfaceWeights.AsSpan(i*5, 5).ToArray()));
                Assert.InRange(Math.Abs(m.SurfaceWeights.AsSpan(i*5, 5).ToArray().Sum(v => (double)v) - (ocean[i] ? 0 : 1)), 0, 1e-6);
                if (m.SurfaceWeights[i*5+2] > old[i*5+2]) widerSamples++;
            }
        }
        Assert.True(widerSamples > 0);
    }

    [Theory]
    [InlineData(2, 2, 0, int.MinValue)]
    [InlineData(3, 2, 30, int.MaxValue)]
    [InlineData(129, 97, 30, -7)]
    [InlineData(512, 512, 30, 42)]
    public void CompleteMapsRemainFiniteIndependentAndDeterministic(int w, int h, double bound, int seed)
    {
        var r = TerrainTests.Request(0) with { HeightMap = TerrainTests.Request().HeightMap with { Width = w, Height = h, HeightMultiplier = bound, Seed = seed, NoiseScale = .03 } };
        var a = TerrainGenerator.Generate(r).HeightMap; var b = TerrainGenerator.Generate(r).HeightMap;
        Assert.Equal(a.SurfaceWeights, b.SurfaceWeights); Assert.NotSame(a.SurfaceWeights, b.SurfaceWeights);
        Assert.All(a.SurfaceWeights, v => { Assert.True(float.IsFinite(v)); Assert.InRange(v, 0, 1); });
    }

    private static float[] Blend(byte distance, double elevation, float moisture, float temperature, float slope)
    {
        float[] a = [.5f, .5f, 0, 0, 0];
        CoastalSurfaces.Blend(a, distance, elevation, moisture, temperature, slope);
        return a;
    }
    private static int[] Bits(float[] values) => Array.ConvertAll(values, BitConverter.SingleToInt32Bits);
}
