namespace WorldGenerator.Core;

/// <summary>World-grid regional fields; arithmetic is frozen in REGIONAL_CLIMATE_V1.md.</summary>
internal static class RegionalClimate
{
    private const double HumidityWavelength = 144, ThermalWavelength = 128;
    private const uint HumiditySalt = 0xB5297A4Du, ThermalSalt = 0x1B56C4E9u;
    private const int Octaves = 3;
    private const double MoistureVariation = .8, ElevationDrying = .15, WarmDrying = .10;
    private const double WarmDryingStart = .6, WarmthOffset = .12;
    private const double ElevationCooling = .95, ThermalVariation = .5;

    internal static (float Moisture, float Temperature) Sample(int x, int y, uint seed,
        double relativeHeight, double globalMoisture, double globalWarmth)
    {
        var humidity = TerrainComposer.Fbm(x / HumidityWavelength + 11, y / HumidityWavelength + 23, seed ^ HumiditySalt, Octaves);
        var thermal = TerrainComposer.Fbm(x / ThermalWavelength + 17, y / ThermalWavelength + 31, seed ^ ThermalSalt, Octaves);
        var moisture = (float)Math.Clamp(globalMoisture + MoistureVariation * (humidity - .5)
            - ElevationDrying * relativeHeight - WarmDrying * Math.Max(0, globalWarmth - WarmDryingStart), 0, 1);
        var temperature = (float)Math.Clamp(globalWarmth + WarmthOffset - ElevationCooling * relativeHeight
            + ThermalVariation * (thermal - .5), 0, 1);
        return (moisture, temperature);
    }
}
