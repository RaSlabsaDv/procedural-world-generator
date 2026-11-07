using System.Security.Cryptography;
using System.Text.Json;
using Xunit;

namespace WorldGenerator.Core.Tests;

public sealed class RockPlacementTests
{
    private readonly Xunit.Abstractions.ITestOutputHelper output;
    public RockPlacementTests(Xunit.Abstractions.ITestOutputHelper output) => this.output = output;

    [Theory]
    [InlineData(42, new[] {43,61,76,83,87,96,124,141,189})]
    [InlineData(-7, new[] {22,24,26,32,63,91,96,99,100,112,121,123,126,128,132,140,141,144,153,162,185,188,198})]
    [InlineData(int.MinValue, new[] {58,69,75,82,97,98,103,112,123,144,147,155,167,190})]
    [InlineData(int.MaxValue, new[] {7,97,109,112,129,134,164,165,178})]
    public void CompleteFlatPlacementMatchesIndependentPythonIndices(int seed, int[] expected)
    {
        const int w=17,h=13;
        var rocks=RockPlacement.Place(new float[w*h],Enumerable.Repeat(LandscapeBiome.Grassland,w*h).ToArray(),new float[w*h],new float[w*h*5],[],w,h,unchecked((uint)seed),.03);
        Assert.Equal(expected, rocks.Select(r=>r.CellIndex));
    }
    [Theory]
    [InlineData(0, 0, 42, RockKind.Boulder, .449493594600686, .5090230703353882, .43187451362609863, .2773725688457489, .3432706296443939, .2350444346666336, 2.6367084980010986, RockVariant.Angular, .8070757493842393)]
    [InlineData(17, 23, -7, RockKind.Outcrop, .6930854105538431, 17.482152938842773, 23.552326202392578, .3141469955444336, .6165880560874939, .25681549310684204, 1.5405011177062988, RockVariant.Angular, .030564602930098772)]
    [InlineData(64, 91, int.MinValue, RockKind.Scree, .36780565661295117, 64.51598358154297, 91.40315246582031, .1611315906047821, .16855263710021973, .14993026852607727, 2.865659713745117, RockVariant.Rounded, .43595240940339863)]
    [InlineData(127, 3, int.MaxValue, RockKind.Boulder, .6359699406857077, 127.43795013427734, 3.530411720275879, .31348899006843567, .4082801640033722, .22427093982696533, 2.6430981159210205, RockVariant.Angular, .5151330942753702)]
    public void MatchesIndependentPythonLiterals(int x, int z, int seed, RockKind kind, double cluster, double px, double pz, double sx, double sy, double sz, double yaw, RockVariant variant, double priority)
    {
        var c = RockPlacement.Transform(x, z, 512, unchecked((uint)seed), kind);
        Assert.Equal(cluster, RockPlacement.Cluster(x, z, unchecked((uint)seed), .03), 13);
        Assert.Equal(((float)px, (float)pz, (float)sx, (float)sy, (float)sz, (float)yaw, variant, priority),
            (c.X, c.Z, c.ScaleX, c.ScaleY, c.ScaleZ, c.Rotation, c.Variant, c.Priority));
    }

    [Fact]
    public void SquareSupportIncludesDiagonalIntersectionsRatherThanOnlyCorners()
    {
        // Triangles form a ridge along x+z=1: square corners are 6 or10; diagonal extrema are10.
        var support = RockPlacement.Support([0, 10, 10, 0], 2, 0, .5, .5, .2);
        Assert.Equal(6, support.Min, 12); Assert.Equal(10, support.Max, 12);
        // An asymmetric cut puts the diagonal extremum away from the center/corners.
        support = RockPlacement.Support([0, 10, 10, 0], 2, 0, .4, .45, .2);
        Assert.Equal(4.5, support.Min, 12); Assert.Equal(10, support.Max, 12);
        support = RockPlacement.Support([1, 2, 3, 4], 2, 0, .5, .5, .2);
        Assert.Equal(1.9, support.Min, 12); Assert.Equal(3.1, support.Max, 12);
    }

    [Theory]
    [InlineData(42)] [InlineData(-7)] [InlineData(int.MinValue)] [InlineData(int.MaxValue)]
    public void RepeatableGroundedAndSpacedWithAllKindsAndVariants(int seed)
    {
        const int w = 129, h = 97; var n = w * h;
        var values = new float[n]; var biomes = Enumerable.Repeat(LandscapeBiome.Rock, n).ToArray();
        var slopes = new float[n]; var weights = new float[n * 5];
        for (var z = 0; z < h; z++) for (var x = 0; x < w; x++)
        {
            var i = z*w+x;
            // Bounded alternating slope strips with exact planar interiors, no unbounded staircase.
            values[i] = (float)(.15 * Math.Abs(x % 32 - 16));
            slopes[i] = x < 43 ? 0 : x < 86 ? .2f : .6f;
            weights[i*5+3] = x >= 86 ? 1 : 0;
        }
        var trees = new[] { new TreeInstance(20*w+20, 20.5f, values[20*w+20], 20.5f, 1.4f, 0, TreeKind.Broadleaf, TreeVariant.Mature) };
        var a = RockPlacement.Place(values,biomes,slopes,weights,trees,w,h,unchecked((uint)seed),.03);
        var b = RockPlacement.Place(values,biomes,slopes,weights,trees,w,h,unchecked((uint)seed),.03);
        Assert.Equal(a,b); Assert.NotEmpty(a); Assert.NotSame(a,b);
        Assert.Equal(a.Select(r=>r.CellIndex).Order(),a.Select(r=>r.CellIndex));
        foreach(var kind in Enum.GetValues<RockKind>()) foreach(var variant in Enum.GetValues<RockVariant>()) Assert.Contains(a,r=>r.Kind==kind && r.Variant==variant);
        foreach (var rock in a)
        {
            var x=rock.CellIndex%w; var z=rock.CellIndex/w; var fx=rock.X-x; var fz=rock.Z-z;
            Assert.InRange(fx-rock.ScaleX,0,1); Assert.InRange(fx+rock.ScaleX,0,1); Assert.InRange(fz-rock.ScaleX,0,1); Assert.InRange(fz+rock.ScaleX,0,1);
            var support=RockPlacement.Support(values,w,rock.CellIndex,fx,fz,rock.ScaleX);
            Assert.Equal((float)(support.Min-.1*rock.ScaleY),rock.Y);
            Assert.True(support.Max-support.Min<=.7*rock.ScaleY);
            Assert.Equal(VegetationGenerator.Surface(values,w,rock.CellIndex,fx,fz),rock.GroundY);
            foreach(var tree in trees) Assert.True(Distance(rock.X,rock.Z,tree.X,tree.Z)>=rock.ScaleX+.075*tree.Scale+.15);
            // Test can use a global scan; production uses bounded cell grids.
            foreach(var other in a) if(other.CellIndex<rock.CellIndex) Assert.True(Distance(rock.X,rock.Z,other.X,other.Z)>=(double)rock.ScaleX+other.ScaleX+.12);
        }
    }

    [Fact]
    public void RejectsOceanSteepOrUnsupportedQuadsAndAcceptsDryFlatGround()
    {
        const int n=33; var biomes=Enumerable.Repeat(LandscapeBiome.Grassland,n*n).ToArray(); var heights=new float[n*n]; var slopes=new float[n*n]; var weights=new float[n*n*5];
        RockInstance[] Place()=>RockPlacement.Place(heights,biomes,slopes,weights,[],n,n,42,.03);
        var flat=Place(); Assert.NotEmpty(flat); Assert.All(flat,r=>{Assert.Equal(0,r.GroundY);Assert.True(r.Y<0);});
        Array.Fill(biomes,LandscapeBiome.Ocean); Assert.Empty(Place());
        Array.Fill(biomes,LandscapeBiome.Grassland); Array.Fill(slopes,1.81f); Assert.Empty(Place());
        Array.Clear(slopes); for(var i=0;i<heights.Length;i++) heights[i]=(i%n)*10; Assert.Empty(Place());
        Assert.Empty(RockPlacement.Place([0,0,0,0],[LandscapeBiome.Ocean,LandscapeBiome.Grassland,LandscapeBiome.Grassland,LandscapeBiome.Grassland],new float[4],new float[20],[],2,2,42,.03));
    }

    [Fact]
    public void ExistingTreeExcludesItsRockWithoutMovingAnyTreeOrRetainedCandidate()
    {
        const int w=17,h=13; var values=new float[w*h]; var biomes=Enumerable.Repeat(LandscapeBiome.Grassland,w*h).ToArray(); var slopes=new float[w*h]; var weights=new float[w*h*5];
        var baseline=RockPlacement.Place(values,biomes,slopes,weights,[],w,h,42,.03);
        var first=baseline[0]; var tree=new TreeInstance(first.CellIndex,first.X,0,first.Z,1.4f,0,TreeKind.Broadleaf,TreeVariant.Small);
        var trees=new[]{tree};
        var withTree=RockPlacement.Place(values,biomes,slopes,weights,trees,w,h,42,.03);
        Assert.DoesNotContain(withTree,r=>r.CellIndex==first.CellIndex);
        Assert.Equal(tree,trees[0]);
        foreach(var rock in withTree)
        {
            Assert.True(Distance(rock.X,rock.Z,tree.X,tree.Z)>=rock.ScaleX+.075*tree.Scale+.15);
            var retained=baseline.SingleOrDefault(r=>r.CellIndex==rock.CellIndex);
            if(retained is not null) Assert.Equal(retained,rock);
        }
    }

    [Fact]
    public void PriorityOrderIsTraversalIndependentAndRejectedCandidatesDoNotBlock()
    {
        var a=RockPlacement.Transform(0,0,4,42,RockKind.Boulder) with{X=.6f,Z=.5f,ScaleX=.36f,Priority=.1};
        var b=RockPlacement.Transform(1,0,4,42,RockKind.Boulder) with{X=1.4f,Z=.5f,ScaleX=.36f,Priority=.2};
        var c=RockPlacement.Transform(2,0,4,42,RockKind.Boulder) with{X=2.2f,Z=.5f,ScaleX=.36f,Priority=.3};
        var forward=RockPlacement.Select([a,b,c],3,4,2); var reverse=RockPlacement.Select([c,b,a],3,4,2);
        Assert.Equal(forward,reverse); Assert.Equal(new[]{0,2},forward.Select(r=>r.CellIndex));
        var tie=RockPlacement.Select([b with{Priority=.1},a],2,4,2); Assert.Equal(0,Assert.Single(tie).CellIndex);
    }

    [Fact]
    public void MaximumFlatMapReachesCapWithoutRowBiasAndStaysWithinAllocationBudget()
    {
        const int n=512; var values=new float[n*n]; var biomes=Enumerable.Repeat(LandscapeBiome.Grassland,n*n).ToArray(); var slopes=new float[n*n]; var weights=new float[n*n*5];
        RockPlacement.Place(new float[4],Enumerable.Repeat(LandscapeBiome.Grassland,4).ToArray(),new float[4],new float[20],[],2,2,42,.03);
        var before=GC.GetAllocatedBytesForCurrentThread();
        var rocks=RockPlacement.Place(values,biomes,slopes,weights,[],n,n,42,.03);
        var allocated=GC.GetAllocatedBytesForCurrentThread()-before;
        output.WriteLine($"512x512 rocks={rocks.Length}; allocated bytes including output={allocated}");
        Assert.Equal(TerrainLimits.MaxRocks,rocks.Length); Assert.True(allocated<32*1024*1024,$"Allocated {allocated}");
        foreach(var x in new[]{0,1}) foreach(var z in new[]{0,1}) Assert.InRange(rocks.Count(r=>(r.CellIndex%n>=256?1:0)==x&&(r.CellIndex/n>=256?1:0)==z),1000,3200);
    }

    [Fact]
    public void EveryStageFourFieldIncludingFullTreesRemainsBitExact()
    {
        var options=new JsonSerializerOptions(JsonSerializerDefaults.Web);
        using var fixture=JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"Fixtures","landscape-v5-fingerprints.json")));
        foreach(var item in fixture.RootElement.GetProperty("cases").EnumerateArray())
        {
            var request=item.GetProperty("request").Deserialize<TerrainRequest>(options)! with{AlgorithmVersion=TerrainLimits.AlgorithmVersion};
            var result=TerrainGenerator.Generate(request); var map=result.HeightMap;
            var fields=new Dictionary<string,object>{["values"]=map.Values,["biomes"]=map.Biomes,["moisture"]=map.Moisture,["temperature"]=map.Temperature,["slope"]=map.Slope,["vegetationDensity"]=map.VegetationDensity,["surfaceWeights"]=map.SurfaceWeights,["trees"]=map.Trees,["simulation"]=result.Simulation};
            foreach(var (name,value) in fields) Assert.Equal(item.GetProperty("hashes").GetProperty(name).GetString(),Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(value,options))).ToLowerInvariant());
            Assert.Equal(item.GetProperty("treeCount").GetInt32(),map.Trees.Length);
        }
    }
    private static double Distance(float x,float z,float ox,float oz)=>Math.Sqrt(((double)x-ox)*((double)x-ox)+((double)z-oz)*((double)z-oz));
}
