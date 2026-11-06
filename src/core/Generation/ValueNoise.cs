namespace WorldGenerator.Core;

/// <summary>Deterministic lattice noise used by the terrain composer.</summary>
internal static class ValueNoise
{
    internal static double Sample(double x, double y, uint seed)
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

    internal static double LatticeValue(int x, int y, uint seed)
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
