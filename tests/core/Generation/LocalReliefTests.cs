using System.Security.Cryptography;
using System.Text.Json;
using Xunit;

namespace WorldGenerator.Core.Tests;

public sealed class LocalReliefTests
{
    private readonly Xunit.Abstractions.ITestOutputHelper output;
    public LocalReliefTests(Xunit.Abstractions.ITestOutputHelper output) => this.output=output;

    [Theory]
    [InlineData(0,0,42,1,0,0,.4,.55,.001087824791906259)]
    [InlineData(17,23,-7,0,1,0,.4,.55,.004407826784744226)]
    [InlineData(64,91,int.MinValue,0,0,1,.4,.8,-.00544001560330876)]
    [InlineData(127,3,int.MaxValue,.3,.4,.3,.2,1,.0014517545461901872)]
    [InlineData(511,511,42,1,0,0,.5,.55,.0019627404309909887)]
    public void MatchesIndependentScalarReference(int x,int z,int seed,double p,double h,double m,double ridge,double strength,double expected) =>
        Assert.Equal(expected,LocalRelief.Sample(x,z,unchecked((uint)seed),p,h,m,ridge,strength),14);

    [Fact]
    public void FullZeroWarpPlainMapMatchesIndependentFloat32Literals()
    {
        var r=Request(42) with{HeightMap=Request(42).HeightMap with{Width=3,Height=2},WarpStrength=0,PlainsCoverage=1,MountainCoverage=0};
        Assert.Equal(new float[]{5.460665225982666f,5.461958408355713f,5.469361782073975f,5.464881420135498f,5.464284896850586f,5.468998432159424f},TerrainGenerator.Generate(r).HeightMap.Values);
    }

    [Fact]
    public void HeadroomPreventsNewClampingPlateausAndEndpointsStayExact()
    {
        foreach(var basis in new[]{0,1e-8,.001,.049,.05,.5,.95,.999999,1}) foreach(var delta in new[]{-.041,.041})
        {
            var value=LocalRelief.Apply(basis,delta); Assert.InRange(value,0,1);
            if(basis>0&&basis<1) Assert.True(value>0&&value<1);
            else Assert.Equal(basis,value);
            Assert.InRange(Math.Abs(value-basis),0,LocalRelief.MaxAmplitude+1e-15);
        }
    }

    [Fact]
    public void BlendedReliefIsBoundedContinuousAndHasNoPerSampleAllocations()
    {
        double checksum=0;
        LocalRelief.Sample(0,0,42,.3,.4,.3,.4,.8);
        var before=GC.GetAllocatedBytesForCurrentThread();
        for(var i=0;i<10000;i++) checksum+=LocalRelief.Sample(i%100,i/100,42,.3,.4,.3,.4,.8);
        var bytes=GC.GetAllocatedBytesForCurrentThread()-before;
        Assert.Equal(0,bytes); Assert.NotEqual(0,checksum);
        for(var i=0;i<512;i++)
        {
            var x=i*.731; var z=i*.193;
            var a=LocalRelief.Sample(x,z,42,.3,.4,.3,.4,.8);
            var b=LocalRelief.Sample(x+1e-7,z-1e-7,42,.3,.4,.3,.4,.8);
            Assert.InRange(a,-LocalRelief.MaxAmplitude,LocalRelief.MaxAmplitude); Assert.InRange(Math.Abs(a-b),0,1e-8);
        }
        // Weight blending is continuous through existing regional transition bands.
        foreach(var region in new[]{.37,.53,.62,.78})
        {
            var a=TerrainComposer.Weights(region,.45,.3); var b=TerrainComposer.Weights(region+1e-8,.45,.3);
            var l=LocalRelief.Sample(17,23,42,a.Plains,a.Hills,a.Mountains,.4,.55);
            var r=LocalRelief.Sample(17,23,42,b.Plains,b.Hills,b.Mountains,.4,.55);
            Assert.InRange(Math.Abs(l-r),0,1e-8);
        }
    }

    [Theory]
    [InlineData(42)] [InlineData(-7)] [InlineData(int.MinValue)] [InlineData(int.MaxValue)]
    public void PlainsKeepBroadLowSlopeAreasWithAndWithoutErosion(int seed)
    {
        foreach(var steps in new[]{0,32})
        {
            var request=Request(seed) with{PlainsCoverage=1,MountainCoverage=0,Iterations=steps};
            var old=Historical.V5.TerrainGenerator.Generate(request).HeightMap;
            var current=TerrainGenerator.Generate(request).HeightMap;
            var flat=current.Slope.Select(s=>s<=.1).ToArray();
            var flatFraction=flat.Count(v=>v)/(double)flat.Length;
            var largest=LargestArea(flat,current.Width,current.Height)/(double)flat.Length;
            var mean=current.Slope.Average(v=>(double)v);
            output.WriteLine($"seed={seed} steps={steps} meanSlope={mean} flat={flatFraction} largest={largest}");
            Assert.True(flatFraction>=.85); Assert.True(largest>=.60);
            Assert.True(mean<=old.Slope.Average(v=>(double)v)*1.35+.005);
            Assert.NotEqual(old.Values,current.Values);
        }
    }

    [Fact]
    public void PlainMaskPreservesLargeUnmodifiedPatchesAndRealVariation()
    {
        var zeros=0; var varied=0;
        for(var z=0;z<512;z++)for(var x=0;x<512;x++)
        {var mask=LocalRelief.PlainMask(x,z,42);if(mask==0)zeros++;if(mask>.25)varied++;}
        Assert.True(zeros>=512*512*.25); Assert.True(varied>0);
        // Minimum lattice spacing is eight grid units. Check gradual changes within that spacing.
        var values=Enumerable.Range(0,129).Select(x=>LocalRelief.Sample(x,23,42,0,1,0,.4,.55)).ToArray();
        Assert.True(values.Max()-values.Min()>.005);
        Assert.True(values.Zip(values.Skip(1),(a,b)=>Math.Abs(a-b)).Max()<.02);
    }

    [Theory]
    [InlineData(2,2,0,0,int.MinValue)]
    [InlineData(3,9,1000,2,int.MaxValue)]
    [InlineData(129,97,30,32,-7)]
    [InlineData(512,512,1000,128,42)]
    public void FinalFieldsUseErodedHeightsAndPlacementsRemainGrounded(int width,int height,double bound,int steps,int seed)
    {
        var request=Request(seed) with{HeightMap=Request(seed).HeightMap with{Width=width,Height=height,HeightMultiplier=bound},Iterations=steps};
        var a=TerrainGenerator.Generate(request); var b=TerrainGenerator.GenerateValidated(TerrainValidator.Prepare(request).ValidatedRequest!);
        Assert.Equal(a.HeightMap.Values,b.HeightMap.Values); Assert.Equal(a.HeightMap.Trees,b.HeightMap.Trees); Assert.Equal(a.HeightMap.Rocks,b.HeightMap.Rocks);
        Assert.NotSame(a.HeightMap.Values,b.HeightMap.Values); Assert.Equal(a.Simulation,b.Simulation); TerrainTests.Balance(a.Simulation);
        Assert.All(a.HeightMap.Values,v=>Assert.True(float.IsFinite(v)&&v>=0&&v<=(float)bound));
        if(bound==0) Assert.All(a.HeightMap.Values,v=>Assert.Equal(0,v));
        var derived=LandscapeEcology.Derive(a.HeightMap.Values,request); var map=a.HeightMap;
        Assert.Equal(derived.Slope,map.Slope); Assert.Equal(derived.Biomes,map.Biomes); Assert.Equal(derived.SurfaceWeights,map.SurfaceWeights); Assert.Equal(derived.Trees,map.Trees); Assert.Equal(derived.Rocks,map.Rocks);
        Assert.InRange(map.Trees.Length,0,TerrainLimits.MaxTrees);Assert.InRange(map.Rocks.Length,0,TerrainLimits.MaxRocks);
        foreach(var tree in map.Trees) Assert.Equal(VegetationGenerator.Surface(map.Values,width,tree.CellIndex,(double)tree.X-tree.CellIndex%width,(double)tree.Z-tree.CellIndex/width),tree.Y);
        foreach(var rock in map.Rocks)
        {
            var fx=(double)rock.X-rock.CellIndex%width;var fz=(double)rock.Z-rock.CellIndex/width;
            Assert.Equal(VegetationGenerator.Surface(map.Values,width,rock.CellIndex,fx,fz),rock.GroundY);
            var support=RockPlacement.Support(map.Values,width,rock.CellIndex,fx,fz,rock.ScaleX);
            Assert.Equal((float)(support.Min-.1*rock.ScaleY),rock.Y);
        }
    }

    [Fact]
    public void FrozenPreReliefPipelineMatchesAllHistoricalNumericFields()
    {
        var options=new JsonSerializerOptions(JsonSerializerDefaults.Web);
        using var fixture=JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"Fixtures","landscape-v6-fingerprints.json")));
        foreach(var item in fixture.RootElement.GetProperty("cases").EnumerateArray())
        {
            var request=item.GetProperty("request").Deserialize<TerrainRequest>(options)! with{AlgorithmVersion=TerrainLimits.AlgorithmVersion};
            var result=Historical.V5.TerrainGenerator.Generate(request);var m=result.HeightMap;
            var fields=new Dictionary<string,object>{["values"]=m.Values,["biomes"]=m.Biomes,["moisture"]=m.Moisture,["temperature"]=m.Temperature,["slope"]=m.Slope,["vegetationDensity"]=m.VegetationDensity,["surfaceWeights"]=m.SurfaceWeights,["trees"]=m.Trees,["rocks"]=m.Rocks,["simulation"]=result.Simulation};
            foreach(var(name,value)in fields)Assert.Equal(item.GetProperty("hashes").GetProperty(name).GetString(),Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(value,options))).ToLowerInvariant());
        }
    }

    [Fact]
    public void MixedAndMountainMapsChangeWithoutInventingNewClampPlateaus()
    {
        foreach(var r in new[]{Request(42),Request(-7) with{PlainsCoverage=0,MountainCoverage=1}})
        {
            var old=Historical.V5.TerrainGenerator.Generate(r).HeightMap.Values;var map=TerrainGenerator.Generate(r).HeightMap.Values;
            Assert.True(old.Zip(map,(a,b)=>a!=b).Count(x=>x)>map.Length/4);
            Assert.True(map.Count(v=>v==0||v==30)<=old.Count(v=>v==0||v==30));
            Assert.True(old.Zip(map,(a,b)=>Math.Abs(a-b)).Max()<=30*LocalRelief.MaxAmplitude+1e-5);
        }
    }

    private static TerrainRequest Request(int seed)=>TerrainTests.Request(0) with{HeightMap=TerrainTests.Request().HeightMap with{Width=129,Height=97,NoiseScale=.03,Octaves=4,Seed=seed}};
    private static int LargestArea(bool[] flat,int width,int height)
    {
        var seen=new bool[flat.Length];var queue=new Queue<int>();var largest=0;
        for(var i=0;i<flat.Length;i++)if(flat[i]&&!seen[i])
        {
            seen[i]=true;queue.Enqueue(i);var size=0;
            while(queue.TryDequeue(out var j))
            {
                size++;var x=j%width;var z=j/width;
                if(x>0)Visit(j-1);if(x<width-1)Visit(j+1);if(z>0)Visit(j-width);if(z<height-1)Visit(j+width);
            }
            largest=Math.Max(largest,size);
        }
        return largest;
        void Visit(int i){if(flat[i]&&!seen[i]){seen[i]=true;queue.Enqueue(i);}}
    }
}
