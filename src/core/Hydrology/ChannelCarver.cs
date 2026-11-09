namespace WorldGenerator.Core;

internal sealed record ChannelCarving(float[] Depth, ChannelShapingSummary Summary);

internal static class ChannelCarver
{
    internal const double AbsoluteCap = 1.5;
    internal const double RelativeCap = .03;
    internal const double BankHalo = .75;
    private const double BaseDepth = .002;
    private const double FlowDepth = .001;

    internal static ChannelCarving Apply(float[] values, TerrainRequest request) =>
        Apply(values, request, TerrainDrainage.Derive(values, request));

    internal static ChannelCarving Identity(float[] values)
    {
        double mass = 0; foreach (var value in values) mass += value;
        return new(new float[values.Length], new(mass, mass, 0));
    }

    internal static ChannelCarving Apply(float[] values, TerrainRequest request, DrainageAnalysis preliminary)
    {
        var map = request.HeightMap; var n = values.Length; var w = map.Width; var h = map.Height;
        var cap = Math.Min(AbsoluteCap, RelativeCap * map.HeightMultiplier);
        var protect = new byte[n]; var width = new float[n]; var planned = values.ToArray(); var proposals = new double[n];
        for (var i = 0; i < n; i++)
        {
            var x = i % w; var y = i / w;
            if (x == 0 || y == 0 || x == w - 1 || y == h - 1) protect[i] = 1;
            if (!preliminary.Ocean[i] && preliminary.Lakes.LakeIdByCell[i] < 0) continue;
            for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++)
            {
                var nx = x + dx; var ny = y + dy;
                if (nx >= 0 && nx < w && ny >= 0 && ny < h) protect[ny * w + nx] = 1;
            }
        }
        var threshold = RiverNetworkExtractor.Threshold(preliminary.Ocean.Count(o => !o));
        for (var k = 0; k < preliminary.Rivers.CellIndices.Length; k++)
        {
            var i = preliminary.Rivers.CellIndices[k]; width[i] = preliminary.Rivers.Widths[k];
            if (protect[i] != 0) continue;
            var cut = Math.Min(cap, map.HeightMultiplier * (BaseDepth + FlowDepth * Math.Sqrt(preliminary.Hydrology.FlowAccumulation[i] / (double)threshold)));
            planned[i] = Lower(values[i], values[i] - cut, cap);
        }
        // A receiver was processed before its source by priority-flood; reverse for propagation.
        for (var k = preliminary.ProcessingOrder.Length - 1; k >= 0; k--)
        {
            var i = preliminary.ProcessingOrder[k]; var next = preliminary.Hydrology.ReceiverIndex[i];
            if (width[i] == 0 || protect[i] != 0 || next < 0 || width[next] == 0 || protect[next] != 0) continue;
            planned[next] = MathF.Min(planned[next], Lower(values[next], planned[i], cap));
        }
        foreach (var i in preliminary.Rivers.CellIndices)
        {
            var cut = (double)values[i] - planned[i]; if (cut <= 0) continue;
            var half = width[i] * .5; var radius = half + BankHalo; var x = i % w; var y = i / w;
            for (var ny = Math.Max(0, (int)Math.Floor(y - radius)); ny <= Math.Min(h - 1, (int)Math.Ceiling(y + radius)); ny++)
                for (var nx = Math.Max(0, (int)Math.Floor(x - radius)); nx <= Math.Min(w - 1, (int)Math.Ceiling(x + radius)); nx++)
                {
                    var target = ny * w + nx; if (protect[target] != 0) continue;
                    var distance = Math.Sqrt((nx - x) * (nx - x) + (ny - y) * (ny - y));
                    var t = Math.Clamp((radius - distance) / BankHalo, 0, 1);
                    var falloff = t * t * t * (t * (t * 6 - 15) + 10);
                    proposals[target] = Math.Max(proposals[target], cut * falloff);
                }
        }
        var depth = new float[n]; double before = 0, after = 0, removed = 0;
        for (var i = 0; i < n; i++)
        {
            var original = values[i]; before += original;
            if (proposals[i] > 0) values[i] = Lower(original, original - proposals[i], cap);
            depth[i] = MathF.Max(0, original - values[i]); after += values[i]; removed += (double)original - values[i];
        }
        return new(depth, new(before, after, removed));
    }

    private static float Lower(float original, double target, double cap)
    {
        var lower = Math.Max(0, original - cap); var roundedLower = (float)lower;
        if (roundedLower < lower) roundedLower = MathF.BitIncrement(roundedLower);
        return Math.Clamp((float)target, roundedLower, original);
    }
}
