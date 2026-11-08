using Xunit;

namespace WorldGenerator.Core.Tests;

public sealed class HeightMapValidatorTests
{
    private const string WidthField = "width";
    private const string HeightField = "height";
    private const string NoiseScaleField = "noiseScale";
    private const string OctavesField = "octaves";
    private const string HeightMultiplierField = "heightMultiplier";
    private const string AlgorithmVersionField = "algorithmVersion";

    public static TheoryData<HeightMapRequest, string> OutOfRangeRequests => new()
    {
        { ValidRequest() with { Width = HeightMapLimits.MinWidth - 1 }, WidthField },
        { ValidRequest() with { Width = HeightMapLimits.MaxWidth + 1 }, WidthField },
        { ValidRequest() with { Height = HeightMapLimits.MinHeight - 1 }, HeightField },
        { ValidRequest() with { Height = HeightMapLimits.MaxHeight + 1 }, HeightField },
        { ValidRequest() with { NoiseScale = Math.BitDecrement(HeightMapLimits.MinNoiseScale) }, NoiseScaleField },
        { ValidRequest() with { NoiseScale = Math.BitIncrement(HeightMapLimits.MaxNoiseScale) }, NoiseScaleField },
        { ValidRequest() with { Octaves = HeightMapLimits.MinOctaves - 1 }, OctavesField },
        { ValidRequest() with { Octaves = HeightMapLimits.MaxOctaves + 1 }, OctavesField },
        {
            ValidRequest() with { HeightMultiplier = Math.BitDecrement(HeightMapLimits.MinHeightMultiplier) },
            HeightMultiplierField
        },
        {
            ValidRequest() with { HeightMultiplier = Math.BitIncrement(HeightMapLimits.MaxHeightMultiplier) },
            HeightMultiplierField
        }
    };

    public static TheoryData<HeightMapRequest, string> NonFiniteRequests => new()
    {
        { ValidRequest() with { NoiseScale = double.NaN }, NoiseScaleField },
        { ValidRequest() with { NoiseScale = double.PositiveInfinity }, NoiseScaleField },
        { ValidRequest() with { NoiseScale = double.NegativeInfinity }, NoiseScaleField },
        { ValidRequest() with { HeightMultiplier = double.NaN }, HeightMultiplierField },
        { ValidRequest() with { HeightMultiplier = double.PositiveInfinity }, HeightMultiplierField },
        { ValidRequest() with { HeightMultiplier = double.NegativeInfinity }, HeightMultiplierField }
    };

    [Fact]
    public void Validate_AcceptsAValidRequest()
    {
        var request = ValidRequest();

        Assert.True(HeightMapValidator.IsValid(request));
        Assert.Empty(HeightMapValidator.Validate(request));
    }

    [Fact]
    public void Validate_AcceptsInclusiveLowerBoundaries()
    {
        var request = ValidRequest() with
        {
            Width = HeightMapLimits.MinWidth,
            Height = HeightMapLimits.MinHeight,
            NoiseScale = HeightMapLimits.MinNoiseScale,
            Octaves = HeightMapLimits.MinOctaves,
            HeightMultiplier = HeightMapLimits.MinHeightMultiplier
        };

        Assert.Empty(HeightMapValidator.Validate(request));
    }

    [Fact]
    public void Validate_AcceptsInclusiveUpperBoundaries()
    {
        var request = ValidRequest() with
        {
            Width = HeightMapLimits.MaxWidth,
            Height = HeightMapLimits.MaxHeight,
            NoiseScale = HeightMapLimits.MaxNoiseScale,
            Octaves = HeightMapLimits.MaxOctaves,
            HeightMultiplier = HeightMapLimits.MaxHeightMultiplier
        };

        Assert.Empty(HeightMapValidator.Validate(request));
    }

    [Theory]
    [MemberData(nameof(OutOfRangeRequests))]
    public void Validate_RejectsValuesImmediatelyOutsideEachBoundary(HeightMapRequest request, string field)
    {
        var errors = HeightMapValidator.Validate(request);

        Assert.False(HeightMapValidator.IsValid(request));
        Assert.Contains(
            errors,
            error => error.Code == HeightMapValidationErrorCodes.ValueOutOfRange && error.Field == field);
    }

    [Theory]
    [MemberData(nameof(NonFiniteRequests))]
    public void Validate_RejectsNanAndBothInfinities(HeightMapRequest request, string field)
    {
        var error = Assert.Single(HeightMapValidator.Validate(request));

        Assert.Equal(HeightMapValidationErrorCodes.ValueNotFinite, error.Code);
        Assert.Equal(field, error.Field);
        Assert.False(string.IsNullOrWhiteSpace(error.Message));
    }

    [Fact]
    public void Validate_TreatsANullRequestAsAnExplicitValidationError()
    {
        var error = Assert.Single(HeightMapValidator.Validate(null));

        Assert.Equal(HeightMapValidationErrorCodes.RequestRequired, error.Code);
        Assert.Equal("request", error.Field);
        Assert.False(string.IsNullOrWhiteSpace(error.Message));
        Assert.False(HeightMapValidator.IsValid(null));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    public void Validate_RejectsMissingAlgorithmVersions(string? algorithmVersion)
    {
        var request = ValidRequest() with { AlgorithmVersion = algorithmVersion! };

        var error = Assert.Single(HeightMapValidator.Validate(request));

        Assert.Equal(HeightMapValidationErrorCodes.FieldRequired, error.Code);
        Assert.Equal(AlgorithmVersionField, error.Field);
    }

    [Theory]
    [InlineData("value-noise-fbm-v2")]
    [InlineData("VALUE-NOISE-FBM-V1")]
    [InlineData("Value-Noise-Fbm-V1")]
    [InlineData(" value-noise-fbm-v1")]
    [InlineData("value-noise-fbm-v1 ")]
    public void Validate_RejectsUnsupportedAndCaseMismatchedAlgorithmVersions(string algorithmVersion)
    {
        var request = ValidRequest() with { AlgorithmVersion = algorithmVersion };

        var error = Assert.Single(HeightMapValidator.Validate(request));

        Assert.Equal(HeightMapValidationErrorCodes.AlgorithmVersionUnsupported, error.Code);
        Assert.Equal(AlgorithmVersionField, error.Field);
    }

    [Fact]
    public void Validate_KeepsExplicitCellCountCheckUsingOverflowSafeArithmetic()
    {
        var request = ValidRequest() with
        {
            Width = HeightMapLimits.MaxWidth + 1,
            Height = HeightMapLimits.MaxHeight
        };

        var errors = HeightMapValidator.Validate(request);

        Assert.Contains(
            errors,
            error => error.Code == HeightMapValidationErrorCodes.ValueOutOfRange && error.Field == WidthField);
        Assert.Contains(errors, error => error.Code == HeightMapValidationErrorCodes.CellCountExceeded);
    }

    [Theory]
    [InlineData(int.MaxValue, int.MaxValue)]
    [InlineData(int.MinValue, int.MinValue)]
    [InlineData(int.MaxValue, int.MinValue)]
    [InlineData(int.MinValue, int.MaxValue)]
    public void Validate_HandlesExtremeIntegerDimensionsWithoutOverflow(int width, int height)
    {
        var request = ValidRequest() with { Width = width, Height = height };

        var exception = Record.Exception(() => HeightMapValidator.Validate(request));
        var errors = HeightMapValidator.Validate(request);

        Assert.Null(exception);
        Assert.Contains(
            errors,
            error => error.Code == HeightMapValidationErrorCodes.ValueOutOfRange && error.Field == WidthField);
        Assert.Contains(
            errors,
            error => error.Code == HeightMapValidationErrorCodes.ValueOutOfRange && error.Field == HeightField);
        Assert.DoesNotContain(errors, error => error.Code == HeightMapValidationErrorCodes.ValueNotFinite);
    }

    [Fact]
    public void Validate_ReturnsAllApplicableErrorsInDeterministicOrder()
    {
        var request = ValidRequest() with
        {
            Width = HeightMapLimits.MinWidth - 1,
            Height = HeightMapLimits.MinHeight - 1,
            NoiseScale = double.NaN,
            Octaves = HeightMapLimits.MinOctaves - 1,
            HeightMultiplier = HeightMapLimits.MinHeightMultiplier - 1,
            AlgorithmVersion = "unsupported"
        };

        var errors = HeightMapValidator.Validate(request);

        Assert.Collection(
            errors,
            error => AssertError(error, HeightMapValidationErrorCodes.ValueOutOfRange, WidthField),
            error => AssertError(error, HeightMapValidationErrorCodes.ValueOutOfRange, HeightField),
            error => AssertError(error, HeightMapValidationErrorCodes.ValueNotFinite, NoiseScaleField),
            error => AssertError(error, HeightMapValidationErrorCodes.ValueOutOfRange, OctavesField),
            error => AssertError(error, HeightMapValidationErrorCodes.ValueOutOfRange, HeightMultiplierField),
            error => AssertError(error, HeightMapValidationErrorCodes.AlgorithmVersionUnsupported, AlgorithmVersionField));
        Assert.Equal(errors, HeightMapValidator.Validate(request));
    }

    [Theory]
    [InlineData(int.MinValue)]
    [InlineData(-1)]
    [InlineData(0)]
    [InlineData(int.MaxValue)]
    public void Validate_AcceptsEverySeedValue(int seed)
    {
        var request = ValidRequest() with { Seed = seed };

        Assert.Empty(HeightMapValidator.Validate(request));
        Assert.True(HeightMapValidator.IsValid(request));
    }

    [Fact]
    public void Validate_DoesNotRewriteInvalidValues()
    {
        var request = ValidRequest() with
        {
            Width = HeightMapLimits.MinWidth - 1,
            NoiseScale = double.PositiveInfinity
        };
        var original = request;

        HeightMapValidator.Validate(request);

        Assert.Equal(original, request);
        Assert.Equal(HeightMapLimits.MinWidth - 1, request.Width);
        Assert.Equal(double.PositiveInfinity, request.NoiseScale);
    }

    private static HeightMapRequest ValidRequest() => new(
        Seed: 42,
        Width: 256,
        Height: 256,
        NoiseScale: 0.03,
        Octaves: 4,
        HeightMultiplier: 30.0,
        AlgorithmVersion: HeightMapLimits.SupportedAlgorithmVersion);

    private static void AssertError(ValidationError error, string code, string field)
    {
        Assert.Equal(code, error.Code);
        Assert.Equal(field, error.Field);
        Assert.False(string.IsNullOrWhiteSpace(error.Message));
    }
}
