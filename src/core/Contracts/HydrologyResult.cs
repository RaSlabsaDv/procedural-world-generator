namespace WorldGenerator.Core;

/// <summary>Drainage analysis only: depression depth is not displayed lake water.</summary>
public sealed record HydrologyResult(int[] ReceiverIndex, uint[] FlowAccumulation,
    float[] DepressionDepth, string AlgorithmVersion);
