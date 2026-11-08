using Xunit;

namespace WorldGenerator.Core.Tests;

public sealed class VegetationStructureTests
{
    [Theory]
    [InlineData(0, 0, 42, .4125291226288518, .7997258372598358, TreeVariant.Small)]
    [InlineData(17, 23, 42, .5822339152386616, .8575797438313619, TreeVariant.Mature)]
    [InlineData(64, 91, int.MinValue, .9285263918963934, .9756339972374068, TreeVariant.Small)]
    [InlineData(127, 3, int.MaxValue, 1, 1, TreeVariant.Small)]
    public void MatchesIndependentStructureAndVariantLiterals(int x, int y, int seed, double forest, double savanna, TreeVariant variant)
    {
        Assert.Equal(forest, VegetationStructure.Mask(x, y, unchecked((uint)seed), .03, false), 13);
        Assert.Equal(savanna, VegetationStructure.Mask(x, y, unchecked((uint)seed), .03, true), 13);
        Assert.Equal(variant, VegetationGenerator.Variant(x, y, unchecked((uint)seed)));
    }

    [Fact]
    public void FourConnectedEdgesRespectOutsideKindsSlopesAndRectangles()
    {
        const int n = 7; var biomes = Enumerable.Repeat(LandscapeBiome.BroadleafForest, n * n).ToArray(); var slopes = new float[n * n];
        var distance = VegetationStructure.EdgeDistances(biomes, slopes, n, n);
        Assert.Equal(1, distance[0]); Assert.Equal(2, distance[1 * n + 1]); Assert.Equal(3, distance[2 * n + 2]); Assert.Equal(4, distance[3 * n + 3]);
        for (var y = 0; y < n; y++) for (var x = 4; x < n; x++) biomes[y * n + x] = LandscapeBiome.ConiferForest;
        distance = VegetationStructure.EdgeDistances(biomes, slopes, n, n);
        Assert.Equal(1, distance[3 * n + 3]); Assert.Equal(1, distance[3 * n + 4]); Assert.Equal(2, distance[3 * n + 2]);
        slopes[3 * n + 2] = .5f; biomes[3 * n + 1] = LandscapeBiome.Ocean;
        distance = VegetationStructure.EdgeDistances(biomes, slopes, n, n);
        Assert.Equal(0, distance[3 * n + 2]); Assert.Equal(0, distance[3 * n + 1]); Assert.Equal(1, distance[2 * n + 2]);
        var rectangle = VegetationStructure.EdgeDistances(Enumerable.Repeat(LandscapeBiome.Savanna, 24).ToArray(), new float[24], 6, 4);
        Assert.Equal(new[] { 1, 2, 2, 2, 2, 1 }, rectangle.Skip(6).Take(6));
    }

    [Fact]
    public void DensityHasSpatialStructureZeroEdgesAndMonotonicCandidateTransforms()
    {
        const int n = 128; var biomes = Enumerable.Repeat(LandscapeBiome.BroadleafForest, n * n).ToArray(); var slopes = new float[n * n]; var heights = Enumerable.Repeat(2f, n * n).ToArray();
        var request = TerrainTests.Request(0) with { HeightMap = TerrainTests.Request().HeightMap with { Width = n, Height = n, NoiseScale = .03 } };
        var full = Density(1); var low = Density(.2); var zero = Density(0);
        Assert.All(full, v => Assert.InRange(v, 0, 1)); Assert.All(zero, v => Assert.Equal(0, v));
        Assert.Equal(0, full[0]); Assert.True(full.Max() - full.Min() > .3);
        var a = VegetationGenerator.PlaceTrees(heights, biomes, slopes, low, n, n, 42);
        var b = VegetationGenerator.PlaceTrees(heights, biomes, slopes, full, n, n, 42);
        Assert.NotEmpty(a); Assert.True(a.Length < b.Length); Assert.True(b.Length < TerrainLimits.MaxTrees);
        var dict = b.ToDictionary(t => t.CellIndex); Assert.All(a, t => Assert.Equal(t, dict[t.CellIndex]));
        Assert.Contains(b, t => t.Variant == TreeVariant.Small); Assert.Contains(b, t => t.Variant == TreeVariant.Mature);
        var fraction = (double)b.Count(t => t.Variant == TreeVariant.Small) / b.Length; Assert.InRange(fraction, .32, .48);
        Assert.All(b, t => Assert.Equal(2, t.Y));
        float[] Density(double multiplier) { var values = Enumerable.Repeat(1f, n * n).ToArray(); VegetationStructure.Apply(values, biomes, slopes, request with { VegetationDensity = multiplier }); return values; }
    }

    [Fact]
    public void SparseSavannaAndUnsuitableGroundCannotBecomeDenseForest()
    {
        const int n = 33; var biomes = Enumerable.Repeat(LandscapeBiome.Savanna, n * n).ToArray(); var slopes = new float[n * n]; var density = Enumerable.Repeat(.12f, n * n).ToArray();
        biomes[16 * n + 16] = LandscapeBiome.Grassland;
        var request = TerrainTests.Request(0) with { HeightMap = TerrainTests.Request().HeightMap with { Width = n, Height = n, NoiseScale = .03 } };
        VegetationStructure.Apply(density, biomes, slopes, request);
        Assert.All(density, v => Assert.InRange(v, 0, .12f)); Assert.Equal(0, density[16 * n + 16]);
        Assert.InRange(VegetationStructure.Mask(17, 23, 42, .03, true), .455, 1);
    }

    [Fact]
    public void EdgePassAllocationIsBoundedByTwoIntegerBuffers()
    {
        const int n = 256; var biomes = Enumerable.Repeat(LandscapeBiome.BroadleafForest, n * n).ToArray(); var slopes = new float[n * n];
        // Warm the measured branch/size before reading thread allocation counters.
        VegetationStructure.EdgeDistances(biomes, slopes, n, n);
        var start = GC.GetAllocatedBytesForCurrentThread();
        var distance = VegetationStructure.EdgeDistances(biomes, slopes, n, n);
        var allocated = GC.GetAllocatedBytesForCurrentThread() - start;
        Assert.Equal(n * n, distance.Length); Assert.InRange(allocated, n * n * 8, n * n * 8 + 4096);
    }

    [Fact]
    public void RealMaximumWetPlainsRequestReachesCap()
    {
        var r = TerrainTests.Request(0) with { HeightMap = TerrainTests.Request().HeightMap with { Width = 512, Height = 512, NoiseScale = .03, HeightMultiplier = 80, Seed = -7 }, PlainsCoverage = 1, MountainCoverage = 0, GlobalMoisture = 1, SeaLevel = 0, GlobalWarmth = .6, LandformRegionScale = 4 };
        var trees = TerrainGenerator.Generate(r).HeightMap.Trees;
        Assert.Equal(TerrainLimits.MaxTrees, trees.Length);
        Assert.Contains(trees, t => t.Variant == TreeVariant.Small); Assert.Contains(trees, t => t.Variant == TreeVariant.Mature);
    }

    [Fact]
    public void CappedSelectionReachesAllQuadrantsWithStableRetainedVariants()
    {
        const int n = 256; var biomes = Enumerable.Repeat(LandscapeBiome.ConiferForest, n * n).ToArray(); var slopes = new float[n * n]; var heights = new float[n * n];
        var a = VegetationGenerator.PlaceTrees(heights, biomes, slopes, Enumerable.Repeat(.6f, n * n).ToArray(), n, n, 42);
        var b = VegetationGenerator.PlaceTrees(heights, biomes, slopes, Enumerable.Repeat(1f, n * n).ToArray(), n, n, 42);
        Assert.Equal(TerrainLimits.MaxTrees, a.Length); Assert.Equal(TerrainLimits.MaxTrees, b.Length);
        var dict = b.ToDictionary(t => t.CellIndex); foreach (var tree in a) if (dict.TryGetValue(tree.CellIndex, out var kept)) Assert.Equal(tree, kept);
        foreach (var x in new[] { 0, 1 }) foreach (var y in new[] { 0, 1 }) Assert.InRange(b.Count(t => (t.CellIndex % n >= n / 2 ? 1 : 0) == x && (t.CellIndex / n >= n / 2 ? 1 : 0) == y), 3000, 5000);
        Assert.Equal(b.Select(t => t.CellIndex).Order(), b.Select(t => t.CellIndex)); Assert.Equal(b.Length, b.Select(t => t.CellIndex).Distinct().Count());
    }
}
