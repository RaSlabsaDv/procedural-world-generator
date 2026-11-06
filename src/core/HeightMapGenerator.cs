namespace WorldGenerator.Core;

/// <summary>
/// Deterministic 2D value-noise fBm heightmap generator for version 1.
/// </summary>
public static class HeightMapGenerator
{
    /// <summary>
    /// Generates a heightmap after validating the request.
    /// </summary>
    /// <exception cref="ArgumentNullException"><paramref name="request"/> is null.</exception>
    /// <exception cref="ArgumentException"><paramref name="request"/> has validation errors.</exception>
    public static HeightMapResult Generate(HeightMapRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        var preparation = HeightMapValidator.Prepare(request);
        if (!preparation.IsValid)
        {
            var details = string.Join(
                "; ",
                preparation.Errors.Select(error => $"{error.Field}: {error.Code}"));
            throw new ArgumentException(
                $"The heightmap request is invalid: {details}",
                nameof(request));
        }

        return GenerateValidated(preparation.ValidatedRequest!);
    }

    /// <summary>
    /// Generates a heightmap from a request that has already passed canonical validation.
    /// </summary>
    /// <exception cref="ArgumentNullException"><paramref name="request"/> is null.</exception>
    public static HeightMapResult GenerateValidated(ValidatedHeightMapRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        return GenerateCore(request.Request);
    }

    private static HeightMapResult GenerateCore(HeightMapRequest request)
    {
        var values = new float[request.Width * request.Height];
        var biomes = new BiomeId[values.Length];
        var heightBound = (float)request.HeightMultiplier;
        var seed = unchecked((uint)request.Seed);

        for (var y = 0; y < request.Height; y++)
        {
            for (var x = 0; x < request.Width; x++)
            {
                var sum = 0.0;
                var amplitudeSum = 0.0;
                var frequency = 1.0;
                var amplitude = 1.0;

                for (var octave = 0; octave < request.Octaves; octave++)
                {
                    var sampleX = x * request.NoiseScale * frequency;
                    var sampleY = y * request.NoiseScale * frequency;

                    sum += ValueNoise(sampleX, sampleY, seed) * amplitude;
                    amplitudeSum += amplitude;

                    frequency *= 2.0;
                    amplitude *= 0.5;
                }

                var normalized = Math.Clamp(sum / amplitudeSum, 0.0, 1.0);
                var index = y * request.Width + x;
                values[index] = (float)(normalized * request.HeightMultiplier);
                biomes[index] = BiomeClassifier.Classify(values[index], heightBound);
            }
        }

        return new HeightMapResult(
            request.Width,
            request.Height,
            values,
            request.AlgorithmVersion,
            biomes,
            HeightMapResult.CurrentVersion);
    }

    private static double ValueNoise(double x, double y, uint seed)
    {
        var x0 = (int)Math.Floor(x);
        var y0 = (int)Math.Floor(y);
        var x1 = x0 + 1;
        var y1 = y0 + 1;

        var tx = Smooth(x - x0);
        var ty = Smooth(y - y0);

        var top = Lerp(
            LatticeValue(x0, y0, seed),
            LatticeValue(x1, y0, seed),
            tx);
        var bottom = Lerp(
            LatticeValue(x0, y1, seed),
            LatticeValue(x1, y1, seed),
            tx);

        return Lerp(top, bottom, ty);
    }

    private static double Smooth(double t) => t * t * t * (t * (t * 6 - 15) + 10);

    private static double Lerp(double a, double b, double t) => a + (b - a) * t;

    private static double LatticeValue(int x, int y, uint seed)
    {
        var hash = unchecked((uint)x * 0x8DA6B343u);
        hash = unchecked(hash + (uint)y * 0xD8163841u);
        hash = unchecked(hash + seed * 0xCB1AB31Fu);
        hash ^= hash >> 16;
        hash = unchecked(hash * 0x7FEB352Du);
        hash ^= hash >> 15;
        hash = unchecked(hash * 0x846CA68Bu);
        hash ^= hash >> 16;
        return hash * (1.0 / 4_294_967_296.0);
    }
}
