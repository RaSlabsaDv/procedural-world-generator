namespace WorldGenerator.Core;

/// <summary>Fixed-step conservative grid model specified in docs/TERRAIN_WORKLOAD.md.</summary>
internal static class HydraulicSimulation
{
    internal const double TimeStep = .2;
    private const double Conductivity = .25;
    private const double Capacity = 4;
    private const double ErosionRate = .25;
    private const double DepositionRate = .25;
    private const double MinimumSlope = .01;
    private const double Epsilon = 1e-12;
    private const double NegativeTolerance = 1e-10;

    internal static SimulationSummary Run(double[] terrain, int width, int height, double bound,
        int iterations, double rainfall, double evaporation)
    {
        var count = terrain.Length;
        var initialMass = terrain.Sum();
        var water = new double[count];
        var nextWater = new double[count];
        var sediment = new double[count];
        var nextSediment = new double[count];
        var flux = new double[count * 4];
        double evaporated = 0;
        for (var step = 0; step < iterations; step++)
        {
            for (var i = 0; i < count; i++)
                water[i] += rainfall * TimeStep;
            // All outgoing amounts use the same terrain/water snapshot.
            for (var y = 0; y < height; y++)
                for (var x = 0; x < width; x++)
                {
                    var i = y * width + x;
                    double total = 0;
                    for (var d = 0; d < 4; d++)
                    {
                        var neighbor = Neighbor(i, x, y, d, width, height);
                        var amount = neighbor < 0 ? 0 : TimeStep * Conductivity * Math.Max(0, (terrain[i] + water[i]) - (terrain[neighbor] + water[neighbor]));
                        flux[i * 4 + d] = amount;
                        total += amount;
                    }
                    var scale = total > 0 ? Math.Min(1, water[i] / total) : 1;
                    for (var d = 0; d < 4; d++) flux[i * 4 + d] *= scale;
                }
            // Exchange uses the pre-erosion slope snapshot; nextSediment is scratch for slope.
            for (var y = 0; y < height; y++)
                for (var x = 0; x < width; x++)
                {
                    var i = y * width + x;
                    var slope = 0.0;
                    for (var d = 0; d < 4; d++)
                    {
                        var neighbor = Neighbor(i, x, y, d, width, height);
                        if (neighbor >= 0) slope = Math.Max(slope, terrain[i] - terrain[neighbor]);
                    }
                    nextSediment[i] = slope;
                }
            for (var i = 0; i < count; i++)
            {
                var outgoing = flux[i * 4] + flux[i * 4 + 1] + flux[i * 4 + 2] + flux[i * 4 + 3];
                var capacity = Capacity * outgoing * Math.Max(nextSediment[i], MinimumSlope);
                if (sediment[i] > capacity)
                {
                    var deposit = Math.Min((sediment[i] - capacity) * DepositionRate, Math.Max(0, bound - terrain[i]));
                    terrain[i] += deposit;
                    sediment[i] -= deposit;
                }
                else
                {
                    var erode = Math.Min((capacity - sediment[i]) * ErosionRate, terrain[i]);
                    terrain[i] -= erode;
                    sediment[i] += erode;
                }
            }
            Array.Clear(nextWater);
            Array.Clear(nextSediment);
            for (var y = 0; y < height; y++)
                for (var x = 0; x < width; x++)
                {
                    var i = y * width + x;
                    double outWater = 0, outSediment = 0;
                    for (var d = 0; d < 4; d++)
                    {
                        var neighbor = Neighbor(i, x, y, d, width, height);
                        if (neighbor < 0) continue;
                        var amount = flux[i * 4 + d];
                        var movedSediment = water[i] > Epsilon ? sediment[i] * (amount / water[i]) : 0;
                        nextWater[neighbor] += amount;
                        nextSediment[neighbor] += movedSediment;
                        outWater += amount;
                        outSediment += movedSediment;
                    }
                    nextWater[i] += Nonnegative(water[i] - outWater);
                    nextSediment[i] += Nonnegative(sediment[i] - outSediment);
                }
            for (var i = 0; i < count; i++)
            {
                var loss = nextWater[i] * evaporation * TimeStep;
                evaporated += loss;
                nextWater[i] = Nonnegative(nextWater[i] - loss);
                nextSediment[i] = Nonnegative(nextSediment[i]);
                if (!double.IsFinite(terrain[i]) || terrain[i] < 0 || terrain[i] > bound)
                    throw new InvalidOperationException("Hydraulic terrain state is invalid.");
            }
            (water, nextWater) = (nextWater, water);
            (sediment, nextSediment) = (nextSediment, sediment);
        }
        return new(iterations, (long)count * iterations, initialMass, terrain.Sum(), sediment.Sum(),
            rainfall * TimeStep * count * iterations, water.Sum(), evaporated);
    }

    private static double Nonnegative(double value)
    {
        if (!double.IsFinite(value) || value < -NegativeTolerance)
            throw new InvalidOperationException("Hydraulic water or sediment state is invalid.");
        return Math.Max(0, value);
    }

    private static int Neighbor(int i, int x, int y, int direction, int width, int height) => direction switch
    {
        0 => x > 0 ? i - 1 : -1,
        1 => x + 1 < width ? i + 1 : -1,
        2 => y > 0 ? i - width : -1,
        _ => y + 1 < height ? i + width : -1
    };
}
