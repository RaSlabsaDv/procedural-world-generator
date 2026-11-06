using Xunit;

namespace WorldGenerator.Core.Tests;

public sealed class LandscapeTests
{
    [Fact]
    public void CompositionMatchesIndependentV2PythonLiteralFixture()
    {
        var r = TerrainTests.Request(0);
        r = r with { HeightMap = r.HeightMap with { Width = 3, Height = 2 } };
        float[] expected = [7.333649158477783f, 10.959811210632324f, 12.825599670410156f,
            9.615120887756348f, 15.322843551635742f, 11.879010200500488f];
        Assert.Equal(expected, TerrainGenerator.Generate(r).HeightMap.Values);
    }

    [Fact]
    public void ControlledWeightsSeparateLandformsAndRemainContinuous()
    {
        Assert.Equal((1d, 0d, 0d), TerrainComposer.Weights(.1, .45, .3));
        Assert.Equal((0d, 1d, 0d), TerrainComposer.Weights(.6, .45, .3));
        Assert.Equal((0d, 0d, 1d), TerrainComposer.Weights(.95, .45, .3));
        Assert.Equal((1d, 0d, 0d), TerrainComposer.Weights(.99, 1, 0));
        Assert.Equal((0d, 0d, 1d), TerrainComposer.Weights(.01, 0, 1));
        Assert.Equal((0d, 1d, 0d), TerrainComposer.Weights(.5, 0, 0));
        for (var i = 0; i <= 1000; i++)
        {
            var n = i / 1000d;
            var a = TerrainComposer.Weights(n, .45, .3);
            var b = TerrainComposer.Weights(n + 1e-8, .45, .3);
            Assert.InRange(Math.Abs(a.Plains + a.Hills + a.Mountains - 1), 0, 1e-12);
            Assert.InRange(Math.Abs(a.Plains - b.Plains) + Math.Abs(a.Mountains - b.Mountains), 0, 1e-6);
            Assert.True(TerrainComposer.Weights(n, .55, .3).Plains >= a.Plains);
            Assert.True(TerrainComposer.Weights(n, .45, .4).Mountains >= a.Mountains);
        }
    }

    [Fact]
    public void PlainsHaveSmallNaturalVariationAndMountainsUseTheirOwnStrength()
    {
        var p0 = TerrainComposer.Blend(.2, 0, 0, 0, 1, 0, 0, 1);
        var p1 = TerrainComposer.Blend(.2, 1, 1, 1, 1, 0, 0, 1);
        Assert.InRange(p1 - p0, .029999, .030001);
        Assert.Equal(p1, TerrainComposer.Blend(.2, 1, 1, 1, 1, 0, 0, 0));
        var weak = TerrainComposer.Blend(.2, .5, .5, 1, 0, 0, 1, 0);
        var strong = TerrainComposer.Blend(.2, .5, .5, 1, 0, 0, 1, 1);
        Assert.InRange(strong - weak, .619999, .620001);
    }

    [Fact]
    public void OceanRequiresFourConnectedBoundaryAccessIncludingSeaEquality()
    {
        var values = Enumerable.Repeat(10f, 25).ToArray();
        values[0] = 1; values[6] = 1; values[12] = 1;
        var ocean = OceanClassifier.Ocean(values, 5, 5, 1);
        Assert.True(ocean[0]); Assert.False(ocean[6]); Assert.False(ocean[12]);
        values[1] = 1; values[11] = 1;
        ocean = OceanClassifier.Ocean(values, 5, 5, 1);
        Assert.True(ocean[6]); Assert.True(ocean[12]); Assert.False(ocean[24]);
    }

    [Theory]
    [InlineData(true, .9, 0, 0, 9, 0, LandscapeBiome.Ocean)]
    [InlineData(false, .2, .9, .8, .81, .9, LandscapeBiome.Rock)]
    [InlineData(false, .9, .9, .3, 0, .9, LandscapeBiome.Rock)]
    [InlineData(false, .2, .35, .8, 0, .9, LandscapeBiome.DryGrassland)]
    [InlineData(false, .2, .7, .8, .1, .8, LandscapeBiome.Forest)]
    [InlineData(false, .6, .7, .8, .1, .8, LandscapeBiome.Forest)]
    [InlineData(false, .2, .7, .8, .5, .8, LandscapeBiome.Grassland)]
    [InlineData(false, .2, .7, .25, 0, .8, LandscapeBiome.Grassland)]
    [InlineData(false, .2, .7, .8, 0, .42, LandscapeBiome.Grassland)]
    public void BiomesUseEnvironmentAndExplicitPrecedence(bool ocean, double h, double m, double t, double slope, double patch, LandscapeBiome expected) =>
        Assert.Equal(expected, LandscapeBiomeClassifier.Classify(ocean, h, m, t, slope, patch));

    [Fact]
    public void EnvironmentIsFiniteIndependentDeterministicAndSensitiveToMoisture()
    {
        var r = TerrainTests.Request(2) with { HeightMap = TerrainTests.Request().HeightMap with { Width = 33, Height = 17 } };
        var a = TerrainGenerator.Generate(r).HeightMap; var b = TerrainGenerator.Generate(r).HeightMap;
        Assert.Equal(TerrainLimits.ResultVersion, a.ResultVersion);
        Assert.Equal(a.Moisture, b.Moisture); Assert.NotSame(a.Moisture, b.Moisture);
        Assert.Equal(a.Temperature, b.Temperature); Assert.Equal(a.Slope, b.Slope);
        Assert.Equal(a.VegetationDensity, b.VegetationDensity); Assert.Equal(a.Trees, b.Trees);
        Assert.All(a.Moisture, v => Assert.InRange(v, 0, 1)); Assert.All(a.Temperature, v => Assert.InRange(v, 0, 1));
        Assert.All(a.Slope, v => Assert.True(float.IsFinite(v) && v >= 0));
        for (var i=0;i<a.Values.Length;i++) if (a.Biomes[i] != LandscapeBiome.Forest) Assert.Equal(0, a.VegetationDensity[i]);
        var dry = TerrainGenerator.Generate(r with { GlobalMoisture = 0 }).HeightMap;
        Assert.Equal(a.Values, dry.Values); Assert.DoesNotContain(LandscapeBiome.Forest, dry.Biomes); Assert.Empty(dry.Trees);
        Assert.NotEqual(a.Values, TerrainGenerator.Generate(r with { HeightMap = r.HeightMap with { Seed = -99 } }).HeightMap.Values);
    }

    [Fact]
    public void TreesAreBoundedReproducibleAndFollowExactTrianglesAcrossTheMap()
    {
        const int size = 256;
        var heights = Enumerable.Range(0,size*size).Select(i => (float)(.01*(i%size)+.02*(i/size))).ToArray();
        var biomes = Enumerable.Repeat(LandscapeBiome.Forest,heights.Length).ToArray();
        var slopes = Enumerable.Repeat(.03f,heights.Length).ToArray();
        var density = Enumerable.Repeat(1f,heights.Length).ToArray();
        var trees = VegetationGenerator.PlaceTrees(heights,biomes,slopes,density,size,size,42);
        Assert.Equal(TerrainLimits.MaxTrees, trees.Length);
        Assert.Equal(trees, VegetationGenerator.PlaceTrees(heights,biomes,slopes,density,size,size,42));
        Assert.Equal(trees.Select(t => t.CellIndex).Order(), trees.Select(t => t.CellIndex));
        Assert.Equal(trees.Length, trees.Select(t => t.CellIndex).Distinct().Count());
        Assert.Contains(trees,t => t.CellIndex > heights.Length*3/4);
        foreach (var tree in trees)
        {
            Assert.InRange(tree.Scale,.6f,1.4f); Assert.InRange(tree.Rotation,0,(float)(2*Math.PI));
            var i=tree.CellIndex; var x=i%size; var z=i/size;
            Assert.InRange(tree.X,x+.14f,x+.86f); Assert.InRange(tree.Z,z+.14f,z+.86f);
            Assert.Equal(VegetationGenerator.Surface(heights,size,i,tree.X-x,tree.Z-z),tree.Y);
        }
    }

    [Fact]
    public void TreesCannotStraddleWaterSteepOrNonforestCorners()
    {
        float[] heights=[1,1,1,1], slopes=[0,0,0,0], density=[1,1,1,1];
        LandscapeBiome[] biomes=[LandscapeBiome.Forest,LandscapeBiome.Forest,LandscapeBiome.Forest,LandscapeBiome.Ocean];
        Assert.Empty(VegetationGenerator.PlaceTrees(heights,biomes,slopes,density,2,2,42));
        biomes[3]=LandscapeBiome.Forest; slopes[3]=.5f;
        Assert.Empty(VegetationGenerator.PlaceTrees(heights,biomes,slopes,density,2,2,42));
        slopes[3]=0; Array.Clear(density);
        Assert.Empty(VegetationGenerator.PlaceTrees(heights,biomes,slopes,density,2,2,42));
    }

    [Fact]
    public void EnvironmentUsesGridGradientAndStaticSeaWithoutChangingHeights()
    {
        var r=TerrainTests.Request(0) with { HeightMap=TerrainTests.Request().HeightMap with { Width=3,Height=2,HeightMultiplier=10 },SeaLevel=0 };
        float[] heights=[1,2,3,3,4,5]; var copy=heights.ToArray();
        var map=LandscapeEcology.Derive(heights,r);
        Assert.Equal(copy,map.Values); Assert.All(map.Slope,v=>Assert.InRange(Math.Abs(v-Math.Sqrt(5)),0,1e-6));
        Assert.DoesNotContain(LandscapeBiome.Ocean,map.Biomes);
    }

    [Fact]
    public void NewParametersAreCanonicallyValidated()
    {
        var r=TerrainTests.Request();
        foreach(var invalid in new[] { r with { PlainsCoverage=double.NaN }, r with { MountainCoverage=-1 },r with { GlobalMoisture=double.PositiveInfinity },r with { SeaLevel=1.1 },r with { PlainsCoverage=.8,MountainCoverage=.3 } })
        { Assert.False(TerrainValidator.Prepare(invalid).IsValid); Assert.Throws<ArgumentException>(()=>TerrainGenerator.Generate(invalid)); }
    }
}
