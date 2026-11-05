using System.Reflection;
using Xunit;

namespace WorldGenerator.Core.Tests;

public sealed class HeightMapGeneratorTests
{
    private static readonly float[] GoldenValues =
    [
        2.9216370582580566f,
        3.6088085174560547f,
        6.840007781982422f,
        6.314371109008789f,
        6.954989910125732f,
        6.4931135177612305f
    ];

    public static TheoryData<HeightMapRequest> InvalidRequests => new()
    {
        Request(width: HeightMapLimits.MinWidth - 1),
        Request(height: HeightMapLimits.MinHeight - 1),
        Request(height: 0, heightMultiplier: 0.0),
        Request(noiseScale: double.NaN),
        Request(noiseScale: double.PositiveInfinity),
        Request(octaves: HeightMapLimits.MinOctaves - 1),
        Request(heightMultiplier: -1.0),
        Request() with { AlgorithmVersion = "unsupported" }
    };

    public static TheoryData<int, int> SupportedDimensions => new()
    {
        { HeightMapLimits.MinWidth, HeightMapLimits.MinHeight },
        { 3, 5 },
        { HeightMapLimits.MaxWidth, 2 },
        { HeightMapLimits.MaxWidth, HeightMapLimits.MaxHeight }
    };

    [Fact]
    public void Generate_ReturnsIdenticalOutputsAcrossRepeatedAndInterleavedCalls()
    {
        var request = Request(seed: 42, width: 17, height: 13, noiseScale: 0.07, octaves: 4);

        var first = HeightMapGenerator.Generate(request);
        var interleaved = HeightMapGenerator.Generate(request with { Seed = -7 });
        var repeated = HeightMapGenerator.Generate(request);

        Assert.Equal(first.Values, repeated.Values);
        Assert.NotEqual(first.Values, interleaved.Values);
    }

    [Fact]
    public void Generate_ProducesDifferentMapsForDifferentSeeds()
    {
        var first = HeightMapGenerator.Generate(Request(seed: 1, width: 8, height: 8));
        var second = HeightMapGenerator.Generate(Request(seed: 2, width: 8, height: 8));

        Assert.NotEqual(first.Values, second.Values);
    }

    [Theory]
    [InlineData(int.MinValue)]
    [InlineData(-1)]
    [InlineData(0)]
    [InlineData(int.MaxValue)]
    public void Generate_AcceptsNegativeAndExtremeSeeds(int seed)
    {
        var request = Request(seed: seed, width: 5, height: 3, octaves: 2);

        var result = HeightMapGenerator.Generate(request);
        var repeated = HeightMapGenerator.Generate(request);

        Assert.Equal(15, result.Values.Length);
        Assert.All(result.Values, value => Assert.True(float.IsFinite(value)));
        Assert.Equal(result.Values, repeated.Values);
    }

    [Theory]
    [MemberData(nameof(SupportedDimensions))]
    public void Generate_SupportsRectangularAndBoundaryDimensions(int width, int height)
    {
        var request = Request(width: width, height: height, octaves: 1);

        var result = HeightMapGenerator.Generate(request);

        Assert.Equal(width, result.Width);
        Assert.Equal(height, result.Height);
        Assert.Equal(width * height, result.Values.Length);
        Assert.All(result.Values, value =>
        {
            Assert.True(float.IsFinite(value));
            Assert.InRange(value, 0f, (float)request.HeightMultiplier);
        });
    }

    [Fact]
    public void Generate_PreservesContractAndReturnsIndependentStorage()
    {
        var request = Request(seed: 7, width: 6, height: 4, octaves: 3);

        var first = HeightMapGenerator.Generate(request);
        var second = HeightMapGenerator.Generate(request);

        Assert.Equal(request.Width, first.Width);
        Assert.Equal(request.Height, first.Height);
        Assert.Equal(request.AlgorithmVersion, first.AlgorithmVersion);
        Assert.Equal(request.Width * request.Height, first.Values.Length);
        Assert.NotSame(first.Values, second.Values);

        var secondSnapshot = second.Values.ToArray();
        first.Values[0] = -1f;

        var third = HeightMapGenerator.Generate(request);

        Assert.Equal(secondSnapshot, second.Values);
        Assert.Equal(secondSnapshot, third.Values);
    }

    [Fact]
    public void Generate_ProducesFiniteValuesWithinHeightRange()
    {
        var request = Request(
            seed: -7,
            width: 32,
            height: 17,
            noiseScale: 0.123,
            octaves: 5,
            heightMultiplier: 250.5);

        var result = HeightMapGenerator.Generate(request);

        Assert.All(result.Values, value =>
        {
            Assert.True(float.IsFinite(value));
            Assert.InRange(value, 0f, (float)request.HeightMultiplier);
        });
    }

    [Fact]
    public void Generate_ReturnsOnlyZerosWhenHeightMultiplierIsZero()
    {
        var request = Request(width: 9, height: 7, octaves: 4, heightMultiplier: 0.0);

        var result = HeightMapGenerator.Generate(request);

        Assert.All(result.Values, value => Assert.Equal(0f, value));
    }

    [Fact]
    public void Generate_RejectsNullRequest()
    {
        var exception = Assert.Throws<ArgumentNullException>(
            () => HeightMapGenerator.Generate(null!));

        Assert.Equal("request", exception.ParamName);
    }

    [Theory]
    [MemberData(nameof(InvalidRequests))]
    public void Generate_RejectsInvalidRequestsBeforeAllocation(HeightMapRequest request)
    {
        var exception = Assert.Throws<ArgumentException>(
            () => HeightMapGenerator.Generate(request));

        Assert.Equal("request", exception.ParamName);
    }


    [Fact]
    public void Generate_AndGenerateValidated_ProduceIdenticalFullOutputs()
    {
        var request = GoldenRequest();
        var preparation = HeightMapValidator.Prepare(request);

        Assert.True(preparation.IsValid);

        var validating = HeightMapGenerator.Generate(request);
        var prevalidated = HeightMapGenerator.GenerateValidated(
            preparation.ValidatedRequest!);

        Assert.Equal(validating.Width, prevalidated.Width);
        Assert.Equal(validating.Height, prevalidated.Height);
        Assert.Equal(validating.AlgorithmVersion, prevalidated.AlgorithmVersion);
        Assert.Equal(validating.Values, prevalidated.Values);
    }

    [Fact]
    public void GenerateValidated_UsesTheValidatedSnapshot()
    {
        var request = GoldenRequest();
        var preparation = HeightMapValidator.Prepare(request);
        var expected = HeightMapGenerator.Generate(request);

        request = request with { Seed = 99, HeightMultiplier = 1.0 };

        var result = HeightMapGenerator.GenerateValidated(
            preparation.ValidatedRequest!);

        Assert.Equal(expected.Values, result.Values);
    }

    [Fact]
    public void GenerateValidated_RejectsNullRequest()
    {
        var exception = Assert.Throws<ArgumentNullException>(
            () => HeightMapGenerator.GenerateValidated(null!));

        Assert.Equal("request", exception.ParamName);
    }

    [Fact]
    public void Prepare_ReturnsValidatedSnapshotForValidRequest()
    {
        var preparation = HeightMapValidator.Prepare(GoldenRequest());

        Assert.True(preparation.IsValid);
        Assert.NotNull(preparation.ValidatedRequest);
        Assert.Empty(preparation.Errors);
    }

    [Fact]
    public void Prepare_ReturnsCanonicalErrorForNullRequest()
    {
        var preparation = HeightMapValidator.Prepare(null);

        Assert.False(preparation.IsValid);
        Assert.Null(preparation.ValidatedRequest);

        var error = Assert.Single(preparation.Errors);
        Assert.Equal(HeightMapValidationErrorCodes.RequestRequired, error.Code);
        Assert.Equal("request", error.Field);
    }

    [Theory]
    [MemberData(nameof(InvalidRequests))]
    public void Prepare_ReturnsErrorsForInvalidRequests(HeightMapRequest request)
    {
        var preparation = HeightMapValidator.Prepare(request);

        Assert.False(preparation.IsValid);
        Assert.Null(preparation.ValidatedRequest);
        Assert.NotEmpty(preparation.Errors);
    }

    [Fact]
    public void ValidatedHeightMapRequest_ExposesNoPublicMutationPath()
    {
        var type = typeof(ValidatedHeightMapRequest);

        Assert.True(type.IsSealed);
        Assert.Empty(type.GetConstructors(BindingFlags.Public | BindingFlags.Instance));
        Assert.DoesNotContain(
            type.GetProperties(BindingFlags.Public | BindingFlags.Instance),
            property => property.SetMethod is not null);
        Assert.DoesNotContain(
            type.GetFields(BindingFlags.Public | BindingFlags.Instance),
            field => !field.IsInitOnly);
    }

    [Fact]
    public void Generate_MatchesGoldenReferenceValues()
    {
        var result = HeightMapGenerator.Generate(GoldenRequest());

        Assert.Equal(GoldenValues, result.Values);
    }

    [Fact]
    public void Generate_UsesRowMajorIndexing()
    {
        var result = HeightMapGenerator.Generate(GoldenRequest());

        Assert.Equal(GoldenValues[0], result.Values[(0 * result.Width) + 0]);
        Assert.Equal(GoldenValues[1], result.Values[(0 * result.Width) + 1]);
        Assert.Equal(GoldenValues[2], result.Values[(0 * result.Width) + 2]);
        Assert.Equal(GoldenValues[3], result.Values[(1 * result.Width) + 0]);
        Assert.Equal(GoldenValues[4], result.Values[(1 * result.Width) + 1]);
        Assert.Equal(GoldenValues[5], result.Values[(1 * result.Width) + 2]);
    }

    private static HeightMapRequest GoldenRequest() => Request(
        seed: 42,
        width: 3,
        height: 2,
        noiseScale: 0.37,
        octaves: 3,
        heightMultiplier: 30.0);

    private static HeightMapRequest Request(
        int seed = 42,
        int width = 16,
        int height = 16,
        double noiseScale = 0.03,
        int octaves = 4,
        double heightMultiplier = 30.0) => new(
            Seed: seed,
            Width: width,
            Height: height,
            NoiseScale: noiseScale,
            Octaves: octaves,
            HeightMultiplier: heightMultiplier,
            AlgorithmVersion: HeightMapLimits.SupportedAlgorithmVersion);
}
