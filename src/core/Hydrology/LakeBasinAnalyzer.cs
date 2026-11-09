namespace WorldGenerator.Core;

internal static class LakeBasinAnalyzer
{
    internal const string AlgorithmVersion = "lake-basins-v1";
    internal const int MinimumArea = 16;
    internal const int MaxLakes = 64;
    internal const int AreaPercent = 8;
    internal const double MinimumDepthFraction = .01;
    private const int Unvisited = -1;
    private const int UnvisitedRiver = -2;
    private readonly record struct Candidate(int Root, float Level, int Count, float Depth, uint Flow);

    internal static LakeMapResult Analyze(ReadOnlySpan<float> heights, ReadOnlySpan<float> surface,
        ReadOnlySpan<LandscapeBiome> biomes, HydrologyResult hydrology, RiverNetworkResult rivers,
        int width, int height, double heightMultiplier)
    {
        ArgumentNullException.ThrowIfNull(hydrology);
        ArgumentNullException.ThrowIfNull(rivers);
        var count = heights.Length;
        if (width < HeightMapLimits.MinWidth || width > HeightMapLimits.MaxWidth ||
            height < HeightMapLimits.MinHeight || height > HeightMapLimits.MaxHeight ||
            width * height != count || surface.Length != count || biomes.Length != count ||
            hydrology.ReceiverIndex.Length != count || hydrology.FlowAccumulation.Length != count ||
            hydrology.DepressionDepth.Length != count || hydrology.AlgorithmVersion != HydrologyAnalyzer.AlgorithmVersion ||
            rivers.CellIndices.Length != rivers.Widths.Length || rivers.AlgorithmVersion != RiverNetworkExtractor.AlgorithmVersion ||
            !double.IsFinite(heightMultiplier) || heightMultiplier < 0 || heightMultiplier > HeightMapLimits.MaxHeightMultiplier)
            throw new ArgumentException("Lake input must match finalized drainage.");

        var labels = new int[count];
        Array.Fill(labels, Unvisited);
        foreach (var cell in rivers.CellIndices) labels[cell] = UnvisitedRiver;
        var queue = new int[count];
        var candidates = new Candidate[count / MinimumArea];
        var candidateCount = 0;
        var land = 0;
        for (var i = 0; i < count; i++) if (biomes[i] != LandscapeBiome.Ocean) land++;
        var budget = land * AreaPercent / 100;
        for (var root = 0; root < count; root++)
        {
            if (labels[root] >= 0 || biomes[root] == LandscapeBiome.Ocean || hydrology.DepressionDepth[root] <= 0) continue;
            var level = surface[root];
            var head = 0;
            var tail = 1;
            var fed = labels[root] == UnvisitedRiver;
            var depth = hydrology.DepressionDepth[root];
            var flow = hydrology.FlowAccumulation[root];
            labels[root] = root;
            queue[0] = root;
            while (head < tail)
            {
                var cell = queue[head++];
                depth = MathF.Max(depth, hydrology.DepressionDepth[cell]);
                flow = Math.Max(flow, hydrology.FlowAccumulation[cell]);
                var x = cell % width;
                var y = cell / width;
                for (var dy = -1; dy <= 1; dy++)
                    for (var dx = -1; dx <= 1; dx++)
                    {
                        var nx = x + dx;
                        var ny = y + dy;
                        if ((dx == 0 && dy == 0) || nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
                        var next = ny * width + nx;
                        if (labels[next] >= 0 || biomes[next] == LandscapeBiome.Ocean ||
                            hydrology.DepressionDepth[next] <= 0 || surface[next] != level) continue;
                        fed |= labels[next] == UnvisitedRiver;
                        labels[next] = root;
                        queue[tail++] = next;
                    }
            }
            if (tail >= MinimumArea && tail <= budget && fed && depth >= MinimumDepthFraction * heightMultiplier)
                candidates[candidateCount++] = new(root, level, tail, depth, flow);
        }

        var chosen = new Candidate[Math.Min(MaxLakes, candidateCount)];
        var selected = 0;
        while (selected < chosen.Length)
        {
            var best = -1;
            for (var i = 0; i < candidateCount; i++)
                if (candidates[i].Count > 0 && candidates[i].Count <= budget &&
                    (best < 0 || Better(candidates[i], candidates[best]))) best = i;
            if (best < 0) break;
            chosen[selected++] = candidates[best];
            budget -= candidates[best].Count;
            candidates[best] = candidates[best] with { Count = 0 };
        }
        Array.Sort(chosen, 0, selected, Comparer<Candidate>.Create((a, b) => a.Root.CompareTo(b.Root)));
        var ids = new Dictionary<int, int>(selected);
        for (var i = 0; i < selected; i++) ids.Add(chosen[i].Root, i);
        for (var i = 0; i < count; i++) labels[i] = ids.TryGetValue(labels[i], out var id) ? id : Unvisited;

        var primary = new int[selected];
        Array.Fill(primary, Unvisited);
        var exits = 0;
        for (var i = 0; i < count; i++)
        {
            var id = labels[i];
            var next = hydrology.ReceiverIndex[i];
            if (id < 0 || (next >= 0 && labels[next] == id)) continue;
            exits++;
            var old = primary[id];
            if (old < 0 || hydrology.FlowAccumulation[i] > hydrology.FlowAccumulation[old]) primary[id] = i;
            // Ascending traversal already resolves equal-flow ties by source index.
        }
        var spill = new int[exits];
        var cursor = 0;
        for (var i = 0; i < count; i++)
        {
            var next = hydrology.ReceiverIndex[i];
            if (labels[i] >= 0 && (next < 0 || labels[next] != labels[i])) spill[cursor++] = i;
        }
        var crossingCount = 0;
        foreach (var cell in rivers.CellIndices)
            if (Crosses(labels, hydrology.ReceiverIndex, cell)) crossingCount++;
        var crossings = new int[crossingCount];
        cursor = 0;
        foreach (var cell in rivers.CellIndices)
            if (Crosses(labels, hydrology.ReceiverIndex, cell)) crossings[cursor++] = cell;
        var basins = new LakeBasin[selected];
        for (var i = 0; i < selected; i++)
        {
            if (primary[i] < 0) throw new InvalidOperationException("A finalized lake must have a drainage exit.");
            basins[i] = new(i, chosen[i].Level, chosen[i].Count, primary[i], hydrology.ReceiverIndex[primary[i]]);
        }
        return new(labels, basins, spill, crossings, AlgorithmVersion);
    }

    private static bool Better(Candidate a, Candidate b) => a.Flow > b.Flow ||
        (a.Flow == b.Flow && (a.Depth > b.Depth || (a.Depth == b.Depth && a.Root < b.Root)));

    private static bool Crosses(int[] ids, int[] receiver, int cell)
    {
        var next = receiver[cell];
        return next >= 0 && ids[cell] != ids[next] && (ids[cell] >= 0 || ids[next] >= 0);
    }
}
