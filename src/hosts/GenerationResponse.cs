using WorldGenerator.Core;

namespace WorldGenerator.Hosts;

/// <summary>
/// Host-owned transport envelope for a completed heightmap computation.
/// </summary>
/// <param name="Result">Generated heightmap result from Core.</param>
/// <param name="ComputeMs">
/// Generation time measured by the host after validation. It excludes serialization,
/// interop, transport, and rendering.
/// </param>
/// <param name="CoreBuildId">
/// Identifier for the shared Core revision used by the host, not the host build.
/// </param>
public sealed record GenerationResponse(HeightMapResult Result, double ComputeMs, string CoreBuildId)
{
    /// <summary>
    /// Fixed workload identifier. This is metadata, not a user-controlled request parameter.
    /// </summary>
    public string Workload => "heightmap+biomes";
}
