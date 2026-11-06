using System.Text.Json;
using System.Text.Json.Serialization.Metadata;
using WorldGenerator.Core;

namespace WorldGenerator.Hosts;

public sealed record TerrainWireRequest(HeightMapWireRequest? HeightMap, double? MountainStrength,
    double? WarpStrength, int? Iterations, double? Rainfall, double? Evaporation, double? PlainsCoverage, double? MountainCoverage, double? GlobalMoisture, double? SeaLevel, double? GlobalWarmth, double? VegetationDensity, double? LandformRegionScale, string? AlgorithmVersion);

public sealed record TerrainHostPreparation(ValidatedTerrainRequest? ValidatedRequest,
    TerrainRequest? Parameters, ErrorResponse? Error)
{
    public bool IsValid => ValidatedRequest is not null;
}

public sealed record TerrainGenerationResponse(TerrainMap Result, SimulationSummary Simulation,
    TerrainRequest Parameters, double ComputeMs, string CoreBuildId)
{
    public string Workload => TerrainLimits.Workload;
    public string ExecutionProfile => TerrainLimits.ExecutionProfile;
    public string SimulationVersion => TerrainLimits.SimulationVersion;
}

public static class TerrainTransport
{
    public static TerrainHostPreparation ParseAndPrepare(string json, JsonTypeInfo<TerrainWireRequest> typeInfo)
    {
        try { return Prepare(json is null ? null : JsonSerializer.Deserialize(json, typeInfo)); }
        catch (JsonException) { return new(null, null, ErrorResponse.InvalidJson()); }
    }

    public static async Task<TerrainHostPreparation> ParseAndPrepareAsync(Stream stream,
        JsonTypeInfo<TerrainWireRequest> typeInfo, CancellationToken cancellationToken)
    {
        try { return Prepare(await JsonSerializer.DeserializeAsync(stream, typeInfo, cancellationToken)); }
        catch (JsonException) { return new(null, null, ErrorResponse.InvalidJson()); }
    }

    private static TerrainHostPreparation Prepare(TerrainWireRequest? wire)
    {
        if (wire is null) return new(null, null, ErrorResponse.InvalidJson());
        if (new[] { wire.MountainStrength, wire.WarpStrength, wire.Rainfall, wire.Evaporation, wire.PlainsCoverage, wire.MountainCoverage, wire.GlobalMoisture, wire.SeaLevel, wire.GlobalWarmth, wire.VegetationDensity, wire.LandformRegionScale }
            .Any(v => v is { } number && !double.IsFinite(number)))
            return new(null, null, ErrorResponse.InvalidJson());
        var fields = new Dictionary<string, string>(StringComparer.Ordinal);
        var basePreparation = HeightMapTransport.Prepare(wire.HeightMap);
        if (!basePreparation.IsValid)
        {
            if (wire.HeightMap is null) fields["heightMap"] = "field.required: Required.";
            else if (basePreparation.Error!.Error == "invalid_json") return new(null, null, ErrorResponse.InvalidJson());
            else foreach (var field in basePreparation.Error!.Fields!) fields["heightMap." + field.Key] = field.Value;
        }
        Required("mountainStrength", wire.MountainStrength is null);
        Required("warpStrength", wire.WarpStrength is null);
        Required("iterations", wire.Iterations is null);
        Required("rainfall", wire.Rainfall is null);
        Required("evaporation", wire.Evaporation is null);
        Required("plainsCoverage", wire.PlainsCoverage is null);
        Required("mountainCoverage", wire.MountainCoverage is null);
        Required("globalMoisture", wire.GlobalMoisture is null);
        Required("seaLevel", wire.SeaLevel is null);
        Required("globalWarmth", wire.GlobalWarmth is null);
        Required("vegetationDensity", wire.VegetationDensity is null);
        Required("landformRegionScale", wire.LandformRegionScale is null);
        Required("algorithmVersion", wire.AlgorithmVersion is null);
        if (fields.Count > 0) return new(null, null, ErrorResponse.Validation(fields));
        var map = wire.HeightMap!;
        var request = new TerrainRequest(new(map.Seed!.Value, map.Width!.Value, map.Height!.Value,
            map.NoiseScale!.Value, map.Octaves!.Value, map.HeightMultiplier!.Value, map.AlgorithmVersion!),
            wire.MountainStrength!.Value, wire.WarpStrength!.Value, wire.Iterations!.Value,
            wire.Rainfall!.Value, wire.Evaporation!.Value, wire.PlainsCoverage!.Value, wire.MountainCoverage!.Value, wire.GlobalMoisture!.Value, wire.SeaLevel!.Value, wire.GlobalWarmth!.Value, wire.VegetationDensity!.Value, wire.LandformRegionScale!.Value, wire.AlgorithmVersion!);
        var preparation = TerrainValidator.Prepare(request);
        if (!preparation.IsValid)
        {
            foreach (var error in preparation.Errors)
                fields[error.Field] = fields.TryGetValue(error.Field, out var previous)
                    ? previous + "; " + error.Code + ": " + error.Message : error.Code + ": " + error.Message;
            return new(null, null, ErrorResponse.Validation(fields));
        }
        return new(preparation.ValidatedRequest, request, null);

        void Required(string field, bool missing)
        {
            if (missing) fields[field] = "field.required: Required.";
        }
    }
}
