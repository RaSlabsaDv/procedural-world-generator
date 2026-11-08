using Xunit;

namespace WorldGenerator.Core.Tests;

public sealed class ClimateV3Tests
{
    private static TerrainRequest Request(int size = 33) => TerrainTests.Request(0) with
    {
        HeightMap = TerrainTests.Request().HeightMap with { Width = size, Height = size, NoiseScale = .03 }
    };

    [Theory]
    [InlineData(true, .9, .7, .1, 2, .8, LandscapeBiome.Ocean)]
    [InlineData(false, .55, .7, .20, 1.2, .8, LandscapeBiome.SnowHighlands)]
    [InlineData(false, .55, .7, .20, 1.20001, .8, LandscapeBiome.Rock)]
    [InlineData(false, .7, .7, .8, 0, .8, LandscapeBiome.BroadleafForest)]
    [InlineData(false, .54, .7, .20, 0, .8, LandscapeBiome.Tundra)]
    [InlineData(false, .2, .7, .28, 0, .8, LandscapeBiome.Tundra)]
    [InlineData(false, .2, .7, .28001, 0, .8, LandscapeBiome.ConiferForest)]
    [InlineData(false, .2, .7, .47999, 0, .8, LandscapeBiome.ConiferForest)]
    [InlineData(false, .2, .7, .48, 0, .8, LandscapeBiome.BroadleafForest)]
    [InlineData(false, .2, .25, .62, 0, .8, LandscapeBiome.Savanna)]
    [InlineData(false, .2, .24999, .62, 0, .8, LandscapeBiome.DryGrassland)]
    [InlineData(false, .2, .52999, .7, 0, .8, LandscapeBiome.Savanna)]
    [InlineData(false, .2, .53, .7, 0, .8, LandscapeBiome.BroadleafForest)]
    [InlineData(false, .2, .4, .61999, 0, .8, LandscapeBiome.Grassland)]
    [InlineData(false, .2, .4, .7, .5, .8, LandscapeBiome.Grassland)]
    [InlineData(false, .2, .7, .7, 0, .42, LandscapeBiome.Grassland)]
    [InlineData(false, .2, .2, .7, .81, .8, LandscapeBiome.Rock)]
    public void HistoricalV3ClassificationRetainsExplicitPrecedenceAndBoundaries(bool ocean, double h, double m, double t, double s, double p, LandscapeBiome expected) =>
        Assert.Equal(expected, Historical.V8.LandscapeBiomeClassifier.Classify(ocean, h, m, t, s, p));

    [Fact]
    public void MatchesIndependentV3CompositionAndClimateLiterals()
    {
        var r = TerrainTests.Request(0) with { HeightMap = TerrainTests.Request().HeightMap with { Width = 3, Height = 2 }, LandformRegionScale = 2, GlobalWarmth = .35 };
        var map = Historical.V5.TerrainGenerator.Generate(r).HeightMap;
        Assert.Equal(new float[] { 10.390124320983887f, 10.959811210632324f, 12.825599670410156f, 9.473161697387695f, 11.630701065063477f, 12.272018432617188f }, map.Values);
        Assert.Equal(new float[] { .8570814728736877f, .7675568461418152f, .6858873963356018f, .8013341426849365f, .7768876552581787f, .609548807144165f }, map.Moisture);
        Assert.Equal(new float[] { .2826651632785797f, .273539274930954f, .2433679699897766f, .30303436517715454f, .2656550705432892f, .2528592348098755f }, map.Temperature);
    }

    [Theory]
    [InlineData(42, 0)]
    [InlineData(-2147483648, 8)]
    [InlineData(2147483647, 32)]
    public void DefaultRegionScalePreservesV2TerrainAndHydraulicResults(int seed, int iterations)
    {
        var r = Request() with { HeightMap = Request().HeightMap with { Seed = seed }, Iterations = iterations };
        var old = new Historical.V2.TerrainRequest(r.HeightMap, r.MountainStrength, r.WarpStrength,
            r.Iterations, r.Rainfall, r.Evaporation, r.PlainsCoverage, r.MountainCoverage,
            r.GlobalMoisture, r.SeaLevel, Historical.V2.TerrainLimits.AlgorithmVersion);
        var current = Historical.V5.TerrainGenerator.Generate(r);
        var previous = Historical.V2.TerrainGenerator.Generate(old);
        Assert.Equal(previous.HeightMap.Values, current.HeightMap.Values);
        Assert.Equal(previous.Simulation, current.Simulation);
    }

    [Fact]
    public void RegionScaleChangesOnlyRegionalMasksNotFineSampling()
    {
        var r = Request();
        Assert.Equal(TerrainComposer.Region(1.25, 2.5, 42, 1), TerrainComposer.Region(2.5, 5, 42, 2));
        Assert.NotEqual(TerrainComposer.Region(1.25, 2.5, 42, .25), TerrainComposer.Region(1.25, 2.5, 42, 4));
        var plains = r with { PlainsCoverage = 1, MountainCoverage = 0 };
        Assert.Equal(TerrainGenerator.Generate(plains with { LandformRegionScale = .25 }).HeightMap.Values, TerrainGenerator.Generate(plains with { LandformRegionScale = 4 }).HeightMap.Values);
        Assert.NotEqual(TerrainGenerator.Generate(r with { LandformRegionScale = .25 }).HeightMap.Values, TerrainGenerator.Generate(r with { LandformRegionScale = 4 }).HeightMap.Values);
    }

    [Fact]
    public void ClimateControlsDoNotAlterTerrainAndWarmColdForestsDiffer()
    {
        var r = Request(128) with { GlobalMoisture = .8 };
        var heights = Enumerable.Repeat(6f, 128 * 128).ToArray();
        var cool = LandscapeEcology.Derive(heights, r with { GlobalWarmth = .35 });
        var warm = LandscapeEcology.Derive(heights, r with { GlobalWarmth = .8 });
        Assert.Contains(LandscapeBiome.ConiferForest, cool.Biomes);
        Assert.Contains(LandscapeBiome.BroadleafForest, warm.Biomes);
        Assert.DoesNotContain(LandscapeBiome.ConiferForest, warm.Biomes);
        Assert.All(cool.Trees, t => Assert.Equal(LandscapeBiomeClassifier.Kind(cool.Biomes[t.CellIndex]), t.Kind));
        var zero = TerrainGenerator.Generate(r with { VegetationDensity = 0 });
        var full = TerrainGenerator.Generate(r with { VegetationDensity = 1 });
        Assert.Equal(zero.HeightMap.Values, full.HeightMap.Values); Assert.Equal(zero.HeightMap.Biomes, full.HeightMap.Biomes);
        Assert.Equal(zero.Simulation, full.Simulation); Assert.Empty(zero.HeightMap.Trees);
        Assert.All(zero.HeightMap.VegetationDensity, d => Assert.Equal(0, d));
        Assert.Equal(full.HeightMap.Values, TerrainGenerator.Generate(r with { GlobalWarmth = .1 }).HeightMap.Values);
    }

    [Theory]
    [InlineData(LandscapeBiome.BroadleafForest, TreeKind.Broadleaf)]
    [InlineData(LandscapeBiome.ConiferForest, TreeKind.Conifer)]
    [InlineData(LandscapeBiome.Savanna, TreeKind.Savanna)]
    public void CategoriesAndPlacementAreCoreOwned(LandscapeBiome biome, TreeKind kind)
    {
        const int n = 33; var heights = Enumerable.Repeat(2f, n * n).ToArray();
        var biomes = Enumerable.Repeat(biome, n * n).ToArray(); var slopes = new float[n * n]; var density = Enumerable.Repeat(.8f, n * n).ToArray();
        var trees = VegetationGenerator.PlaceTrees(heights, biomes, slopes, density, n, n, 42);
        Assert.NotEmpty(trees); Assert.All(trees, t => { Assert.Equal(kind, t.Kind); Assert.Equal(2, t.Y); });
        Assert.Equal(trees, VegetationGenerator.PlaceTrees(heights, biomes, slopes, density, n, n, 42));
        LandscapeBiome[] mixed = [LandscapeBiome.BroadleafForest, LandscapeBiome.ConiferForest, LandscapeBiome.Savanna, LandscapeBiome.Ocean];
        Assert.Empty(VegetationGenerator.PlaceTrees([1, 1, 1, 1], mixed, [0, 0, 0, 0], [1, 1, 1, 1], 2, 2, 42));
    }

    [Fact]
    public void DensityIsMonotonicBelowCapAndStableForRetainedCappedCandidates()
    {
        Check(64, .2f, 1f, false); Check(256, .6f, 1f, true);
        static void Check(int n, float low, float high, bool capped)
        {
            var heights = Enumerable.Repeat(2f, n * n).ToArray(); var biomes = Enumerable.Repeat(LandscapeBiome.BroadleafForest, n * n).ToArray(); var slopes = new float[n * n];
            var a = VegetationGenerator.PlaceTrees(heights, biomes, slopes, Enumerable.Repeat(low, n * n).ToArray(), n, n, 42);
            var b = VegetationGenerator.PlaceTrees(heights, biomes, slopes, Enumerable.Repeat(high, n * n).ToArray(), n, n, 42);
            var dict = b.ToDictionary(t => t.CellIndex);
            if (capped) { Assert.Equal(TerrainLimits.MaxTrees, a.Length); Assert.Equal(TerrainLimits.MaxTrees, b.Length); }
            else { Assert.True(a.Length < b.Length); Assert.All(a, t => Assert.True(dict.ContainsKey(t.CellIndex))); }
            foreach (var tree in a) if (dict.TryGetValue(tree.CellIndex, out var retained)) Assert.Equal(tree, retained);
        }
    }

    [Fact]
    public void SavannaIsSparseAndDensityCannotPopulateUnsuitableBiomes()
    {
        var forest = LandscapeBiomeClassifier.Density(LandscapeBiome.BroadleafForest, .53f, 0, .8, 1);
        var savanna = LandscapeBiomeClassifier.Density(LandscapeBiome.Savanna, .52f, 0, .8, 1);
        Assert.True(savanna < forest); Assert.InRange(savanna, 0, .12f);
        foreach (var biome in new[] { LandscapeBiome.Ocean, LandscapeBiome.Rock, LandscapeBiome.Tundra, LandscapeBiome.SnowHighlands, LandscapeBiome.Grassland, LandscapeBiome.DryGrassland })
            Assert.Equal(0, LandscapeBiomeClassifier.Density(biome, 1, 0, 1, 1));
    }

    [Fact]
    public void NewRangesAreCanonicalAndDirectCallsRejectInvalids()
    {
        var r = Request();
        foreach (var bad in new[] { r with { GlobalWarmth = double.NaN }, r with { GlobalWarmth = 1.01 }, r with { VegetationDensity = -.1 }, r with { VegetationDensity = double.PositiveInfinity }, r with { LandformRegionScale = .249 }, r with { LandformRegionScale = 4.01 } })
        { Assert.False(TerrainValidator.Prepare(bad).IsValid); Assert.Throws<ArgumentException>(() => TerrainGenerator.Generate(bad)); }
        Assert.True(TerrainValidator.Prepare(r with { GlobalWarmth = 0, VegetationDensity = 0, LandformRegionScale = .25 }).IsValid);
        Assert.True(TerrainValidator.Prepare(r with { GlobalWarmth = 1, VegetationDensity = 1, LandformRegionScale = 4 }).IsValid);
    }
}
