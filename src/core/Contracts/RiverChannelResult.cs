namespace WorldGenerator.Core;

public enum RiverChannelState { Unsupported = 0, Exposed = 1, Submerged = 2, Boundary = 3 }
public sealed record ChannelShapingSummary(double BeforeTerrainMass, double AfterTerrainMass, double RemovedTerrainMass);
public sealed record RiverChannelResult(float[] CarveDepth, float[] WaterSurfaceHeight,
    RiverChannelState[] SegmentState, ChannelShapingSummary Summary, string AlgorithmVersion);
