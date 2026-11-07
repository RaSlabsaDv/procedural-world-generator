using Xunit;

namespace WorldGenerator.Core.Tests;

public sealed class SurfaceCoverageTests
{
    [Fact]
    public void PreservesFrozenV3V4TerrainAndHistoricalVegetationFixtures() => Historical.V3.FrozenLandscape.Verify();

    [Fact]
    public void MatchesIndependentLiteralReference()
    {
        var weights = new float[5];
        SurfaceCoverage.Write(weights, false, .55, .44f, .24f, .75f);
        Assert.Equal(new float[] { .04049999266862869f, .3344999849796295f, 0, .3749999701976776f, .2500000298023224f }, weights);
        SurfaceCoverage.Write(weights, false, .7, .65f, .1f, 1.2f);
        Assert.Equal(new float[] { 0, 0, 0, .5000001788139343f, .4999998211860657f }, weights);
        SurfaceCoverage.Write(weights, false, 0, .65f, .7f, 0);
        Assert.Equal(new float[] { 1, 0, 0, 0, 0 }, weights);
        SurfaceCoverage.Write(weights, true, 1, 1, 0, 0);
        Assert.Equal(new float[5], weights);
    }

    [Fact]
    public void DryGroundAndVerySteepSnowRemainBounded()
    {
        var weights = new float[5];
        SurfaceCoverage.Write(weights, false, .2, .1f, .9f, 0);
        Assert.Equal(new float[] { 0, 1, 0, 0, 0 }, weights);
        SurfaceCoverage.Write(weights, false, .2, .1f, .9f, 1.4f);
        Assert.Equal(new float[] { 0, 0, 0, 1, 0 }, weights);
        SurfaceCoverage.Write(weights, false, 1, 1, 0, 1.5f);
        Assert.Equal(new float[] { 0, 0, 0, 1, 0 }, weights);
    }

    [Theory]
    [InlineData(.45, .65)]
    [InlineData(.18, .30)]
    [InlineData(1, 1.4)]
    [InlineData(.45, 1.05)]
    [InlineData(.28, .60)]
    [InlineData(.18, .38)]
    public void SmoothEndpointsAreClampedAndContinuous(double a, double b)
    {
        Assert.Equal(0, SurfaceCoverage.Smooth(a, b, a)); Assert.Equal(1, SurfaceCoverage.Smooth(a, b, b));
        Assert.Equal(0, SurfaceCoverage.Smooth(a, b, a - 1)); Assert.Equal(1, SurfaceCoverage.Smooth(a, b, b + 1));
        Assert.InRange(SurfaceCoverage.Smooth(a, b, a + 1e-6), 0, 1e-8);
        Assert.InRange(1 - SurfaceCoverage.Smooth(a, b, b - 1e-6), 0, 1e-8);
    }

    [Theory]
    [InlineData(2, 2, 0, int.MinValue)]
    [InlineData(3, 2, 30, int.MaxValue)]
    [InlineData(512, 512, 30, -7)]
    public void CompleteMapsAreBoundedNormalizedIndependentAndDeterministic(int width, int height, double bound, int seed)
    {
        var request = TerrainTests.Request(0) with { HeightMap = TerrainTests.Request().HeightMap with { Width = width, Height = height, HeightMultiplier = bound, Seed = seed } };
        var a = TerrainGenerator.Generate(request).HeightMap; var b = TerrainGenerator.Generate(request).HeightMap;
        Assert.Equal(width * height * 5, a.SurfaceWeights.Length); Assert.NotSame(a.SurfaceWeights, b.SurfaceWeights);
        Assert.Equal(a.SurfaceWeights, b.SurfaceWeights);
        for (var i = 0; i < a.Values.Length; i++)
        {
            double sum = 0;
            for (var j = 0; j < 5; j++) { var weight = a.SurfaceWeights[i * 5 + j]; Assert.True(float.IsFinite(weight)); Assert.InRange(weight, 0, 1); sum += weight; }
            Assert.Equal(0, a.SurfaceWeights[i * 5 + 2]);
            Assert.InRange(Math.Abs(sum - (a.Biomes[i] == LandscapeBiome.Ocean ? 0 : 1)), 0, SurfaceCoverage.SumTolerance);
        }
    }
}
