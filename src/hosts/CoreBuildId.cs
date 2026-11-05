namespace WorldGenerator.Hosts;

/// <summary>
/// Shared Core build identity. The value is supplied by the host build target.
/// </summary>
public static partial class CoreBuildId
{
    /// <summary>
    /// Build-time revision identifier shared by both hosts for the same inputs.
    /// </summary>
    public static string Value => ValueCore;
}
