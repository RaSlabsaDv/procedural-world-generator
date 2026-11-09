using System.Security.Cryptography;
using System.Text.Json;
using Xunit;

namespace WorldGenerator.Core.Tests;

public sealed class RockPlacementV2Tests
{
    private readonly Xunit.Abstractions.ITestOutputHelper output;
    public RockPlacementV2Tests(Xunit.Abstractions.ITestOutputHelper output) => this.output = output;
    private static RockInstance[] Flat(int width, int height, int seed) => RockPlacement.Place(new float[width*height],
        Enumerable.Repeat(LandscapeBiome.Grassland,width*height).ToArray(),new float[width*height],new float[width*height*5],[],width,height,unchecked((uint)seed));

    [Theory]
    [InlineData(42, new int[] {})]
    [InlineData(-7, new[] {38,179,208,235,238,345,445,679,751})]
    [InlineData(int.MinValue, new int[] {})]
    [InlineData(int.MaxValue, new[] {785})]
    public void FlatPlacementMatchesIndependentLiteralIndices(int seed, int[] expected) => Assert.Equal(expected,Flat(33,25,seed).Select(r=>r.CellIndex));

    [Theory]
    [InlineData(0,0,42,RockKind.Boulder,.5415062308311462,.18662279844284058,1.0729217529296875,.98686283826828,.8555436134338379,2.6367084980010986,RockVariant.Angular,.8070757493842393)]
    [InlineData(17,23,-7,RockKind.Outcrop,17.417903900146484,23.740697860717773,1.0561025142669678,1.3987863063812256,.45236465334892273,1.5405011177062988,RockVariant.Angular,.030564602930098772)]
    [InlineData(64,91,int.MinValue,RockKind.Scree,64.5735092163086,91.05451202392578,.2965394854545593,.1885526329278946,.26109808683395386,2.865659713745117,RockVariant.Rounded,.43595240940339863)]
    [InlineData(127,3,int.MaxValue,RockKind.Boulder,127.21455383300781,3.6398932933807373,.4350246489048004,.4350246489048004,.2894666790962219,2.6430981159210205,RockVariant.Angular,.5151330942753702)]
    public void TransformsMatchIndependentLiterals(int x,int z,int seed,RockKind kind,double px,double pz,double sx,double sy,double sz,double yaw,RockVariant variant,double priority)
    {
        var c=RockPlacement.Transform(x,z,512,unchecked((uint)seed),kind);
        Assert.Equal(((float)px,(float)pz,(float)sx,(float)sy,(float)sz,(float)yaw,variant,priority),(c.X,c.Z,c.ScaleX,c.ScaleY,c.ScaleZ,c.Rotation,c.Variant,c.Priority));
    }

    [Fact]
    public void SupportIncludesInteriorVerticesAndDiagonalExtremaAcrossManyQuads()
    {
        var heights=new float[25];heights[2*5+2]=10;
        var biomes=Enumerable.Repeat(LandscapeBiome.Grassland,25).ToArray();var slopes=new float[25];
        Assert.True(RockSupport.Try(heights,biomes,slopes,5,5,2.5,2.5,1.4,out var support));
        Assert.Equal(0,support.Min);Assert.Equal(10,support.Max);
        Assert.True(RockSupport.Try([0,10,10,0],Enumerable.Repeat(LandscapeBiome.Grassland,4).ToArray(),new float[4],2,2,.4,.45,.2,out support));
        Assert.Equal(4.5,support.Min,12);Assert.Equal(10,support.Max,12);
        Assert.False(RockSupport.Try(heights,biomes,slopes,5,5,.2,2,1,out _));
        biomes[2*5+2]=LandscapeBiome.Ocean;
        Assert.False(RockSupport.Try(heights,biomes,slopes,5,5,2.5,2.5,1.4,out _));
        biomes[2*5+2]=LandscapeBiome.Grassland;slopes[2*5+2]=1.81f;
        Assert.False(RockSupport.Try(heights,biomes,slopes,5,5,2.5,2.5,1.4,out _));
    }

    [Fact]
    public void SparseReferenceMatrixHasAllClassesVariantsAndEmptyRegionsWithoutGridOffsets()
    {
        var all=new List<RockInstance>();
        foreach(var seed in new[]{42,-7,int.MinValue,int.MaxValue})
        {
            const int w=129,h=97;var biomes=Enumerable.Repeat(LandscapeBiome.Rock,w*h).ToArray();var slopes=new float[w*h];var weights=new float[w*h*5];
            for(var i=0;i<slopes.Length;i++){slopes[i]=i%w<43?0:i%w<86?.2f:.6f;weights[i*5+3]=i%w>=86?1:0;}
            var terrain=new float[w*h];
            var a=RockPlacement.Place(terrain,biomes,slopes,weights,[],w,h,unchecked((uint)seed));
            Assert.Equal(a,RockPlacement.Place(new float[w*h],biomes,slopes,weights,[],w,h,unchecked((uint)seed)));
            Assert.InRange(a.Length,1,1000);all.AddRange(a);
            Assert.Equal(a.Select(r=>r.CellIndex).Order(),a.Select(r=>r.CellIndex));
            Assert.Equal(a.Length,a.Select(r=>r.CellIndex).Distinct().Count());
            foreach(var rock in a)
            {
                Assert.True(RockSupport.Try(terrain,biomes,slopes,w,h,rock.X,rock.Z,rock.ScaleX,out var support));
                Assert.Equal((float)(support.Min-RockPlacement.Embedding*rock.ScaleY),rock.Y);
                Assert.True(support.Max-support.Min<=RockPlacement.SupportFraction*rock.ScaleY);
                foreach(var other in a)if(other.CellIndex<rock.CellIndex)
                    Assert.True(Distance(rock.X,rock.Z,other.X,other.Z)>=(double)rock.ScaleX+other.ScaleX+RockPlacement.RockGap);
            }
        }
        Assert.Contains(all,r=>r.ScaleX>=1.8f);Assert.Contains(all,r=>r.ScaleX>=.7f&&r.ScaleX<=1.4f);Assert.Contains(all,r=>r.ScaleX<.5f);
        foreach(var kind in Enum.GetValues<RockKind>())foreach(var variant in Enum.GetValues<RockVariant>())Assert.Contains(all,r=>r.Kind==kind&&r.Variant==variant);
        Assert.Contains(all,r=>r.X-Math.Floor(r.X)<.25);Assert.Contains(all,r=>r.Z-Math.Floor(r.Z)>.75);
    }

    [Fact]
    public void PrioritySelectionHandlesLargeDistantCellsTiesAndRejectedCandidates()
    {
        var a=RockPlacement.Transform(4,4,24,42,RockKind.Boulder)with{X=4.5f,Z=4.5f,ScaleX=3,Priority=.1};
        var b=RockPlacement.Transform(10,4,24,42,RockKind.Boulder)with{X=10.7f,Z=4.5f,ScaleX=3,Priority=.2};
        var c=RockPlacement.Transform(16,4,24,42,RockKind.Boulder)with{X=16.9f,Z=4.5f,ScaleX=3,Priority=.3};
        var forward=RockPlacement.Select([a,b,c],3,24,24);
        Assert.Equal(forward,RockPlacement.Select([c,b,a],3,24,24));
        Assert.Equal(new[]{a.CellIndex,c.CellIndex},forward.Select(r=>r.CellIndex));
        Assert.Equal(a.CellIndex,Assert.Single(RockPlacement.Select([b with{Priority=.1},a],2,24,24)).CellIndex);
    }

    [Fact]
    public void TreesKeepTheirFullConservativeCrownClearanceAndRetainedTransforms()
    {
        const int w=129,h=97;var values=new float[w*h];var biomes=Enumerable.Repeat(LandscapeBiome.Grassland,w*h).ToArray();var slopes=new float[w*h];var weights=new float[w*h*5];
        var a=RockPlacement.Place(values,biomes,slopes,weights,[],w,h,unchecked((uint)-7));var first=a[0];
        var tree=new TreeInstance(first.CellIndex,first.X,0,first.Z,1.4f,0,TreeKind.Savanna,TreeVariant.Mature);
        var b=RockPlacement.Place(values,biomes,slopes,weights,[tree],w,h,unchecked((uint)-7));
        Assert.DoesNotContain(b,r=>r.CellIndex==first.CellIndex);
        foreach(var rock in b)
        {
            Assert.True(Distance(rock.X,rock.Z,tree.X,tree.Z)>=rock.ScaleX+RockPlacement.TreeRadius*tree.Scale+RockPlacement.TreeGap);
            var retained=a.SingleOrDefault(r=>r.CellIndex==rock.CellIndex);if(retained is not null)Assert.Equal(retained,rock);
        }
        Assert.Equal(first.X,tree.X);
    }

    [Fact]
    public void MaximumMapIsSparseBelowCapAndWithinOriginalAllocationBudget()
    {
        Flat(33,25,-7);
        const int n=512;var values=new float[n*n];var biomes=Enumerable.Repeat(LandscapeBiome.Grassland,n*n).ToArray();var slopes=new float[n*n];var weights=new float[n*n*5];
        var before=GC.GetAllocatedBytesForCurrentThread();var rocks=RockPlacement.Place(values,biomes,slopes,weights,[],n,n,42);var allocated=GC.GetAllocatedBytesForCurrentThread()-before;
        Assert.True(allocated < 32L*1024*1024,$"Placement allocated={allocated}");
        Assert.InRange(rocks.Length,1,TerrainLimits.MaxRocks-1);
        output.WriteLine($"512x512 sparse dry-flat rocks={rocks.Length}; placement allocation including output={allocated}");
        Assert.True(rocks.Length<512*512/32); // More than 96% of center cells stay empty.
    }

    [Fact]
    public void PreChannelAllNonRockFieldsMatchEveryPreChangeFingerprint()
    {
        var options=new JsonSerializerOptions(JsonSerializerDefaults.Web);
        using var fixture=JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"Fixtures","landscape-v10-fingerprints.json")));
        foreach(var item in fixture.RootElement.GetProperty("cases").EnumerateArray())
        {
            var request=item.GetProperty("request").Deserialize<TerrainRequest>(options)!with{AlgorithmVersion=TerrainLimits.AlgorithmVersion};
            var result=Historical.V13.TerrainGenerator.Generate(request);var m=result.HeightMap;
            var fields=new Dictionary<string,object>{["values"]=m.Values,["biomes"]=m.Biomes,["moisture"]=m.Moisture,["temperature"]=m.Temperature,["slope"]=m.Slope,["vegetationDensity"]=m.VegetationDensity,["surfaceWeights"]=m.SurfaceWeights,["trees"]=m.Trees,["simulation"]=result.Simulation};
            foreach(var(name,value)in fields)Assert.Equal(item.GetProperty("hashes").GetProperty(name).GetString(),Hash(value));
            var baseWeights=SurfaceCoverage.Derive(m.Values,m.Biomes,m.Moisture,m.Temperature,m.Slope,(float)request.HeightMap.HeightMultiplier);
            var old=Historical.V8.RockPlacement.Place(m.Values,m.Biomes,m.Slope,baseWeights,m.Trees,m.Width,m.Height,unchecked((uint)request.HeightMap.Seed),request.HeightMap.NoiseScale);
            Assert.Equal(item.GetProperty("hashes").GetProperty("rocks").GetString(),Hash(old));
            Assert.InRange(m.Rocks.Length,0,TerrainLimits.MaxRocks);
            foreach(var rock in m.Rocks)
            {
                Assert.True(RockSupport.Try(m.Values,m.Biomes,m.Slope,m.Width,m.Height,rock.X,rock.Z,rock.ScaleX,out var support));
                Assert.True(support.Max-support.Min<=RockPlacement.SupportFraction*rock.ScaleY);
                Assert.Equal((float)(support.Min-RockPlacement.Embedding*rock.ScaleY),rock.Y);
            }
        }
        string Hash(object x)=>Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(x,options))).ToLowerInvariant();
    }

    [Theory]
    [InlineData(2,2,0,int.MinValue)] [InlineData(3,2,30,int.MaxValue)] [InlineData(129,97,30,-7)]
    public void SmallRectangularAndZeroMapsAreValid(int w,int h,double bound,int seed)
    {
        var r=TerrainTests.Request(0)with{HeightMap=TerrainTests.Request().HeightMap with{Width=w,Height=h,HeightMultiplier=bound,Seed=seed}};
        var a=TerrainGenerator.Generate(r).HeightMap;var b=TerrainGenerator.Generate(r).HeightMap;
        Assert.Equal(a.Rocks,b.Rocks);if(bound==0)Assert.Empty(a.Rocks);
        Assert.All(a.Rocks,rock=>Assert.True(float.IsFinite(rock.Y)&&float.IsFinite(rock.ScaleX)));
        Assert.Empty(RockPlacement.Place(new float[4],Enumerable.Repeat(LandscapeBiome.Ocean,4).ToArray(),new float[4],new float[20],[],2,2,42));
    }
    private static double Distance(float x,float z,float ox,float oz)=>Math.Sqrt(((double)x-ox)*((double)x-ox)+((double)z-oz)*((double)z-oz));
}
