namespace WorldGenerator.Core;

public sealed record TerrainRequest(
    HeightMapRequest HeightMap,
    double MountainStrength,
    double WarpStrength,
    int Iterations,
    double Rainfall,
    double Evaporation,
    double PlainsCoverage,
    double MountainCoverage,
    double GlobalMoisture,
    double SeaLevel,
    double GlobalWarmth,
    double VegetationDensity,
    double LandformRegionScale,
    string AlgorithmVersion);

