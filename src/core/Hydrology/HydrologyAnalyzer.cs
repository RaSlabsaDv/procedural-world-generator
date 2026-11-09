namespace WorldGenerator.Core;

internal static class HydrologyAnalyzer
{
    internal const string AlgorithmVersion = "d8-priority-flood-v1";
    private const int Undiscovered = -2;
    private const int Terminal = -1;

    internal static HydrologyResult Analyze(ReadOnlySpan<float> heights,
        ReadOnlySpan<LandscapeBiome> biomes, int width, int height)
        => Analyze(heights, biomes, width, height, out _);

    // Retain the authoritative surface for downstream analysis without recomputation.
    internal static HydrologyResult Analyze(ReadOnlySpan<float> heights,
        ReadOnlySpan<LandscapeBiome> biomes, int width, int height, out float[] spillSurface)
        => Analyze(heights, biomes, width, height, out spillSurface, out _);

    internal static HydrologyResult Analyze(ReadOnlySpan<float> heights,
        ReadOnlySpan<LandscapeBiome> biomes, int width, int height, out float[] spillSurface, out int[] processingOrder)
    {
        if (width < HeightMapLimits.MinWidth || width > HeightMapLimits.MaxWidth ||
            height < HeightMapLimits.MinHeight || height > HeightMapLimits.MaxHeight)
            throw new ArgumentOutOfRangeException(nameof(width));
        var count = width * height;
        if (heights.Length != count || biomes.Length != count)
            throw new ArgumentException("Hydrology input dimensions do not match.");
        for (var i = 0; i < count; i++)
            if (!float.IsFinite(heights[i]) || heights[i] < 0 || heights[i] > HeightMapLimits.MaxHeightMultiplier ||
                (uint)biomes[i] > (uint)LandscapeBiome.SnowHighlands)
                throw new ArgumentException("Invalid hydrology input.");
        var receiver = new int[count];
        Array.Fill(receiver, Undiscovered);
        var accumulation = new uint[count];
        var depth = new float[count];
        var filled = new float[count];
        spillSurface = filled;
        var order = new int[count];
        processingOrder = order;
        var heap = new CellHeap(count, filled);
        for (var i = 0; i < count; i++)
        {
            var ocean = biomes[i] == LandscapeBiome.Ocean;
            accumulation[i] = ocean ? 0u : 1u;
            var x = i % width;
            var y = i / width;
            if (!ocean && x != 0 && x != width - 1 && y != 0 && y != height - 1) continue;
            receiver[i] = Terminal;
            filled[i] = heights[i];
            heap.Push(i);
        }
        var processed = 0;
        while (heap.Count > 0)
        {
            var i = heap.Pop();
            order[processed++] = i;
            var x = i % width;
            var y = i / width;
            for (var dy = -1; dy <= 1; dy++)
                for (var dx = -1; dx <= 1; dx++)
                {
                    var nx = x + dx;
                    var ny = y + dy;
                    if ((dx == 0 && dy == 0) || nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
                    var next = ny * width + nx;
                    if (receiver[next] != Undiscovered) continue;
                    receiver[next] = i;
                    filled[next] = MathF.Max(heights[next], filled[i]);
                    heap.Push(next);
                }
        }
        for (var n = count - 1; n >= 0; n--)
        {
            var i = order[n];
            var next = receiver[i];
            if (next != Terminal) accumulation[next] += accumulation[i];
            depth[i] = MathF.Max(0, filled[i] - heights[i]);
        }
        return new(receiver, accumulation, depth, AlgorithmVersion);
    }

    // Fixed capacity and index-only nodes; priorities never change after enqueue.
    private sealed class CellHeap(int capacity, float[] levels)
    {
        private readonly int[] nodes = new int[capacity];
        internal int Count { get; private set; }
        private bool Less(int a, int b) => levels[a] < levels[b] || (levels[a] == levels[b] && a < b);
        internal void Push(int cell)
        {
            var i = Count++;
            while (i > 0)
            {
                var parent = (i - 1) / 2;
                if (!Less(cell, nodes[parent])) break;
                nodes[i] = nodes[parent];
                i = parent;
            }
            nodes[i] = cell;
        }
        internal int Pop()
        {
            var first = nodes[0];
            var last = nodes[--Count];
            if (Count == 0) return first;
            var i = 0;
            while (2 * i + 1 < Count)
            {
                var child = 2 * i + 1;
                if (child + 1 < Count && Less(nodes[child + 1], nodes[child])) child++;
                if (!Less(nodes[child], last)) break;
                nodes[i] = nodes[child];
                i = child;
            }
            nodes[i] = last;
            return first;
        }
    }
}
