using System.Security.Cryptography;
using System.Text.Json;
using Xunit;

namespace WorldGenerator.Core.Tests;

public sealed class ChannelTests
{
    private static TerrainRequest Request(int width = 129, int height = 97, int seed = 42, double bound = 30) =>
        TerrainTests.Request(0) with { HeightMap = TerrainTests.Request().HeightMap with { Width = width, Height = height, Seed = seed, HeightMultiplier = bound, NoiseScale = .03, Octaves = 4 } };

    [Fact]
    public void FrozenPreChannelPipelineMatchesCapturedApiIncludingWaterAndSimulation()
    {
        using var fixture = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "landscape-v13-fingerprints.json")));
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        foreach (var item in fixture.RootElement.GetProperty("cases").EnumerateArray())
        {
            var request = item.GetProperty("request").Deserialize<TerrainRequest>(options)!;
            var result = Historical.V13.TerrainGenerator.Generate(request);
            Assert.Equal(item.GetProperty("resultSha256").GetString(), Hash(result.HeightMap));
            Assert.Equal(item.GetProperty("simulationSha256").GetString(), Hash(result.Simulation));
        }
        string Hash(object x) => Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(x, options))).ToLowerInvariant();
    }

    [Theory]
    [InlineData(129, 97, 42, 30)]
    [InlineData(129, 97, -7, 30)]
    [InlineData(2, 2, int.MinValue, 0)]
    [InlineData(2, 512, int.MaxValue, 1000)]
    [InlineData(512, 512, -7, 80)]
    public void CompletePipelineRespectsProtectionMassBoundsAndFinalMetadata(int width, int height, int seed, double bound)
    {
        var request = Request(width, height, seed, bound);
        var old = Historical.V13.TerrainGenerator.Generate(request);
        var result = TerrainGenerator.Generate(request); var map = result.HeightMap; var c = map.Channels;
        Assert.Equal(old.Simulation, result.Simulation);
        double before = 0, after = 0, removed = 0;
        var cap = Math.Min(1.5, .03 * bound);
        for (var i = 0; i < map.Values.Length; i++)
        {
            var original = old.HeightMap.Values[i]; var actual = map.Values[i];
            before += original; after += actual; removed += (double)original - actual;
            Assert.True(float.IsFinite(actual)); Assert.InRange(actual, 0, original);
            Assert.InRange((double)original - actual, 0, cap + 1e-12);
            Assert.Equal(original - actual, c.CarveDepth[i]);
            if (c.CarveDepth[i] == 0) Assert.Equal(BitConverter.SingleToInt32Bits(original), BitConverter.SingleToInt32Bits(actual));
            var x = i % width; var y = i / width;
            var protectedCell = x == 0 || x == width - 1 || y == 0 || y == height - 1;
            for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++)
            {
                var nx = x + dx; var ny = y + dy;
                if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
                var j = ny * width + nx;
                protectedCell |= old.HeightMap.Biomes[j] == LandscapeBiome.Ocean || old.HeightMap.Lakes.LakeIdByCell[j] >= 0;
            }
            if (protectedCell) Assert.Equal(original, actual);
            Assert.Equal(old.HeightMap.Biomes[i] == LandscapeBiome.Ocean, map.Biomes[i] == LandscapeBiome.Ocean);
        }
        Assert.Equal(before, c.Summary.BeforeTerrainMass); Assert.Equal(after, c.Summary.AfterTerrainMass); Assert.Equal(removed, c.Summary.RemovedTerrainMass);
        Assert.InRange(Math.Abs(before - after - removed), 0, 1e-9 * Math.Max(1, before));
        var derived = LandscapeEcology.Derive(map.Values, request);
        Assert.Equal(derived.Slope, map.Slope); Assert.Equal(derived.Trees, map.Trees); Assert.Equal(derived.Rocks, map.Rocks);
        Assert.Equal(derived.Hydrology.ReceiverIndex, map.Hydrology.ReceiverIndex);
        Assert.Equal(derived.Rivers.CellIndices, map.Rivers.CellIndices); Assert.Equal(derived.Lakes.LakeIdByCell, map.Lakes.LakeIdByCell);
        Assert.Equal(map.Rivers.CellIndices.Length, c.WaterSurfaceHeight.Length); Assert.Equal(c.WaterSurfaceHeight.Length, c.SegmentState.Length);
        if (width == 129) Assert.True(removed > 0);
        if (width == 129 && seed == 42)
            Assert.False(old.HeightMap.Hydrology.ReceiverIndex.SequenceEqual(map.Hydrology.ReceiverIndex));
        foreach (var water in c.WaterSurfaceHeight) Assert.True(float.IsFinite(water));
    }

    [Fact]
    public void MaximumShapingAndProfileAllocationsRespectNumericBounds()
    {
        var request = Request(512, 512, -7, 80);
        var values = Historical.V13.TerrainGenerator.Generate(request).HeightMap.Values;
        var pre = TerrainDrainage.Derive(values, request);
        var before = GC.GetAllocatedBytesForCurrentThread();
        var carved = ChannelCarver.Apply(values, request, pre);
        var bytes = GC.GetAllocatedBytesForCurrentThread() - before;
        Assert.True(bytes < 21L * values.Length + 65536, $"Shaping allocated {bytes}");
        var final = TerrainDrainage.Derive(values, request);
        before = GC.GetAllocatedBytesForCurrentThread();
        var profile = ChannelProfiler.Derive(values, request, final, carved);
        bytes = GC.GetAllocatedBytesForCurrentThread() - before;
        Assert.True(bytes < 8L * values.Length + 8L * final.Rivers.CellIndices.Length + 65536, $"Profile allocated {bytes}");
        Assert.Equal(final.Rivers.CellIndices.Length, profile.SegmentState.Length);
    }

    private static DrainageAnalysis Graph(int n, int[] indices, int[] receiver, int[] order, LakeMapResult? lakes = null)
    {
        var lake = lakes ?? new(Enumerable.Repeat(-1, n).ToArray(), [], [], [], LakeBasinAnalyzer.AlgorithmVersion);
        return new(new bool[n], new(receiver, new uint[n], new float[n], HydrologyAnalyzer.AlgorithmVersion),
            new(indices, Enumerable.Repeat(2f, indices.Length).ToArray(), RiverNetworkExtractor.AlgorithmVersion), lake, order);
    }

    [Fact]
    public void OverlappingProposalsTakeMaximumAndProtectedRingIsUnchanged()
    {
        var request = Request(10, 10); var values = Enumerable.Repeat(5f, 100).ToArray();
        var receiver = Enumerable.Repeat(-1, 100).ToArray(); receiver[44] = 45;
        var graph = Graph(100, [44, 45], receiver, [45, 44]); graph.Hydrology.FlowAccumulation[44] = graph.Hydrology.FlowAccumulation[45] = 32;
        var c = ChannelCarver.Apply(values, request, graph);
        Assert.Equal(4.91f, values[44]); Assert.Equal(4.91f, values[45]); // .003*30, not twice that depth
        Assert.True(c.Summary.RemovedTerrainMass > 0);
        values = Enumerable.Repeat(5f, 100).ToArray(); graph.Ocean[44] = true;
        ChannelCarver.Apply(values, request, graph); Assert.All(values, value => Assert.Equal(5, value));
    }

    [Fact]
    public void ProfilesShareConfluenceHeightsAllowFlatsAndRejectBarriers()
    {
        var request = Request(10, 10); var bed = Enumerable.Repeat(3f, 100).ToArray();
        var receiver = Enumerable.Repeat(-1, 100).ToArray(); receiver[44] = receiver[46] = 55;
        var graph = Graph(100, [44, 46, 55], receiver, [55, 44, 46]);
        var profile = ChannelProfiler.Derive(bed, request, graph, ChannelCarver.Identity(bed));
        Assert.Equal(new[] { RiverChannelState.Exposed, RiverChannelState.Exposed, RiverChannelState.Boundary }, profile.SegmentState);
        Assert.All(profile.WaterSurfaceHeight, value => Assert.Equal(3, value));
        bed[44] = 2; profile = ChannelProfiler.Derive(bed, request, graph, ChannelCarver.Identity(bed));
        Assert.Equal(RiverChannelState.Unsupported, profile.SegmentState[0]); Assert.Equal(2, profile.WaterSurfaceHeight[0]);
    }

    [Fact]
    public void LakePinsSubmergedReachesAndOceanEndpointsAreAuthoritative()
    {
        var request = Request(10, 10) with { SeaLevel = 3.2 / 30 };
        var bed = Enumerable.Repeat(3.2f, 100).ToArray(); bed[44] = 3.4f; bed[55] = bed[56] = 2.5f; bed[58] = 1;
        var receiver = Enumerable.Repeat(-1, 100).ToArray(); receiver[44] = 55; receiver[55] = 56; receiver[56] = 57; receiver[57] = 58;
        var ids = Enumerable.Repeat(-1, 100).ToArray(); ids[55] = ids[56] = 0;
        var lake = new LakeMapResult(ids, [new(0, 3.2f, 2, 56, 57)], [56], [44, 56], LakeBasinAnalyzer.AlgorithmVersion);
        var graph = Graph(100, [44, 55, 56, 57], receiver, [58, 57, 56, 55, 44], lake); graph.Ocean[58] = true;
        var p = ChannelProfiler.Derive(bed, request, graph, ChannelCarver.Identity(bed));
        Assert.Equal(new[] { RiverChannelState.Exposed, RiverChannelState.Submerged, RiverChannelState.Exposed, RiverChannelState.Exposed }, p.SegmentState);
        Assert.Equal(new[] { 3.4f, 3.2f, 3.2f, 3.2f }, p.WaterSurfaceHeight);
    }

    [Fact]
    public void ShallowCutCanSupportWaterWhileLargeBarrierAndCliffRemainUnsupported()
    {
        var request = Request(10, 10); var bed = Enumerable.Repeat(3f, 100).ToArray(); bed[44] = 2.9f;
        var receiver = Enumerable.Repeat(-1, 100).ToArray(); receiver[44] = 45;
        var graph = Graph(100, [44, 45], receiver, [45, 44]); var depth = new float[100]; depth[44] = .3f;
        var p = ChannelProfiler.Derive(bed, request, graph, new(depth, new(0, 0, 0)));
        Assert.Equal(RiverChannelState.Exposed, p.SegmentState[0]); Assert.True(p.WaterSurfaceHeight[0] >= p.WaterSurfaceHeight[1]);
        bed[45] = 5; p = ChannelProfiler.Derive(bed, request, graph, new(depth, new(0, 0, 0)));
        Assert.Equal(RiverChannelState.Unsupported, p.SegmentState[0]);
        bed[44] = 5; bed[45] = 1; p = ChannelProfiler.Derive(bed, request, graph, ChannelCarver.Identity(bed));
        Assert.Equal(RiverChannelState.Unsupported, p.SegmentState[0]);
    }

    [Theory]
    [InlineData(42)]
    [InlineData(-7)]
    [InlineData(int.MinValue)]
    [InlineData(int.MaxValue)]
    public void ChannelsPreserveBroadPlainsAndOwnIndependentStorage(int seed)
    {
        var request = Request(seed: seed) with { PlainsCoverage = 1, MountainCoverage = 0 };
        var a = TerrainGenerator.Generate(request).HeightMap; var b = TerrainGenerator.Generate(request).HeightMap;
        Assert.True(a.Slope.Count(x => x <= .1) / (double)a.Slope.Length >= .85);
        Assert.Equal(a.Values, b.Values); Assert.Equal(a.Channels.CarveDepth, b.Channels.CarveDepth);
        Assert.Equal(a.Channels.WaterSurfaceHeight, b.Channels.WaterSurfaceHeight); Assert.Equal(a.Channels.SegmentState, b.Channels.SegmentState);
        Assert.NotSame(a.Channels.CarveDepth, b.Channels.CarveDepth);
    }
}
