namespace WorldGenerator.Core;

public static class TerrainLimits
{
    public const string AlgorithmVersion = "diverse-landscape-v10";
    public const int MaxTrees = 16384;
    public const int MaxRocks = 8192;
    public const string ResultVersion = "landscape-ecology-v11";
    public const string Workload = "landscape-ecology-hydraulic-v11";
    public const string ExecutionProfile = "landscape-worker-json-v11";
    public const string SimulationVersion = "hydraulic-grid-v1";
    public const int MaxIterations = 2048;
    public const long MaxCellIterations = 33_554_432;
    public const double MinLandformRegionScale = .25;
    public const double MaxLandformRegionScale = 4;
    public const double MaxWarpStrength = 8;
}

