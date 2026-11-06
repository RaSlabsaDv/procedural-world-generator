using Xunit;
using WorldGenerator.Core.Tests.Historical;

namespace WorldGenerator.Core.Tests;

public sealed class BiomeTests
{
    [Theory]
    [InlineData(0, BiomeId.Water)]
    [InlineData(249, BiomeId.Water)]
    [InlineData(250, BiomeId.Plains)]
    [InlineData(499, BiomeId.Plains)]
    [InlineData(500, BiomeId.Forest)]
    [InlineData(749, BiomeId.Forest)]
    [InlineData(750, BiomeId.Mountains)]
    [InlineData(1000, BiomeId.Mountains)]
    public void Classification_HasFrozenBands(float height, BiomeId expected) =>
        Assert.Equal(expected, BiomeClassifier.Classify(height, 1000));

    [Theory]
    [InlineData(0.25f, BiomeId.Water, BiomeId.Plains)]
    [InlineData(0.5f, BiomeId.Plains, BiomeId.Forest)]
    [InlineData(0.75f, BiomeId.Forest, BiomeId.Mountains)]
    public void Thresholds_UseFinalFloatWithEqualityInHigherBand(float height, BiomeId below, BiomeId at)
    {
        Assert.Equal(below, BiomeClassifier.Classify(float.BitDecrement(height), 1));
        Assert.Equal(at, BiomeClassifier.Classify(height, 1));
        Assert.Equal(at, BiomeClassifier.Classify(float.BitIncrement(height), 1));
    }

    [Theory]
    [InlineData(0.0)]
    [InlineData(double.Epsilon)]
    [InlineData(0.7)]
    [InlineData(1000.0)]
    public void Generation_ReturnsIndependentDeterministicBiomesFromStoredHeights(double multiplier)
    {
        var request = new TerrainRequest(new(int.MinValue, 17, 9, 0.37, 4, multiplier,
            HeightMapLimits.SupportedAlgorithmVersion), .55, 2, 2, .05, .1, .45, .3, .65, .16, .6, 1, 1, TerrainLimits.AlgorithmVersion);
        var a = HistoricalTerrainV1.Generate(request).HeightMap;
        var b = HistoricalTerrainV1.GenerateValidated(TerrainValidator.Prepare(request).ValidatedRequest!).HeightMap;
        Assert.Equal(HeightMapResult.CurrentVersion, a.ResultVersion);
        Assert.Equal(a.Values.Length, a.Biomes.Length);
        Assert.Equal(a.Values, b.Values);
        Assert.Equal(a.Biomes, b.Biomes);
        Assert.NotSame(a.Biomes, b.Biomes);
        for (var i = 0; i < a.Values.Length; i++)
            Assert.Equal(BiomeClassifier.Classify(a.Values[i], (float)multiplier), a.Biomes[i]);
        if ((float)multiplier == 0) Assert.All(a.Biomes, biome => Assert.Equal(BiomeId.Water, biome));
        var snapshot = b.Biomes.ToArray();
        a.Biomes[0] = BiomeId.Mountains;
        Assert.Equal(snapshot, b.Biomes);
    }

}
