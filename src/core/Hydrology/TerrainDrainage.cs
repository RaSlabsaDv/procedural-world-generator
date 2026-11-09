namespace WorldGenerator.Core;

internal sealed record DrainageAnalysis(bool[] Ocean, HydrologyResult Hydrology, RiverNetworkResult Rivers,
    LakeMapResult Lakes, int[] ProcessingOrder);

internal static class TerrainDrainage
{
    internal static DrainageAnalysis Derive(float[] values, TerrainRequest request)
    {
        var map = request.HeightMap;
        var ocean = OceanClassifier.Ocean(values, map.Width, map.Height, request.SeaLevel * (float)map.HeightMultiplier);
        var mask = Array.ConvertAll(ocean, value => value ? LandscapeBiome.Ocean : LandscapeBiome.Grassland);
        var hydrology = HydrologyAnalyzer.Analyze(values, mask, map.Width, map.Height, out var surface, out var order);
        var rivers = RiverNetworkExtractor.Extract(hydrology, mask);
        var lakes = LakeBasinAnalyzer.Analyze(values, surface, mask, hydrology, rivers, map.Width, map.Height, map.HeightMultiplier);
        return new(ocean, hydrology, rivers, lakes, order);
    }
}
