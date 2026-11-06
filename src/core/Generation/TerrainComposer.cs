namespace WorldGenerator.Core;

/// <summary>Versioned v3 composition. Keep arithmetic order aligned with LANDSCAPE_V3.md.</summary>
internal static class TerrainComposer
{
    internal static double Compose(double x, double y, uint seed, TerrainRequest input)
    {
        var wx = x + input.WarpStrength * (2 * Fbm(x * .35 + 17, y * .35 + 31, seed ^ 0xA341316Cu, 3) - 1);
        var wy = y + input.WarpStrength * (2 * Fbm(x * .35 + 47, y * .35 + 13, seed ^ 0xC8013EA4u, 3) - 1);
        var region = Region(wx, wy, seed, input.LandformRegionScale);
        var (plains, hills, mountains) = Weights(region, input.PlainsCoverage, input.MountainCoverage);
        var basis = .08 + .26 * Fbm(wx * .18, wy * .18, seed ^ 0xAD90777Du, input.HeightMap.Octaves);
        var rolling = Fbm(wx * .6, wy * .6, seed ^ 0x68E31DA4u, input.HeightMap.Octaves);
        var detail = Fbm(wx * 2, wy * 2, seed ^ 0x9E3779B9u, input.HeightMap.Octaves);
        var ridge = 1 - Math.Abs(2 * Fbm(wx * .8, wy * .8, seed ^ 0x7E95761Eu, input.HeightMap.Octaves) - 1);
        ridge = ridge * ridge * ridge;
        return Blend(basis, rolling, detail, ridge, plains, hills, mountains, input.MountainStrength);
    }

    internal static double Region(double x, double y, uint seed, double scale) =>
        Math.Clamp(2 * (Fbm(x * .65 / scale, y * .65 / scale, seed ^ 0xD1B54A35u, 3) - .25), 0, 1);

    internal static double Blend(double basis, double rolling, double detail, double ridge,
        double plains, double hills, double mountains, double strength) => Math.Clamp(
        plains * (basis + .012 * (2 * rolling - 1) + .003 * (2 * detail - 1)) +
        hills * (basis + .07 + .13 * rolling + .015 * detail) +
        mountains * (basis + .10 + .62 * strength * ridge + .025 * detail), 0, 1);

    internal static (double Plains, double Hills, double Mountains) Weights(double region, double p, double m)
    {
        var plains = p == 0 ? 0 : p == 1 ? 1 : 1 - Smooth(p - .08, p + .08, region);
        var mountains = m == 0 ? 0 : m == 1 ? 1 : Smooth(1 - m - .08, 1 - m + .08, region);
        return (plains, Math.Max(0, 1 - plains - mountains), mountains);
    }

    private static double Smooth(double a, double b, double value)
    {
        var t = Math.Clamp((value - a) / (b - a), 0, 1);
        return t * t * (3 - 2 * t);
    }

    internal static double Fbm(double x, double y, uint seed, int octaves)
    {
        double sum = 0, amplitudeSum = 0, amplitude = 1, frequency = 1;
        for (var octave = 0; octave < octaves; octave++)
        {
            sum += ValueNoise.Sample(x * frequency, y * frequency, seed) * amplitude;
            amplitudeSum += amplitude; frequency *= 2; amplitude *= .5;
        }
        return Math.Clamp(sum / amplitudeSum, 0, 1);
    }
}
