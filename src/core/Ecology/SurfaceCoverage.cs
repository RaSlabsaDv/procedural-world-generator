namespace WorldGenerator.Core;

/// <summary>Derived coverage; current snow policy is in REGIONAL_CLIMATE_V1.md.</summary>
internal static class SurfaceCoverage
{
    internal const int ChannelCount = 5;
    internal const double SumTolerance = 1e-6;
    private const double RockSlopeStart = .45, RockSlopeEnd = 1.05;
    private const double GrassMoistureStart = .28, GrassMoistureEnd = .60;
    private const double GrassTemperatureStart = .18, GrassTemperatureEnd = .38;

    internal static float[] Derive(float[] heights, LandscapeBiome[] biomes,
        float[] moisture, float[] temperature, float[] slope, float bound)
    {
        var weights = new float[heights.Length * ChannelCount];
        for (var i = 0; i < heights.Length; i++)
            Write(weights.AsSpan(i * ChannelCount, ChannelCount), biomes[i] == LandscapeBiome.Ocean,
                bound == 0 ? 0 : heights[i] / (double)bound, moisture[i], temperature[i], slope[i]);
        return weights;
    }

    internal static void Write(Span<float> output, bool ocean, double h, float m, float t, float s)
    {
        if (ocean) { output.Clear(); return; }
        var snow = SnowCover.Fraction(h, t, s);
        var rock = Smooth(RockSlopeStart, RockSlopeEnd, s);
        var grass = Smooth(GrassMoistureStart, GrassMoistureEnd, m) * Smooth(GrassTemperatureStart, GrassTemperatureEnd, t);
        var remaining = (1 - snow) * (1 - rock);
        output[0] = (float)(remaining * grass);
        output[1] = (float)(remaining * (1 - grass));
        output[2] = 0;
        output[3] = (float)((1 - snow) * rock);
        output[4] = (float)snow;
    }

    internal static double Smooth(double a, double b, double value)
    {
        var u = Math.Clamp((value - a) / (b - a), 0, 1);
        return u * u * (3 - 2 * u);
    }
}
