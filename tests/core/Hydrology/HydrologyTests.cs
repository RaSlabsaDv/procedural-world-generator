using Xunit;
namespace WorldGenerator.Core.Tests;

public sealed class HydrologyTests
{
    private static LandscapeBiome[] Land(int count) => Enumerable.Repeat(LandscapeBiome.Grassland, count).ToArray();

    [Fact]
    public void BasinSpillsThroughLowestRimUsingIndependentHeapqFixture()
    {
        // Independent Python heapq reference, integer elevations: no float-rounding ambiguity.
        float[] heights = [9, 9, 4, 9, 9, 9, 1, 2, 1, 9, 9, 2, 0, 2, 9, 9, 1, 2, 1, 9, 9, 9, 9, 9, 9];
        var result = HydrologyAnalyzer.Analyze(heights, Land(25), 5, 5);
        Assert.Equal(new int[] { -1, -1, -1, -1, -1, -1, 2, 2, 2, -1, -1, 6, 6, 7, -1, -1, 11, 11, 12, -1, -1, -1, -1, -1, -1 }, result.ReceiverIndex);
        Assert.Equal(new uint[] { 1, 1, 10, 1, 1, 1, 6, 2, 1, 1, 1, 3, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1 }, result.FlowAccumulation);
        Assert.Equal(new float[] { 0, 0, 0, 0, 0, 0, 3, 2, 3, 0, 0, 2, 4, 2, 0, 0, 3, 2, 3, 0, 0, 0, 0, 0, 0 }, result.DepressionDepth);
    }
    [Fact]
    public void SlopeAndFlatTiesMatchHandCalculatedReceiversAndArea()
    {
        // Only the middle cell is interior. Minimum perimeter is cell0; diagonal is D8.
        float[] heights = [0, 1, 2, 1, 2, 3, 2, 3, 4];
        var a = HydrologyAnalyzer.Analyze(heights, Land(9), 3, 3);
        Assert.Equal(new[] { -1, -1, -1, -1, 0, -1, -1, -1, -1 }, a.ReceiverIndex);
        Assert.Equal(new uint[] { 2, 1, 1, 1, 1, 1, 1, 1, 1 }, a.FlowAccumulation);
        Assert.All(a.DepressionDepth, x => Assert.Equal(0, x));
        var flat = HydrologyAnalyzer.Analyze(new float[9], Land(9), 3, 3);
        Assert.Equal(a.ReceiverIndex, flat.ReceiverIndex);
        Assert.Equal(a.FlowAccumulation, flat.FlowAccumulation);
        Assert.Equal("d8-priority-flood-v1", a.AlgorithmVersion);
    }
    [Fact]
    public void DepressionUsesSpillSurfaceWithoutFillingTerrain()
    {
        float[] heights = [5, 5, 5, 5, 0, 5, 5, 5, 5]; var copy = heights.ToArray(); var biomes = Land(9); var before = biomes.ToArray();
        var a = HydrologyAnalyzer.Analyze(heights, biomes, 3, 3);
        Assert.Equal(0, a.ReceiverIndex[4]); Assert.Equal(5, a.DepressionDepth[4]);
        Assert.Equal(copy, heights); Assert.Equal(before, biomes);
        Assert.All(a.DepressionDepth.Where((_, i) => i != 4), x => Assert.Equal(0, x));
    }
    [Fact]
    public void OceanContributesZeroAndIsAlwaysTerminalIncludingInteriorIslands()
    {
        var biomes = Enumerable.Repeat(LandscapeBiome.Ocean, 25).ToArray(); biomes[12] = LandscapeBiome.Grassland;
        var a = HydrologyAnalyzer.Analyze(new float[25], biomes, 5, 5);
        Assert.Equal(6, a.ReceiverIndex[12]); Assert.Equal(1u, a.FlowAccumulation[6]); Assert.Equal(1u, a.FlowAccumulation[12]);
        Assert.All(a.ReceiverIndex.Where((_, i) => i != 12), x => Assert.Equal(-1, x));
        Assert.Equal(1u, a.FlowAccumulation.Where((_, i) => a.ReceiverIndex[i] == -1).Aggregate(0u, (x, y) => x + y));
        var ocean = HydrologyAnalyzer.Analyze(new float[25], Enumerable.Repeat(LandscapeBiome.Ocean, 25).ToArray(), 5, 5);
        Assert.All(ocean.FlowAccumulation, x => Assert.Equal(0u, x)); Assert.All(ocean.ReceiverIndex, x => Assert.Equal(-1, x));
    }
    [Theory]
    [InlineData(2, 2)]
    [InlineData(2, 512)]
    [InlineData(17, 9)]
    [InlineData(512, 512)]
    public void RectangularNoOceanMapsTerminateConserveMassAndOwnIndependentArrays(int width, int height)
    {
        var n = width * height; var heights = Enumerable.Range(0, n).Select(i => (float)((i * 37L) % 113)).ToArray(); var before = heights.ToArray();
        var a = HydrologyAnalyzer.Analyze(heights, Land(n), width, height); var b = HydrologyAnalyzer.Analyze(heights, Land(n), width, height);
        Assert.Equal(a.ReceiverIndex, b.ReceiverIndex); Assert.Equal(a.FlowAccumulation, b.FlowAccumulation); Assert.Equal(a.DepressionDepth, b.DepressionDepth); Assert.NotSame(a.ReceiverIndex, b.ReceiverIndex); Assert.Equal(before, heights);
        // Kahn verification is O(N), not one full path traversal per cell.
        var incoming = new int[n]; var expected = Enumerable.Repeat(1u, n).ToArray();
        for (var i = 0; i < n; i++)
        {
            var x = i % width; var y = i / width; var r = a.ReceiverIndex[i]; var terminal = x == 0 || x == width - 1 || y == 0 || y == height - 1;
            Assert.Equal(terminal, r == -1); Assert.True(float.IsFinite(a.DepressionDepth[i])); Assert.InRange(a.DepressionDepth[i], 0, 112);
            if (r < 0) continue; Assert.InRange(Math.Abs(r % width - x), 0, 1); Assert.InRange(Math.Abs(r / width - y), 0, 1); Assert.NotEqual(i, r); incoming[r]++;
        }
        var queue = new Queue<int>(Enumerable.Range(0, n).Where(i => incoming[i] == 0)); var visited = 0; ulong mass = 0;
        while (queue.TryDequeue(out var i))
        {
            visited++; Assert.Equal(expected[i], a.FlowAccumulation[i]); var r = a.ReceiverIndex[i];
            if (r < 0) { mass += a.FlowAccumulation[i]; continue; }
            expected[r] += expected[i]; if (--incoming[r] == 0) queue.Enqueue(r);
        }
        Assert.Equal(n, visited); Assert.Equal((ulong)n, mass);
    }
    [Fact]
    public void RejectsInvalidInternalInputsBeforeAnalysis()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => HydrologyAnalyzer.Analyze([], [], 1, 3));
        Assert.Throws<ArgumentException>(() => HydrologyAnalyzer.Analyze([], [], 2, 2));
        foreach (var value in new[] { float.NaN, float.PositiveInfinity, -1, 1001 }) Assert.Throws<ArgumentException>(() => HydrologyAnalyzer.Analyze([0, 0, 0, value], Land(4), 2, 2));
    }
    [Fact]
    public void GeneratedMapsIncludeIndependentAnalysisAndPreserveHydraulicSummary()
    {
        var request = new TerrainRequest(new(42, 17, 9, .03, 4, 30, HeightMapLimits.SupportedAlgorithmVersion), .55, 2, 0, .05, .1, .45, .3, .65, .16, .6, 1, 1, TerrainLimits.AlgorithmVersion);
        var a = TerrainGenerator.Generate(request); var b = TerrainGenerator.Generate(request);
        Assert.Equal(a.HeightMap.Values, b.HeightMap.Values); Assert.Equal(a.Simulation, b.Simulation);
        Assert.Equal(a.HeightMap.Hydrology.ReceiverIndex, b.HeightMap.Hydrology.ReceiverIndex);
        Assert.Equal(a.HeightMap.Hydrology.FlowAccumulation, b.HeightMap.Hydrology.FlowAccumulation);
        Assert.NotSame(a.HeightMap.Hydrology.ReceiverIndex, b.HeightMap.Hydrology.ReceiverIndex);
    }
}
