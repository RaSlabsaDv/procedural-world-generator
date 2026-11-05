namespace WorldGenerator.Core;

/// <summary>
/// Small deterministic computations for testing shared execution and bulk data transfer.
/// </summary>
public static class ComputationProbe
{
    /// <summary>
    /// Maximum number of samples returned by one call (1 MiB of float data).
    /// </summary>
    public const int MaxSampleCount = 262_144;

    /// <summary>
    /// Adds two integers, throwing rather than wrapping when the result exceeds Int32.
    /// </summary>
    /// <exception cref="OverflowException">The sum is outside the Int32 range.</exception>
    public static int Add(int left, int right) => checked(left + right);

    /// <summary>
    /// Returns deterministic float32 samples in [0, 1) for the supplied seed.
    /// Each nonempty result has independent storage. Zero count returns an empty array.
    /// </summary>
    /// <exception cref="ArgumentOutOfRangeException">
    /// Count is negative or exceeds <see cref="MaxSampleCount"/>.
    /// </exception>
    public static float[] GenerateSamples(int seed, int count)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(count);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(count, MaxSampleCount);

        if (count == 0)
        {
            return Array.Empty<float>();
        }

        var samples = new float[count];
        var state = unchecked((uint)seed);

        for (var index = 0; index < samples.Length; index++)
        {
            // Fixed modulo-2^32 sequence for transfer fixtures, not the terrain algorithm.
            state = unchecked(1_664_525u * state + 1_013_904_223u);

            // A 24-bit integer scaled by 2^-24 is exactly representable as float32.
            samples[index] = (state >> 8) * (1.0f / 16_777_216.0f);
        }

        return samples;
    }
}
