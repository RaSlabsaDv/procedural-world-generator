using System.Security.Cryptography;
using System.Text.Json;
using Xunit;

namespace WorldGenerator.Core.Tests;

public sealed class CoastalSurfacesV1Tests
{
    private readonly Xunit.Abstractions.ITestOutputHelper output;
    public CoastalSurfacesV1Tests(Xunit.Abstractions.ITestOutputHelper output) => this.output=output;

    [Fact]
    public void DistancesMatchIndependentRectangularReference()
    {
        var ocean=new bool[24];ocean[0]=ocean[17]=true;
        Assert.Equal(new byte[]{0,1,2,3,3,2,1,2,3,3,2,1,2,3,3,2,1,0,3,4,4,3,2,1},Historical.V8.CoastalSurfaces.Distances(ocean,6,4));
        Assert.Equal(2,Historical.V8.CoastalSurfaces.Distances(new[]{true,false,false,false},2,2)[3]);
        Assert.All(Historical.V8.CoastalSurfaces.Distances(new bool[6],3,2),d=>Assert.Equal(Historical.V8.CoastalSurfaces.Unreached,d));
        Assert.All(Historical.V8.CoastalSurfaces.Distances(Enumerable.Repeat(true,6).ToArray(),3,2),d=>Assert.Equal(0,d));
        var longMap=new bool[60];longMap[0]=true;var distances=Historical.V8.CoastalSurfaces.Distances(longMap,20,3);
        Assert.Equal(8,distances[8]);Assert.Equal(8,distances[27]);Assert.Equal(Historical.V8.CoastalSurfaces.Unreached,distances[28]);
    }

    [Fact]
    public void BlendMatchesIndependentFloat32LiteralsAndPreservesSnowBits()
    {
        float[] a=[.5f,.5f,0,0,0];Historical.V8.CoastalSurfaces.Blend(a,1,.005,.5f,.7f,.1f);
        Assert.Equal(new[]{.06064140051603317f,.03935860097408295f,.8999999761581421f,0,0},a);
        float[] b=[.2f,.3f,0,.4f,.1f];var snow=BitConverter.SingleToInt32Bits(b[4]);
        Historical.V8.CoastalSurfaces.Blend(b,4,.025,.8f,.25f,.6f);
        Assert.Equal(new[]{.12785761058330536f,.3053963780403137f,.07241453230381012f,.3943314850330353f,.10000000149011612f},b);
        Assert.Equal(snow,BitConverter.SingleToInt32Bits(b[4]));
        float[] c=[0,0,0,.2f,.8f];Historical.V8.CoastalSurfaces.Blend(c,2,.01,.65f,.15f,1.1f);
        Assert.Equal(new[]{0f,0,0,.19999998807907104f,.800000011920929f},c);
    }

    [Fact]
    public void GentleWarmDryShoresAreSandyAndSteepShoresRocky()
    {
        float[] warm=[.5f,.5f,0,0,0],cold=(float[])warm.Clone(),wet=(float[])warm.Clone();
        Historical.V8.CoastalSurfaces.Blend(warm,1,.005,.5f,.7f,.1f);
        Historical.V8.CoastalSurfaces.Blend(cold,1,.005,.5f,.1f,.1f);
        Historical.V8.CoastalSurfaces.Blend(wet,1,.005,1,.7f,.1f);
        Assert.True(warm[2]>=.85);Assert.True(cold[2]<warm[2]);Assert.True(wet[2]<warm[2]);Assert.True(wet[0]>warm[0]);
        float[] rock=[.5f,.5f,0,0,0];Historical.V8.CoastalSurfaces.Blend(rock,1,.005,.5f,.7f,.95f);
        Assert.Equal(new float[]{0,0,0,1,0},rock);
    }

    [Fact]
    public void InfluenceFadesWithoutRepairAndOriginalVectorsRemainExactOutside()
    {
        float[] baseline=[.2f,.3f,0,.4f,.1f];
        foreach(var distance in new byte[]{0,1,2,4,7,8,255})foreach(var elevation in new[]{-.01,0,.005,.01,.03,.05,.1})
        foreach(var moisture in new[]{0f,.5f,1f})foreach(var temperature in new[]{0f,.5f,1f})foreach(var slope in new[]{0f,.6f,1.5f})
        {
            var w=(float[])baseline.Clone();Historical.V8.CoastalSurfaces.Blend(w,distance,elevation,moisture,temperature,slope);
            Assert.All(w,v=>Assert.True(float.IsFinite(v)&&v>=0&&v<=1));Assert.InRange(Math.Abs(w.Sum(v=>(double)v)-1),0,1e-6);
            Assert.Equal(BitConverter.SingleToInt32Bits(baseline[4]),BitConverter.SingleToInt32Bits(w[4]));
            if(distance==0||distance>=8||elevation<=0||elevation>=.05)Assert.Equal(baseline,w);
        }
        float[] near=[.5f,.5f,0,0,0],far=(float[])near.Clone(),high=(float[])near.Clone();
        Historical.V8.CoastalSurfaces.Blend(near,1,.005,.5f,.7f,.1f);Historical.V8.CoastalSurfaces.Blend(far,7,.005,.5f,.7f,.1f);Historical.V8.CoastalSurfaces.Blend(high,1,.04,.5f,.7f,.1f);
        Assert.True(far[2]<near[2]);Assert.True(high[2]<near[2]);
    }

    [Fact]
    public void EqualityUsesAuthoritativeOceanAndDisconnectedLowPocketStaysDry()
    {
        const int w=9,h=7;var heights=Enumerable.Repeat(30f,w*h).ToArray();
        for(var z=0;z<h;z++)heights[z*w]=6;
        heights[3*w+1]=6.05f;heights[3*w+4]=1;
        var ocean=OceanClassifier.Ocean(heights,w,h,6);
        Assert.True(ocean[3*w]);Assert.False(ocean[3*w+4]);
        var biomes=ocean.Select(v=>v?LandscapeBiome.Ocean:LandscapeBiome.Grassland).ToArray();
        var moisture=Enumerable.Repeat(.5f,w*h).ToArray();var temp=Enumerable.Repeat(.7f,w*h).ToArray();var slopes=new float[w*h];
        var coverage=SurfaceCoverage.Derive(heights,biomes,moisture,temp,slopes,30);var original=(float[])coverage.Clone();
        Historical.V8.CoastalSurfaces.Apply(coverage,heights,ocean,moisture,temp,slopes,w,h,30,.2);
        Assert.True(coverage[(3*w+1)*5+2]>.85);
        Assert.Equal(original.AsSpan((3*w+4)*5,5).ToArray(),coverage.AsSpan((3*w+4)*5,5).ToArray());
        Assert.Equal(0,coverage[(3*w+4)*5+2]);Assert.Equal(1,heights[3*w+4]);
        foreach(var i in Enumerable.Range(0,heights.Length).Where(i=>ocean[i]))Assert.Equal(new float[5],coverage.AsSpan(i*5,5).ToArray());
        var unchanged=(float[])original.Clone();Historical.V8.CoastalSurfaces.Apply(unchanged,heights,new bool[w*h],moisture,temp,slopes,w,h,30,.2);Assert.Equal(original,unchanged);
        Historical.V8.CoastalSurfaces.Apply(unchanged,heights,ocean,moisture,temp,slopes,w,h,0,.2);Assert.Equal(original,unchanged);
    }

    [Fact]
    public void MaximumTraversalAllocatesOnlyDistanceAndQueueWithinBudget()
    {
        const int n=512;var ocean=Enumerable.Range(0,n*n).Select(i=>i%2==0).ToArray();
        Historical.V8.CoastalSurfaces.Distances(new bool[4],2,2);
        var before=GC.GetAllocatedBytesForCurrentThread();var d=Historical.V8.CoastalSurfaces.Distances(ocean,n,n);var bytes=GC.GetAllocatedBytesForCurrentThread()-before;
        output.WriteLine($"512x512 coastal distance+queue allocated bytes={bytes}");
        Assert.InRange(bytes,n*n*5,n*n*5+4096);Assert.True(bytes<=2*1024*1024);
        for(var i=0;i<d.Length;i++)Assert.Equal(ocean[i]?0:1,d[i]);
    }

    [Fact]
    public void AllNonCoverageFieldsMatchPreCoastalFingerprintsAndUnaffectedCoverageIsExact()
    {
        var options=new JsonSerializerOptions(JsonSerializerDefaults.Web);
        using var fixture=JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"Fixtures","landscape-v7-fingerprints.json")));
        var sandSamples=0;
        foreach(var item in fixture.RootElement.GetProperty("cases").EnumerateArray())
        {
            var request=item.GetProperty("request").Deserialize<TerrainRequest>(options)! with{AlgorithmVersion="diverse-landscape-v7"};
            var result=Historical.V8.TerrainGenerator.Generate(request);var m=result.HeightMap;var bound=(float)request.HeightMap.HeightMultiplier;var sea=request.SeaLevel*bound;
            var baseline=Historical.V8.SurfaceCoverage.Derive(m.Values,m.Biomes,m.Moisture,m.Temperature,m.Slope,bound);
            var fields=new Dictionary<string,object>{["values"]=m.Values,["biomes"]=m.Biomes,["moisture"]=m.Moisture,["temperature"]=m.Temperature,["slope"]=m.Slope,["vegetationDensity"]=m.VegetationDensity,["surfaceWeights"]=baseline,["trees"]=m.Trees,["rocks"]=m.Rocks,["simulation"]=result.Simulation};
            foreach(var(name,value)in fields)Assert.Equal(item.GetProperty("hashes").GetProperty(name).GetString(),Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(value,options))).ToLowerInvariant());
            var ocean=m.Biomes.Select(b=>b==LandscapeBiome.Ocean).ToArray();var distances=Historical.V8.CoastalSurfaces.Distances(ocean,m.Width,m.Height);
            for(var i=0;i<m.Values.Length;i++)
            {
                var outside=bound==0||ocean[i]||distances[i]>=8||m.Values[i]<=sea||((double)m.Values[i]-sea)/bound>=.05;
                if(outside)for(var c=0;c<5;c++)Assert.Equal(baseline[i*5+c],m.SurfaceWeights[i*5+c]);
                Assert.Equal(baseline[i*5+4],m.SurfaceWeights[i*5+4]);
                if(m.SurfaceWeights[i*5+2]>0)sandSamples++;
                Assert.InRange(Math.Abs(m.SurfaceWeights.AsSpan(i*5,5).ToArray().Sum(v=>(double)v)-(ocean[i]?0:1)),0,1e-6);
            }
        }
        Assert.True(sandSamples>0);
    }
}
