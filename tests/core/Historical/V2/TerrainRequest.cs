namespace WorldGenerator.Core.Tests.Historical.V2;

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
    string AlgorithmVersion);

