namespace WorldGenerator.Core;

/// <summary>Bounded world-grid detail before erosion; frozen equations in docs/specs/LOCAL_RELIEF_V1.md.</summary>
internal static class LocalRelief
{
    internal const double MaxAmplitude = .041;
    private const double MaskSpacing = 96, HillSpacing = 32, DetailSpacing = 16, BendSpacing = 64;
    private const double PlainHillAmplitude = .008, PlainDetailAmplitude = .0015;
    private const double HillAmplitude = .025, HillDetailAmplitude = .006;
    private const double GrooveAmplitude = .035, MountainDetailAmplitude = .006, HeadroomWidth = .05;
    private const uint MaskSalt = 0x243F6A89u, HillSalt = 0x85A308D3u, DetailSalt = 0x13198A2Eu;
    private const uint BendSalt = 0x03707344u, GrooveSalt = 0xA4093822u;

    internal static double PlainMask(double x, double z, uint seed) =>
        Smooth(.48, .72, TerrainComposer.Fbm(x / MaskSpacing + 17, z / MaskSpacing + 31, seed ^ MaskSalt, 2));

    internal static double Sample(double x, double z, uint seed, double plains, double hills,
        double mountains, double ridge, double strength)
    {
        var mask = PlainMask(x, z, seed);
        var hill = 2 * TerrainComposer.Fbm(x / HillSpacing + 47, z / HillSpacing + 13, seed ^ HillSalt, 2) - 1;
        var detail = 2 * TerrainComposer.Fbm(x / DetailSpacing + 29, z / DetailSpacing + 53, seed ^ DetailSalt, 2) - 1;
        var plain = mask * (PlainHillAmplitude * hill + PlainDetailAmplitude * detail);
        var rolling = HillAmplitude * hill + HillDetailAmplitude * detail;
        var gate = Smooth(.08, .25, ridge) * (1 - Smooth(.70, .90, ridge));
        double mountain = 0;
        if (mountains > 0 && strength > 0 && gate > 0)
        {
            var bend = 2 * ValueNoise.Sample(x / BendSpacing + 7, z / BendSpacing + 19, seed ^ BendSalt) - 1;
            var u = (.8 * x + .6 * z) / 12 + .35 * bend + 13;
            var v = (-.6 * x + .8 * z) / 40 + 43;
            var channel = Smooth(.35, .75, ValueNoise.Sample(u, v, seed ^ GrooveSalt));
            mountain = strength * gate * (-GrooveAmplitude * channel + MountainDetailAmplitude * detail);
        }
        return (plains * plain + hills * rolling) + mountains * mountain;
    }

    internal static double Apply(double basis, double delta)
    {
        var headroom = Math.Min(1, Math.Min(basis, 1 - basis) / HeadroomWidth);
        return Math.Clamp(basis + delta * headroom, 0, 1);
    }
    private static double Smooth(double a, double b, double n)
    {
        var t = Math.Clamp((n - a) / (b - a), 0, 1);
        return t * t * (3 - 2 * t);
    }
}
