using System.Security.Cryptography;
using System.Text.Json;
using Xunit;

namespace WorldGenerator.Core.Tests.Historical.V3;

internal static class FrozenLandscape
{
    internal static void Verify()
    {
        foreach (var name in new[] { "landscape-v3-fingerprints.json", "landscape-v4-fingerprints.json" })
        {
            using var fixture = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", name)));
            foreach (var item in fixture.RootElement.GetProperty("cases").EnumerateArray())
            {
                var original = item.GetProperty("request").Deserialize<TerrainRequest>(new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
                var request = original with { AlgorithmVersion = TerrainLimits.AlgorithmVersion };
                var result = TerrainGenerator.Generate(request); var map = result.HeightMap;
                var hashes = item.GetProperty("hashes");
                Check("values", w => WriteFloats(w, map.Values));
                Check("moisture", w => WriteFloats(w, map.Moisture));
                Check("temperature", w => WriteFloats(w, map.Temperature));
                Check("slope", w => WriteFloats(w, map.Slope));
                Check("biomes", w => { foreach (var biome in map.Biomes) w.Write((byte)biome); });
                if (hashes.TryGetProperty("surfaceWeights", out _)) Check("surfaceWeights", w => WriteFloats(w, map.SurfaceWeights));
                Check("simulation", w => { var s = result.Simulation; w.Write(s.Iterations); w.Write(s.CellIterations); w.Write(s.InitialTerrainMass); w.Write(s.FinalTerrainMass); w.Write(s.SuspendedSediment); w.Write(s.WaterAdded); w.Write(s.WaterRemaining); w.Write(s.WaterEvaporated); });
                // Historical vegetation is regenerated only by frozen test-only rules; its original
                // expectations are never applied to the intentionally changed current policy.
                var oldDensity = new float[map.Values.Length];
                var seed = unchecked((uint)request.HeightMap.Seed);
                for (var i = 0; i < oldDensity.Length; i++)
                {
                    var px = (i % map.Width) * request.HeightMap.NoiseScale;
                    var py = (i / map.Width) * request.HeightMap.NoiseScale;
                    var patch = TerrainComposer.Fbm(px * 1.3, py * 1.3, seed ^ 0x85EBCA6Bu, 3);
                    oldDensity[i] = HistoricalDensity.Density(map.Biomes[i], map.Moisture[i], map.Slope[i], patch, request.VegetationDensity);
                }
                Check("vegetationDensity", w => WriteFloats(w, oldDensity));
                var oldTrees = HistoricalVegetation.PlaceTrees(map.Values, map.Biomes, map.Slope, oldDensity, map.Width, map.Height, seed);
                Check("trees", w => { foreach (var t in oldTrees) { w.Write(t.CellIndex); w.Write(t.X); w.Write(t.Y); w.Write(t.Z); w.Write(t.Scale); w.Write(t.Rotation); w.Write((int)t.Kind); } });
                Assert.Equal(item.GetProperty("treeCount").GetInt32(), oldTrees.Length);
                if (oldTrees.Length < TerrainLimits.MaxTrees)
                {
                    var previous = oldTrees.ToDictionary(tree => tree.CellIndex);
                    foreach (var tree in map.Trees)
                    {
                        Assert.True(previous.TryGetValue(tree.CellIndex, out var old));
                        Assert.Equal((old!.X, old.Y, old.Z, old.Scale, old.Rotation, old.Kind),
                            (tree.X, tree.Y, tree.Z, tree.Scale, tree.Rotation, tree.Kind));
                    }
                }
                void Check(string field, Action<BinaryWriter> write)
                {
                    using var buffer = new MemoryStream(); using var writer = new BinaryWriter(buffer);
                    write(writer); writer.Flush();
                    Assert.Equal(hashes.GetProperty(field).GetString(), Convert.ToHexString(SHA256.HashData(buffer.ToArray())).ToLowerInvariant());
                }
            }
        }
        static void WriteFloats(BinaryWriter writer, float[] values) { foreach (var value in values) writer.Write(value); }
    }
}
