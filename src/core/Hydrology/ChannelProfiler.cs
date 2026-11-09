namespace WorldGenerator.Core;

internal static class ChannelProfiler
{
    internal const string AlgorithmVersion = "river-channels-v1";
    internal const double MaximumSlope = .6;
    internal const double RelativeSlope = .05;
    internal const double WaterCutFraction = .5;
    internal const double RelativeWaterDepth = .01;

    internal static RiverChannelResult Derive(float[] values, TerrainRequest request, DrainageAnalysis final, ChannelCarving carving)
    {
        var n = values.Length; var k = final.Rivers.CellIndices.Length;
        var lookup = new int[n]; Array.Fill(lookup, -1);
        for (var i = 0; i < k; i++) lookup[final.Rivers.CellIndices[i]] = i;
        var node = values.ToArray();
        var surface = new float[k]; var state = new RiverChannelState[k];
        var sea = (float)(request.SeaLevel * (float)request.HeightMap.HeightMultiplier);
        var bound = (float)request.HeightMap.HeightMultiplier;
        var slope = Math.Min(MaximumSlope, RelativeSlope * request.HeightMap.HeightMultiplier);
        for (var i = 0; i < n; i++) if (final.Ocean[i]) node[i] = sea;
        foreach (var cell in final.ProcessingOrder)
        {
            var index = lookup[cell]; if (index < 0) continue;
            var lake = final.Lakes.LakeIdByCell[cell]; var next = final.Hydrology.ReceiverIndex[cell];
            var desired = lake >= 0 ? final.Lakes.Basins[lake].WaterLevel :
                (float)(values[cell] + Math.Min(WaterCutFraction * carving.Depth[cell], RelativeWaterDepth * request.HeightMap.HeightMultiplier));
            var water = desired;
            var feasible = true;
            if (next >= 0)
            {
                var required = MathF.Max(desired, node[next]);
                var upper = lake >= 0 ? desired : MathF.Min(bound, values[cell] + carving.Depth[cell]);
                if (required <= upper) water = required; else feasible = false;
            }
            node[cell] = water; surface[index] = water;
            if (next < 0) { state[index] = RiverChannelState.Boundary; continue; }
            var nextLake = final.Lakes.LakeIdByCell[next];
            if (lake >= 0 && nextLake == lake) { state[index] = RiverChannelState.Submerged; continue; }
            if (lake >= 0 && nextLake >= 0) continue;
            var dx = next % request.HeightMap.Width - cell % request.HeightMap.Width;
            var dy = next / request.HeightMap.Width - cell / request.HeightMap.Width;
            var drop = water - node[next];
            var tolerance = 1e-6 + 1e-5 * Math.Max(Math.Abs(water), Math.Abs(node[next]));
            if (feasible && drop >= -tolerance && drop <= slope * Math.Sqrt(dx * dx + dy * dy) + tolerance)
                state[index] = RiverChannelState.Exposed;
        }
        return new(carving.Depth, surface, state, carving.Summary, AlgorithmVersion);
    }
}
