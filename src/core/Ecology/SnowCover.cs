namespace WorldGenerator.Core;

/// <summary>Shared static highland category and continuous coverage policy.</summary>
internal static class SnowCover
{
    private const double HeightStart = .38, HeightEnd = .60;
    private const double TemperatureStart = .20, TemperatureEnd = .38;
    private const double SlopeStart = 1, SlopeEnd = 1.4;
    private const double HighlandHeight = .48, HighlandTemperature = .26, HighlandSlope = 1.2;

    internal static bool IsHighland(double height, double temperature, double slope) =>
        height >= HighlandHeight && temperature <= HighlandTemperature && slope <= HighlandSlope;

    internal static double Fraction(double height, double temperature, double slope) =>
        SurfaceCoverage.Smooth(HeightStart, HeightEnd, height)
        * (1 - SurfaceCoverage.Smooth(TemperatureStart, TemperatureEnd, temperature))
        * (1 - SurfaceCoverage.Smooth(SlopeStart, SlopeEnd, slope));
}
