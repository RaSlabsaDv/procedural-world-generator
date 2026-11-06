namespace WorldGenerator.Core.Tests.Historical.V2;

/// <summary>Static four-connected sea classification; never fills inland depressions.</summary>
internal static class OceanClassifier
{
    internal static bool[] Ocean(float[] values, int width, int height, double sea)
    {
        var ocean = new bool[values.Length]; var queue = new Queue<int>();
        for (var i = 0; i < values.Length; i++)
            if ((i < width || i >= width * (height - 1) || i % width == 0 || i % width == width - 1) && values[i] <= sea)
            { ocean[i] = true; queue.Enqueue(i); }
        while (queue.TryDequeue(out var i))
        {
            var x = i % width; var y = i / width;
            Visit(x > 0 ? i - 1 : -1); Visit(x + 1 < width ? i + 1 : -1);
            Visit(y > 0 ? i - width : -1); Visit(y + 1 < height ? i + width : -1);
        }
        return ocean;
        void Visit(int j)
        {
            if (j >= 0 && !ocean[j] && values[j] <= sea) { ocean[j] = true; queue.Enqueue(j); }
        }
    }
}
