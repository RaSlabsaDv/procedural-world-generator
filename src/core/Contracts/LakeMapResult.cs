namespace WorldGenerator.Core;

public sealed record LakeBasin(int Id, float WaterLevel, int CellCount, int PrimarySpillFrom, int PrimarySpillTo);

/// <summary>Static selected basins; packed source indices reuse existing drainage receivers.</summary>
public sealed record LakeMapResult(int[] LakeIdByCell, LakeBasin[] Basins, int[] SpillFromCells,
    int[] RiverCrossingFromCells, string AlgorithmVersion);
