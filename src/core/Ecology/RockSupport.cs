namespace WorldGenerator.Core;

/// <summary>Exact extrema of a world-space footprint over the rendered triangle mesh.</summary>
internal static class RockSupport
{
    internal static bool Try(float[] values, LandscapeBiome[] biomes, float[] slopes,
        int width, int height, double x, double z, double radius, out (double Min, double Max) range)
    {
        range = (double.PositiveInfinity, double.NegativeInfinity);
        var x0 = x - radius; var x1 = x + radius; var z0 = z - radius; var z1 = z + radius;
        if (x0 < 0 || z0 < 0 || x1 > width - 1 || z1 > height - 1) return false;
        for (var cz = (int)Math.Floor(z0); cz < Math.Ceiling(z1); cz++)
            for (var cx = (int)Math.Floor(x0); cx < Math.Ceiling(x1); cx++)
            {
                var i = cz * width + cx;
                for (var corner = 0; corner < 4; corner++)
                {
                    var j = i + corner % 2 + corner / 2 * width;
                    if (biomes[j] == LandscapeBiome.Ocean || slopes[j] > RockPlacement.MaxSlope) return false;
                }
                var cell = Rectangle(values, width, i, Math.Max(0, x0 - cx), Math.Min(1, x1 - cx),
                    Math.Max(0, z0 - cz), Math.Min(1, z1 - cz));
                range = (Math.Min(range.Min, cell.Min), Math.Max(range.Max, cell.Max));
            }
        return true;
    }

    private static (double Min, double Max) Rectangle(float[] values, int width, int i, double x0, double x1, double z0, double z1)
    {
        var min = double.PositiveInfinity; var max = double.NegativeInfinity;
        Include(x0, z0); Include(x1, z0); Include(x0, z1); Include(x1, z1);
        Cross(x0, 1-x0); Cross(x1, 1-x1); Cross(1-z0, z0); Cross(1-z1, z1);
        return (min, max);
        void Cross(double x, double z) { if (x >= x0 && x <= x1 && z >= z0 && z <= z1) Include(x, z); }
        void Include(double x, double z)
        {
            var value = x+z <= 1
                ? values[i] + ((double)values[i+1]-values[i])*x + ((double)values[i+width]-values[i])*z
                : values[i+width+1] + ((double)values[i+width]-values[i+width+1])*(1-x) + ((double)values[i+1]-values[i+width+1])*(1-z);
            min = Math.Min(min, value); max = Math.Max(max, value);
        }
    }
}
