namespace WorldGenerator.Core;

public enum LandscapeBiome { Ocean = 0, Grassland = 1, BroadleafForest = 2, DryGrassland = 3, Rock = 4, ConiferForest = 5, Savanna = 6, Tundra = 7, SnowHighlands = 8 }
public enum TreeKind { Broadleaf = 0, Conifer = 1, Savanna = 2 }
public sealed record TreeInstance(int CellIndex, float X, float Y, float Z, float Scale, float Rotation, TreeKind Kind);
public sealed record TerrainMap(int Width, int Height, float[] Values, string AlgorithmVersion,
    LandscapeBiome[] Biomes, string ResultVersion, float[] Moisture, float[] Temperature,
    float[] Slope, float[] VegetationDensity, TreeInstance[] Trees, float[] SurfaceWeights);
