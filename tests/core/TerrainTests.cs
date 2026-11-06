using Xunit;

namespace WorldGenerator.Core.Tests;

public sealed class TerrainTests
{
    internal static TerrainRequest Request(int iterations = 8) => new(
        new(42, 5, 3, .37, 3, 30, HeightMapLimits.SupportedAlgorithmVersion),
        .55, 2, iterations, .05, .1, TerrainLimits.AlgorithmVersion);

    [Theory]
    [InlineData(0)]
    [InlineData(2)]
    public void MatchesIndependentPythonReference(int steps)
    {
        float[] expected = steps == 0
            ? [9.255078315734863f, 6.790861129760742f, 8.323338508605957f, 6.654006004333496f, 12.441024780273438f, 15.8914155960083f]
            : [9.203316688537598f, 6.8050031661987305f, 8.295624732971191f, 6.664665699005127f, 12.31420612335205f, 15.740657806396484f];
        var request = Request(steps);
        request = request with { HeightMap = request.HeightMap with { Width = 3, Height = 2 } };
        Assert.Equal(expected, TerrainGenerator.Generate(request).HeightMap.Values);
    }

    [Fact]
    public void RepeatedPreparedAndDirectGenerationAgreeAndHaveIndependentStorage()
    {
        var request = Request();
        var a = TerrainGenerator.Generate(request);
        var b = TerrainGenerator.GenerateValidated(TerrainValidator.Prepare(request).ValidatedRequest!);
        Assert.Equal(a.HeightMap.Values, b.HeightMap.Values);
        Assert.Equal(a.HeightMap.Biomes, b.HeightMap.Biomes);
        Assert.Equal(a.Simulation, b.Simulation);
        Assert.Equal(120, a.Simulation.CellIterations);
        Assert.NotSame(a.HeightMap.Values, b.HeightMap.Values);
        Assert.NotSame(a.HeightMap.Biomes, b.HeightMap.Biomes);
        a.HeightMap.Values[0] = -1;
        Assert.InRange(b.HeightMap.Values[0], 0, 30);
    }

    [Theory]
    [InlineData(int.MinValue, 2, 2, 0)]
    [InlineData(int.MaxValue, 3, 9, 1000)]
    [InlineData(-1, 512, 2, .7)]
    [InlineData(0, 512, 512, 0)]
    public void SupportsSeedsDimensionsAndZeroHeight(int seed, int width, int height, double multiplier)
    {
        var r = Request(1);
        r = r with { HeightMap = r.HeightMap with { Seed = seed, Width = width, Height = height, HeightMultiplier = multiplier } };
        var result = TerrainGenerator.Generate(r);
        Assert.Equal(width * height, result.HeightMap.Values.Length);
        Assert.Equal(width * height, result.HeightMap.Biomes.Length);
        Assert.All(result.HeightMap.Values, v => Assert.True(float.IsFinite(v) && v >= 0 && v <= (float)multiplier));
        if (multiplier == 0)
        {
            Assert.All(result.HeightMap.Values, v => Assert.Equal(0, v));
            Assert.All(result.HeightMap.Biomes, v => Assert.Equal(BiomeId.Water, v));
        }
        Balance(result.Simulation);
    }

    [Fact]
    public void IterationsChangeTerrainWithoutChangingOutputDimensions()
    {
        var before = TerrainGenerator.Generate(Request(0));
        var after = TerrainGenerator.Generate(Request(32));
        Assert.Equal(before.HeightMap.Values.Length, after.HeightMap.Values.Length);
        Assert.NotEqual(before.HeightMap.Values, after.HeightMap.Values);
        Balance(after.Simulation);
    }

    [Fact]
    public void FlatClosedGridHasAnalyticalWaterBalanceAndNoTerrainChange()
    {
        double[] values = [2, 2, 2, 2, 2, 2];
        var result = HydraulicSimulation.Run(values, 3, 2, 10, 10, .5, .1);
        Assert.Equal(new double[] { 2, 2, 2, 2, 2, 2 }, values);
        Assert.Equal(0, result.SuspendedSediment);
        // Per-cell recurrence w[n+1]=(w[n]+0.1)*0.98.
        var expected = 6 * .1 * .98 * (1 - Math.Pow(.98, 10)) / (1 - .98);
        Assert.InRange(Math.Abs(expected - result.WaterRemaining), 0, 1e-12);
        Balance(result);
    }

    [Fact]
    public void OneStepControlledSlopeMatchesHandCalculatedFixture()
    {
        // Rain adds 0.1/cell. Two downhill edges from cell 0 split its available water.
        // Capacity=4*0.1*4=1.6, erosion=0.4; sediment is carried equally to cells 1 and 2.
        double[] values = [4, 0, 0, 0];
        var result = HydraulicSimulation.Run(values, 2, 2, 4, 1, .5, 0);
        Assert.Equal(new double[] { 3.6, 0, 0, 0 }, values);
        Assert.Equal(.4, result.SuspendedSediment, 12);
        Assert.Equal(.4, result.WaterRemaining, 12);
        Balance(result);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(.1)]
    [InlineData(1)]
    public void ManyStepsConserveMaterialAndAccountForWaterSourcesAndSinks(double evaporation)
    {
        double[] values = [9, 2, 3, 1, 0, 5, 7, 4, 2, 6, 3, 1];
        var result = HydraulicSimulation.Run(values, 4, 3, 10, 300, .3, evaporation);
        Assert.All(values, value => Assert.InRange(value, 0, 10));
        Assert.True(result.SuspendedSediment >= 0 && result.WaterRemaining >= 0);
        Balance(result);
    }

    [Fact]
    public void RainFreeIterationsStillExecuteAndZeroIterationsPreserveInitialState()
    {
        double[] values = [4, 1, 2, 0];
        var zero = HydraulicSimulation.Run(values, 2, 2, 4, 0, 1, 1);
        var dry = HydraulicSimulation.Run(values, 2, 2, 4, 100, 0, 1);
        Assert.Equal(new double[] { 4, 1, 2, 0 }, values);
        Assert.Equal(0, zero.CellIterations);
        Assert.Equal(400, dry.CellIterations);
        Assert.Equal(0, dry.WaterAdded);
    }

    [Fact]
    public void ValidationRejectsMissingNonfiniteUnsupportedAndExcessiveWorkBeforeGeneration()
    {
        Assert.False(TerrainValidator.Prepare(null).IsValid);
        var r = Request();
        TerrainRequest[] invalid = [
            r with { HeightMap = null! }, r with { MountainStrength = double.NaN },
            r with { WarpStrength = double.PositiveInfinity }, r with { Iterations = -1 },
            r with { Iterations = TerrainLimits.MaxIterations + 1 }, r with { Rainfall = 1.1 },
            r with { Evaporation = -.1 }, r with { AlgorithmVersion = "v2" },
            r with { HeightMap = r.HeightMap with { Width = int.MaxValue, Height = int.MaxValue }, Iterations = int.MaxValue },
            r with { HeightMap = r.HeightMap with { Width = 512, Height = 512 }, Iterations = 129 }
        ];
        foreach (var request in invalid)
        {
            Assert.False(TerrainValidator.Prepare(request).IsValid);
            Assert.Throws<ArgumentException>(() => TerrainGenerator.Generate(request));
        }
        Assert.Throws<ArgumentNullException>(() => TerrainGenerator.Generate(null!));
        Assert.Throws<ArgumentNullException>(() => TerrainGenerator.GenerateValidated(null!));
        Assert.True(TerrainValidator.Prepare(r with { HeightMap = r.HeightMap with { Width = 512, Height = 512 }, Iterations = 128 }).IsValid);
    }

    private static void Balance(SimulationSummary s)
    {
        Assert.InRange(Math.Abs(s.InitialTerrainMass - s.FinalTerrainMass - s.SuspendedSediment), 0,
            1e-10 * Math.Max(1, s.InitialTerrainMass));
        Assert.InRange(Math.Abs(s.WaterAdded - s.WaterRemaining - s.WaterEvaporated), 0,
            1e-10 * Math.Max(1, s.WaterAdded));
    }
}
