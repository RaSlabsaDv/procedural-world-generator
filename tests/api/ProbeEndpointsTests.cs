using System.Net;
using System.Net.Http.Json;
using System.Text;
using Microsoft.AspNetCore.Mvc.Testing;
using WorldGenerator.Core;
using Xunit;

namespace WorldGenerator.Api.Tests;

public sealed class ProbeEndpointsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private static readonly float[] SampleFixture =
    [
        0.25234514474868774f,
        0.08812499046325684f,
        0.5772811770439148f,
        0.22255420684814453f,
        0.3756601810455322f
    ];

    private readonly HttpClient client;

    public ProbeEndpointsTests(WebApplicationFactory<Program> factory)
    {
        client = factory.CreateClient();
    }

    [Fact]
    public async Task Add_ReturnsExactSum()
    {
        var response = await client.PostAsJsonAsync("/api/v1/probe/add", new { left = 20, right = 22 });

        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<AddResponse>();
        Assert.Equal(42, body!.Sum);
    }

    [Fact]
    public async Task Add_RejectsOverflow()
    {
        var response = await client.PostAsJsonAsync(
            "/api/v1/probe/add",
            new { left = int.MaxValue, right = 1 });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<ErrorResponse>();
        Assert.Equal("overflow", body!.Error);
    }

    [Fact]
    public async Task Add_RejectsMissingField()
    {
        var response = await client.PostAsJsonAsync("/api/v1/probe/add", new { left = 20 });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<ErrorResponse>();
        Assert.Equal("validation", body!.Error);
        Assert.Contains("right", body.Fields!.Keys);
    }

    [Fact]
    public async Task Add_RejectsUnexpectedField()
    {
        using var content = new StringContent(
            """{"left":20,"right":22,"unexpected":true}""",
            Encoding.UTF8,
            "application/json");

        var response = await client.PostAsync("/api/v1/probe/add", content);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task GenerateSamples_MatchesFixture()
    {
        var response = await client.PostAsJsonAsync(
            "/api/v1/probe/samples",
            new { seed = 42, count = 5 });

        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<SamplesResponse>();
        Assert.Equal(SampleFixture, body!.Values);
        Assert.True(body.ComputeMs >= 0);
    }

    [Fact]
    public async Task GenerateSamples_AllowsEmptyAndMaximumCounts()
    {
        var empty = await client.PostAsJsonAsync(
            "/api/v1/probe/samples",
            new { seed = 42, count = 0 });
        empty.EnsureSuccessStatusCode();
        Assert.Empty((await empty.Content.ReadFromJsonAsync<SamplesResponse>())!.Values);

        var maximum = await client.PostAsJsonAsync(
            "/api/v1/probe/samples",
            new { seed = 42, count = ComputationProbe.MaxSampleCount });
        maximum.EnsureSuccessStatusCode();
        var body = await maximum.Content.ReadFromJsonAsync<SamplesResponse>();
        Assert.Equal(ComputationProbe.MaxSampleCount, body!.Values.Length);
        Assert.Equal(0.25234514474868774f, body.Values[0]);
        Assert.Equal(0.98126220703125f, body.Values[^1]);
    }

    [Fact]
    public async Task GenerateSamples_RejectsInvalidCount()
    {
        var response = await client.PostAsJsonAsync(
            "/api/v1/probe/samples",
            new { seed = 42, count = -1 });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<ErrorResponse>();
        Assert.Equal("validation", body!.Error);
        Assert.Contains("count", body.Fields!.Keys);
    }
}
