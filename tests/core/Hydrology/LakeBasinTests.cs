using Xunit;

namespace WorldGenerator.Core.Tests;

public sealed class LakeBasinTests
{
    // Controlled finalized inputs isolate lake policy; actual generated graphs are tested below.
    private sealed class World(int width = 20, int height = 20)
    {
        internal readonly int Width = width, Height = height;
        internal readonly float[] Heights = Enumerable.Repeat(10f, width * height).ToArray();
        internal readonly float[] Surface = Enumerable.Repeat(10f, width * height).ToArray();
        internal readonly LandscapeBiome[] Biomes = Enumerable.Repeat(LandscapeBiome.Grassland, width * height).ToArray();
        internal readonly int[] Receiver = Enumerable.Repeat(-1, width * height).ToArray();
        internal readonly uint[] Flow = new uint[width * height];
        internal readonly float[] Depth = new float[width * height];
        internal readonly List<int> Rivers = [];
        internal int Bowl(int x, int y, int w = 4, int h = 4, float level = 10, float depth = 6, uint flow = 100, bool fed = true)
        {
            var root = y * Width + x;
            for (var dy = 0; dy < h; dy++) for (var dx = 0; dx < w; dx++)
            {
                var i = root + dy * Width + dx;
                Heights[i] = level - depth; Surface[i] = level; Depth[i] = depth;
                Receiver[i] = i - Width; Flow[i] = 1;
            }
            Flow[root] = flow;
            if (fed) Rivers.Add(root);
            return root;
        }
        internal LakeMapResult Analyze() => LakeBasinAnalyzer.Analyze(Heights, Surface, Biomes,
            new(Receiver, Flow, Depth, HydrologyAnalyzer.AlgorithmVersion),
            new(Rivers.Order().ToArray(), new float[Rivers.Count], RiverNetworkExtractor.AlgorithmVersion), Width, Height, 100);
    }

    [Fact]
    public void BowlPreservesAllExitsAndUsesStableRepresentativeSpill()
    {
        var w = new World(); var root = w.Bowl(2, 2);
        w.Flow[root + 1] = 100; // tie: lower source index wins
        var before = w.Heights.ToArray(); var receiver = w.Receiver.ToArray();
        var a = w.Analyze(); var b = w.Analyze();
        Assert.Equal("lake-basins-v1", a.AlgorithmVersion);
        Assert.Equal(new LakeBasin(0, 10, 16, 42, 22), Assert.Single(a.Basins));
        Assert.Equal(new[] { 42, 43, 44, 45 }, a.SpillFromCells);
        Assert.Equal(new[] { 42 }, a.RiverCrossingFromCells);
        Assert.Equal(16, a.LakeIdByCell.Count(id => id == 0));
        Assert.Equal(before, w.Heights); Assert.Equal(receiver, w.Receiver);
        Assert.Equal(a.LakeIdByCell, b.LakeIdByCell); Assert.Equal(a.Basins, b.Basins);
        Assert.NotSame(a.LakeIdByCell, b.LakeIdByCell); Assert.NotSame(a.SpillFromCells, b.SpillFromCells);
    }

    [Fact]
    public void SurfaceIsAuthoritativeRatherThanReconstructedFromRoundedDepth()
    {
        var w = new World(); var root = w.Bowl(2, 2);
        // Rounded depth no longer preserves the exact double sum used by a naive reconstruction.
        w.Heights[root] = .1f;
        w.Depth[root] = w.Surface[root] - w.Heights[root];
        Assert.NotEqual((double)w.Surface[root], (double)w.Heights[root] + w.Depth[root]);
        Assert.Equal(10, Assert.Single(w.Analyze().Basins).WaterLevel);
    }

    [Theory]
    [InlineData(false)] [InlineData(true)]
    public void TouchingComponentsMergeOnlyForExactlyEqualSurfaces(bool different)
    {
        var w = new World(); w.Bowl(2, 2);
        w.Bowl(6, 2, level: different ? MathF.BitIncrement(10) : 10);
        var a = w.Analyze();
        Assert.Equal(different ? 2 : 1, a.Basins.Length);
        Assert.Equal(different ? 16 : 32, a.Basins[0].CellCount);
        if (different) Assert.NotEqual(a.Basins[0].WaterLevel, a.Basins[1].WaterLevel);
    }

    [Fact]
    public void RiverInletOutletAndLakeTransitionReuseOriginalEdges()
    {
        var w = new World(); var a = w.Bowl(2, 2, level: 12); var b = w.Bowl(6, 2, level: 10);
        var inlet = a + 4 * w.Width;
        w.Receiver[inlet] = inlet - w.Width; w.Rivers.Add(inlet);
        w.Receiver[a + 3] = b; w.Flow[a + 3] = 200; w.Rivers.Add(a + 3);
        var map = w.Analyze();
        Assert.Equal(2, map.Basins.Length);
        Assert.Equal(new[] { a, a + 3, b, inlet }, map.RiverCrossingFromCells);
        Assert.Equal(0, map.LakeIdByCell[a + 3]); Assert.Equal(1, map.LakeIdByCell[b]);
        Assert.Equal(b, map.Basins[0].PrimarySpillTo);
        Assert.Equal(-1, map.LakeIdByCell[inlet]);
    }

    [Theory]
    [InlineData(3, 4, 6, true)] // too small
    [InlineData(4, 4, .5f, true)] // too shallow relative to height100
    [InlineData(4, 4, 6, false)] // no existing river
    public void SmallShallowAndUnfedCandidatesAreRejected(int width, int height, float depth, bool fed)
    {
        var w = new World(); w.Bowl(2, 2, width, height, depth: depth, fed: fed);
        Assert.Empty(w.Analyze().Basins);
    }

    [Fact]
    public void RankingSkipsWholeCandidatesThatNoLongerFitAndNeverTrims()
    {
        var w = new World(); var a = w.Bowl(2, 2, h: 8, flow: 200);
        var b = w.Bowl(10, 2, flow: 300); var c = w.Bowl(10, 10, flow: 100);
        var map = w.Analyze(); // area budget32: chooseB16, skipA32, thenC16
        Assert.Equal(2, map.Basins.Length);
        Assert.Equal(-1, map.LakeIdByCell[a]); Assert.Equal(0, map.LakeIdByCell[b]); Assert.Equal(1, map.LakeIdByCell[c]);
        Assert.All(map.Basins, basin => Assert.Equal(16, basin.CellCount));
        w.Flow[b] = 200; // equal depth/flow: lower rootA wins all32
        Assert.Equal(32, Assert.Single(w.Analyze().Basins).CellCount);
        w.Depth[b] = 8; w.Heights[b] = 2; // deeperB wins the tie again
        Assert.Equal(-1, w.Analyze().LakeIdByCell[a]);
    }

    [Fact]
    public void LakeCountAndAreaBudgetsAreBoundedAndOceanIsExcluded()
    {
        var w = new World(128, 128);
        for (var i = 0; i < 65; i++) w.Bowl(2 + 6 * (i % 20), 2 + 6 * (i / 20));
        var result = w.Analyze();
        Assert.Equal(64, result.Basins.Length);
        Assert.Equal(64 * 16, result.LakeIdByCell.Count(x => x >= 0));
        Array.Fill(w.Biomes, LandscapeBiome.Ocean);
        Assert.Empty(w.Analyze().Basins);
    }

    [Theory]
    [InlineData(2, 2)] [InlineData(2, 512)] [InlineData(17, 9)] [InlineData(512, 512)]
    public void ActualDrainageIsPreservedForRectanglesAndMaximumGrid(int width, int height)
    {
        var n = width * height; var heights = Enumerable.Range(0, n).Select(i => (float)((i * 37L) % 113)).ToArray();
        var biomes = Enumerable.Repeat(LandscapeBiome.Grassland, n).ToArray();
        var h = HydrologyAnalyzer.Analyze(heights, biomes, width, height, out var surface);
        var old = HydrologyAnalyzer.Analyze(heights, biomes, width, height);
        var rivers = RiverNetworkExtractor.Extract(h, biomes);
        var allocatedBefore = GC.GetAllocatedBytesForCurrentThread();
        var result = LakeBasinAnalyzer.Analyze(heights, surface, biomes, h, rivers, width, height, 113);
        var allocated = GC.GetAllocatedBytesForCurrentThread() - allocatedBefore;
        if (width == 512)
            Assert.True(allocated < 16L * n + 20L * (n / 16) + 65536, $"Lake allocation: {allocated}");
        Assert.Equal(old.ReceiverIndex, h.ReceiverIndex); Assert.Equal(old.FlowAccumulation, h.FlowAccumulation); Assert.Equal(old.DepressionDepth, h.DepressionDepth);
        Assert.Equal(n, result.LakeIdByCell.Length); Assert.InRange(result.Basins.Length, 0, 64);
        Assert.True(result.Basins.Sum(b => b.CellCount) <= n * 8 / 100);
        if (width == 2) Assert.Empty(result.Basins);
        Array.Clear(heights);
        h = HydrologyAnalyzer.Analyze(heights, biomes, width, height, out surface);
        rivers = RiverNetworkExtractor.Extract(h, biomes);
        Assert.Empty(LakeBasinAnalyzer.Analyze(heights, surface, biomes, h, rivers, width, height, 0).Basins);
    }
}
