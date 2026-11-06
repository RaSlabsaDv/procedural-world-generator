namespace WorldGenerator.Core;

public sealed record SimulationSummary(
    int Iterations, long CellIterations, double InitialTerrainMass, double FinalTerrainMass,
    double SuspendedSediment, double WaterAdded, double WaterRemaining, double WaterEvaporated);
public sealed record TerrainResult(TerrainMap HeightMap, SimulationSummary Simulation);

