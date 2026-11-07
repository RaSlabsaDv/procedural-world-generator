namespace WorldGenerator.Core;

public enum RockKind { Boulder = 0, Outcrop = 1, Scree = 2 }
public enum RockVariant { Angular = 0, Rounded = 1 }
/// <summary>Embedded unit-radius geometry; GroundY is the exact triangle height at X/Z.</summary>
public sealed record RockInstance(int CellIndex, float X, float Y, float Z,
    float ScaleX, float ScaleY, float ScaleZ, float Rotation, float GroundY, RockKind Kind, RockVariant Variant);
