namespace WorldGenerator.Core;

/// <summary>Selected drainage cells; connectivity reuses HydrologyResult receivers.</summary>
public sealed record RiverNetworkResult(int[] CellIndices, float[] Widths, string AlgorithmVersion);
