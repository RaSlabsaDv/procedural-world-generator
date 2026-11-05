using Xunit;

namespace WorldGenerator.Core.Tests;

public sealed class ComputationProbeTests
{
    public static TheoryData<int, float[]> SampleFixtures => new()
    {
        {
            0,
            [0.23606795072555542f, 0.2785668969154358f, 0.8195337057113647f,
                0.6678668856620789f, 0.38407737016677856f]
        },
        {
            42,
            [0.25234514474868774f, 0.08812499046325684f, 0.5772811770439148f,
                0.22255420684814453f, 0.3756601810455322f]
        },
        {
            -7,
            [0.2333551049232483f, 0.6436405181884766f, 0.026575803756713867f,
                0.40875232219696045f, 0.7188135385513306f]
        },
        {
            int.MinValue,
            [0.7360679507255554f, 0.7785668969154358f, 0.31953370571136475f,
                0.16786688566207886f, 0.8840773701667786f]
        },
        {
            int.MaxValue,
            [0.7356804013252258f, 0.6878631114959717f, 0.6348254680633545f,
                0.13085049390792847f, 0.21761107444763184f]
        }
    };

    [Theory]
    [InlineData(0, 0, 0)]
    [InlineData(19, 23, 42)]
    [InlineData(-20, 7, -13)]
    [InlineData(int.MaxValue, int.MinValue, -1)]
    [InlineData(int.MinValue, 0, int.MinValue)]
    [InlineData(int.MaxValue, 0, int.MaxValue)]
    public void Add_ReturnsExactIntegerSum(int left, int right, int expected)
    {
        Assert.Equal(expected, ComputationProbe.Add(left, right));
    }

    [Theory]
    [InlineData(int.MaxValue, 1)]
    [InlineData(int.MinValue, -1)]
    public void Add_RejectsOverflow(int left, int right)
    {
        Assert.Throws<OverflowException>(() => ComputationProbe.Add(left, right));
    }

    [Theory]
    [MemberData(nameof(SampleFixtures))]
    public void GenerateSamples_MatchesReferenceValues(int seed, float[] expected)
    {
        Assert.Equal(expected, ComputationProbe.GenerateSamples(seed, expected.Length));
    }

    [Fact]
    public void GenerateSamples_AllowsAnEmptyResult()
    {
        Assert.Empty(ComputationProbe.GenerateSamples(seed: 42, count: 0));
    }

    [Fact]
    public void GenerateSamples_AllowsASingleValue()
    {
        var values = ComputationProbe.GenerateSamples(seed: 42, count: 1);

        Assert.Equal(0.25234514474868774f, Assert.Single(values));
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(int.MinValue)]
    [InlineData(ComputationProbe.MaxSampleCount + 1)]
    [InlineData(int.MaxValue)]
    public void GenerateSamples_RejectsInvalidCounts(int count)
    {
        var exception = Assert.Throws<ArgumentOutOfRangeException>(
            () => ComputationProbe.GenerateSamples(seed: 42, count));

        Assert.Equal("count", exception.ParamName);
    }

    [Fact]
    public void GenerateSamples_SupportsTheMaximumBatchSize()
    {
        var values = ComputationProbe.GenerateSamples(seed: 42, ComputationProbe.MaxSampleCount);

        Assert.Equal(262144, values.Length);
        Assert.Equal(0.25234514474868774f, values[0]);
        Assert.Equal(0.98126220703125f, values[^1]);
        Assert.All(values, value => Assert.True(float.IsFinite(value) && value >= 0f && value < 1f));
    }

    [Fact]
    public void GenerateSamples_IsReproducibleAcrossInterleavedCalls()
    {
        var first = ComputationProbe.GenerateSamples(seed: 42, count: 1024);
        var otherSeed = ComputationProbe.GenerateSamples(seed: -7, count: 1024);
        var repeated = ComputationProbe.GenerateSamples(seed: 42, count: 1024);

        Assert.Equal(first, repeated);
        Assert.NotEqual(first[0], otherSeed[0]);
    }

    [Fact]
    public void GenerateSamples_ReturnsIndependentArrays()
    {
        var first = ComputationProbe.GenerateSamples(seed: 42, count: 16);
        var second = ComputationProbe.GenerateSamples(seed: 42, count: 16);

        Assert.NotSame(first, second);
        first[0] = -1f;

        var third = ComputationProbe.GenerateSamples(seed: 42, count: 16);

        Assert.NotSame(second, third);
        Assert.Equal(0.25234514474868774f, second[0]);
        Assert.Equal(second, third);
    }
}
