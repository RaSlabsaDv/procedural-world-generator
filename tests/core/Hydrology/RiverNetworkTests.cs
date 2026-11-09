using Xunit;

namespace WorldGenerator.Core.Tests;

public sealed class RiverNetworkTests
{
    [Theory]
    [InlineData(0, 32)]
    [InlineData(16384, 32)]
    [InlineData(16385, 33)]
    [InlineData(262144, 512)]
    public void ThresholdUsesIntegerCeilingAndMinimum(int land, int expected) =>
        Assert.Equal(expected, RiverNetworkExtractor.Threshold(land));

    [Fact]
    public void HandCalculatedBranchesMergeIntoBoundaryOutletOrOceanMouth()
    {
        const int width = 7, height = 34, count = width * height;
        foreach (var mouthIsOcean in new[] { false, true })
        {
            var biomes = Enumerable.Repeat(LandscapeBiome.Grassland, count).ToArray();
            if (mouthIsOcean) biomes[3] = LandscapeBiome.Ocean;
            var receiver = Enumerable.Repeat(-1, count).ToArray();
            // Two side tributaries and a central chain. Every edge is D8-adjacent.
            for (var y = 1; y < height - 1; y++)
                for (var x = 1; x < width - 1; x++)
                {
                    var targetX = x < 3 ? 2 : x > 3 ? 4 : 3;
                    receiver[y * width + x] = (y - 1) * width + targetX;
                }
            receiver[width + 2] = width + 3;
            receiver[width + 4] = width + 3;
            var accumulation = Enumerable.Repeat(1u, count).ToArray();
            if (mouthIsOcean) accumulation[3] = 0;
            // All edges go north except the two row1 confluence edges.
            for (var y = height - 2; y >= 2; y--)
                for (var x = 1; x < width - 1; x++)
                {
                    var i = y * width + x;
                    accumulation[receiver[i]] += accumulation[i];
                }
            foreach (var x in new[] { 1, 2, 4, 5, 3 })
                accumulation[receiver[width + x]] += accumulation[width + x];
            var hydrology = new HydrologyResult(receiver, accumulation, new float[count], HydrologyAnalyzer.AlgorithmVersion);
            var before = accumulation.ToArray();
            var network = RiverNetworkExtractor.Extract(hydrology, biomes);
            // Each side branch has area 2*(32-y)+1. Row16=33 qualifies; row17=31 does not.
            var expected = new List<int>();
            if (!mouthIsOcean) expected.Add(3);
            expected.AddRange([9, 10, 11]);
            for (var y = 2; y <= 16; y++) expected.AddRange([y * width + 2, y * width + 4]);
            Assert.Equal(expected, network.CellIndices);
            Assert.Equal(63u, accumulation[9]);
            Assert.Equal(158u, accumulation[10]);
            Assert.Equal(mouthIsOcean ? 158u : 159u, accumulation[3]);
            Assert.Equal(before, accumulation);
            Assert.Equal("river-network-v1", network.AlgorithmVersion);
            var byCell = network.CellIndices.Select((cell, i) => (cell, width: network.Widths[i])).ToDictionary(x => x.cell, x => x.width);
            foreach (var cell in network.CellIndices)
            {
                Assert.InRange(byCell[cell], .6f, 3f);
                var next = receiver[cell];
                if (next >= 0 && biomes[next] != LandscapeBiome.Ocean)
                    Assert.True(byCell[next] >= byCell[cell]);
            }
            Assert.Equal(receiver[9], receiver[11]); // confluence
            Assert.Equal(mouthIsOcean ? LandscapeBiome.Ocean : LandscapeBiome.Grassland, biomes[3]);
        }
    }

    [Fact]
    public void WidthsUseFloatingDivisionFinalFloatCastAndClamp()
    {
        // Controlled accumulation values isolate the metadata formula, not routing.
        const int count = 8192;
        var biomes = Enumerable.Repeat(LandscapeBiome.Grassland, count).ToArray();
        var accumulation = new uint[count];
        accumulation[0] = 31; accumulation[1] = 32; accumulation[2] = 128; accumulation[3] = 8192;
        var hydrology = new HydrologyResult(Enumerable.Repeat(-1, count).ToArray(), accumulation,
            new float[count], HydrologyAnalyzer.AlgorithmVersion);
        var a = RiverNetworkExtractor.Extract(hydrology, biomes);
        var b = RiverNetworkExtractor.Extract(hydrology, biomes);
        Assert.Equal(new[] { 1, 2, 3 }, a.CellIndices);
        Assert.Equal(new[] { .6f, .85f, 3f }, a.Widths);
        Assert.Equal(a.CellIndices, b.CellIndices);
        Assert.Equal(a.Widths, b.Widths);
        Assert.NotSame(a.CellIndices, b.CellIndices);
        Assert.NotSame(a.Widths, b.Widths);
    }

    [Theory]
    [InlineData(2, 2, false)]
    [InlineData(2, 512, false)]
    [InlineData(17, 9, false)]
    [InlineData(512, 512, false)]
    [InlineData(17, 9, true)]
    public void FinalizedDrainageIsPreservedIncludingDepressionsAndNoOcean(int width, int height, bool ocean)
    {
        var n = width * height;
        var heights = Enumerable.Range(0, n).Select(i => (float)((i * 37L) % 113)).ToArray();
        var biomes = Enumerable.Repeat(ocean ? LandscapeBiome.Ocean : LandscapeBiome.Grassland, n).ToArray();
        var hydrology = HydrologyAnalyzer.Analyze(heights, biomes, width, height);
        var receiver = hydrology.ReceiverIndex.ToArray();
        var accumulation = hydrology.FlowAccumulation.ToArray();
        var depth = hydrology.DepressionDepth.ToArray();
        var a = RiverNetworkExtractor.Extract(hydrology, biomes);
        Assert.Equal(receiver, hydrology.ReceiverIndex);
        Assert.Equal(accumulation, hydrology.FlowAccumulation);
        Assert.Equal(depth, hydrology.DepressionDepth);
        var expected = Enumerable.Range(0, n).Where(i => !ocean && accumulation[i] >= RiverNetworkExtractor.Threshold(n)).ToArray();
        Assert.Equal(expected, a.CellIndices);
        Assert.Equal(a.CellIndices.Length, a.Widths.Length);
        if (ocean || n <= 4 || width == 2) Assert.Empty(a.CellIndices);
        if (width == 512) Assert.Contains(a.CellIndices, i => depth[i] > 0); // retained analysis crossing, not visible lake water
    }

    [Fact]
    public void InvalidInternalContractsAreRejected()
    {
        var valid = new HydrologyResult(new int[4], new uint[4], new float[4], HydrologyAnalyzer.AlgorithmVersion);
        Assert.Throws<ArgumentNullException>(() => RiverNetworkExtractor.Extract(null!, new LandscapeBiome[4]));
        Assert.Throws<ArgumentException>(() => RiverNetworkExtractor.Extract(valid, new LandscapeBiome[3]));
        Assert.Throws<ArgumentException>(() => RiverNetworkExtractor.Extract(valid with { AlgorithmVersion = "old" }, new LandscapeBiome[4]));
        Assert.Throws<ArgumentException>(() => RiverNetworkExtractor.Extract(valid, [(LandscapeBiome)99, 0, 0, 0]));
    }
}
