namespace WorldGenerator.Core.Tests.Historical.V10;

/// <summary>Context-sensitive final coverage; frozen arithmetic in COASTAL_SURFACES_V2.md.</summary>
internal static class CoastalSurfaces
{
    internal const byte MaxDistance = 16, Unreached = byte.MaxValue;
    private const double GentleSlopeStart = .15, GentleSlopeEnd = .60, WetWidthReduction = .35;
    private const double FullDistanceBase = 1, FullDistanceGain = 3, EndDistanceBase = 6, EndDistanceGain = 10;
    private const double FullElevationBase = .005, FullElevationGain = .015, EndElevationBase = .03, EndElevationGain = .07;
    private const double RockStart = .35, RockEnd = .90;
    private const double WarmStart = .20, WarmEnd = .50, WetStart = .65, WetEnd = .90;
    private const double GrassMoistureStart = .30, GrassMoistureEnd = .65, GrassWarmStart = .20, GrassWarmEnd = .40;
    private const double BaseSand = .45, WarmSand = .45, WetReduction = .65;

    internal static byte[] Distances(bool[] ocean, int width, int height)
    {
        var distances = new byte[ocean.Length]; Array.Fill(distances, Unreached);
        var queue = new int[ocean.Length]; var tail = 0;
        for (var i = 0; i < ocean.Length; i++)
        {
            if (ocean[i]) { distances[i] = 0; continue; }
            var x = i % width; var z = i / width;
            if ((x > 0 && ocean[i - 1]) || (x < width - 1 && ocean[i + 1]) ||
                (z > 0 && ocean[i - width]) || (z < height - 1 && ocean[i + width]))
            { distances[i] = 1; queue[tail++] = i; }
        }
        for (var head = 0; head < tail; head++)
        {
            var i = queue[head]; if (distances[i] == MaxDistance) continue;
            var next = (byte)(distances[i] + 1); var x = i % width; var z = i / width;
            if (x > 0) Visit(i - 1); if (x < width - 1) Visit(i + 1);
            if (z > 0) Visit(i - width); if (z < height - 1) Visit(i + width);
            void Visit(int j) { if (distances[j] == Unreached) { distances[j] = next; queue[tail++] = j; } }
        }
        return distances;
    }

    internal static void Apply(float[] weights, float[] heights, bool[] ocean, float[] moisture,
        float[] temperature, float[] slopes, int width, int height, float bound, double seaLevel)
    {
        if (bound == 0) return;
        var distances = Distances(ocean, width, height);
        var sea = seaLevel * bound;
        for (var i = 0; i < heights.Length; i++)
        {
            if (ocean[i] || heights[i] <= sea || distances[i] == Unreached) continue;
            Blend(weights.AsSpan(i * SurfaceCoverage.ChannelCount, SurfaceCoverage.ChannelCount), distances[i],
                ((double)heights[i] - sea) / bound, moisture[i], temperature[i], slopes[i]);
        }
    }

    internal static void Blend(Span<float> weights, byte distance, double elevation, float moisture, float temperature, float slope)
    {
        if (distance == 0 || distance >= MaxDistance || elevation <= 0) return;
        var wet = Smooth(WetStart, WetEnd, moisture);
        var room = (1 - Smooth(GentleSlopeStart, GentleSlopeEnd, slope)) * (1 - WetWidthReduction * wet);
        var influence = (1 - Smooth(FullDistanceBase + FullDistanceGain * room, EndDistanceBase + EndDistanceGain * room, distance))
            * (1 - Smooth(FullElevationBase + FullElevationGain * room, EndElevationBase + EndElevationGain * room, elevation));
        if (influence == 0) return;
        var rock = Smooth(RockStart, RockEnd, slope);
        var sand = (BaseSand + WarmSand * Smooth(WarmStart, WarmEnd, temperature)) * (1 - WetReduction * wet);
        var grass = Smooth(GrassMoistureStart, GrassMoistureEnd, moisture) * Smooth(GrassWarmStart, GrassWarmEnd, temperature);
        var available = 1 - (double)weights[4];
        var ground = available * (1 - rock);
        Write(weights, 0, ground * (1 - sand) * grass, influence);
        Write(weights, 1, ground * (1 - sand) * (1 - grass), influence);
        Write(weights, 2, ground * sand, influence);
        Write(weights, 3, available * rock, influence);
        // Snow is intentionally not rewritten; no repairs or renormalization.
    }
    private static void Write(Span<float> weights, int channel, double target, double influence) =>
        weights[channel] = (float)((double)weights[channel] + (target - weights[channel]) * influence);

    private static double Smooth(double a, double b, double x) => SurfaceCoverage.Smooth(a, b, x);
}
