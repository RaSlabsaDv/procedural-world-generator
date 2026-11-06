namespace WorldGenerator.Core;

public enum LandscapeBiome { Ocean = 0, Grassland = 1, Forest = 2, DryGrassland = 3, Rock = 4 }
public sealed record TreeInstance(int CellIndex, float X, float Y, float Z, float Scale, float Rotation);
public sealed record TerrainMap(int Width, int Height, float[] Values, string AlgorithmVersion,
    LandscapeBiome[] Biomes, string ResultVersion, float[] Moisture, float[] Temperature,
    float[] Slope, float[] VegetationDensity, TreeInstance[] Trees);
