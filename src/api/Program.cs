using System.Diagnostics;
using System.Text.Json.Serialization.Metadata;
using Microsoft.AspNetCore.StaticFiles;
using WorldGenerator.Core;
using WorldGenerator.Hosts;

var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    WebRootPath = Path.Combine(AppContext.BaseDirectory, "wwwroot")
});

builder.Services.ConfigureHttpJsonOptions(options =>
{
    HostJson.Configure(options.SerializerOptions);
});

var app = builder.Build();

var hostJsonOptions = HostJson.CreateOptions(new DefaultJsonTypeInfoResolver());
var heightMapRequestTypeInfo = HostJson.GetTypeInfo<HeightMapWireRequest>(hostJsonOptions);

var contentTypeProvider = new FileExtensionContentTypeProvider();
contentTypeProvider.Mappings[".dat"] = "application/octet-stream";
contentTypeProvider.Mappings[".wasm"] = "application/wasm";

app.UseDefaultFiles();
app.UseStaticFiles(new StaticFileOptions { ContentTypeProvider = contentTypeProvider });

app.MapGet("/api/health", () => Results.Ok(new HealthResponse("ok")));

app.MapPost("/api/v1/probe/add", (AddRequest request) =>
{
    var fields = new Dictionary<string, string>();
    if (request.Left is null)
    {
        fields["left"] = "Required.";
    }

    if (request.Right is null)
    {
        fields["right"] = "Required.";
    }

    if (fields.Count > 0)
    {
        return Results.BadRequest(new ErrorResponse("validation", fields));
    }

    try
    {
        return Results.Ok(new AddResponse(ComputationProbe.Add(request.Left!.Value, request.Right!.Value)));
    }
    catch (OverflowException)
    {
        return Results.BadRequest(new ErrorResponse("overflow", null));
    }
});

app.MapPost("/api/v1/probe/samples", (SamplesRequest request) =>
{
    var fields = new Dictionary<string, string>();
    if (request.Seed is null)
    {
        fields["seed"] = "Required.";
    }

    if (request.Count is null)
    {
        fields["count"] = "Required.";
    }

    if (fields.Count > 0)
    {
        return Results.BadRequest(new ErrorResponse("validation", fields));
    }

    var started = Stopwatch.GetTimestamp();
    float[] values;
    try
    {
        values = ComputationProbe.GenerateSamples(request.Seed!.Value, request.Count!.Value);
    }
    catch (ArgumentOutOfRangeException)
    {
        return Results.BadRequest(new ErrorResponse(
            "validation",
            new Dictionary<string, string> { ["count"] = $"Expected 0..{ComputationProbe.MaxSampleCount}." }));
    }

    var computeMs = Stopwatch.GetElapsedTime(started).TotalMilliseconds;
    return Results.Ok(new SamplesResponse(values, computeMs));
});

app.MapPost("/api/v1/heightmaps", async (HttpContext context) =>
{
    context.Response.Headers["Cache-Control"] = "no-store";

    var preparation = await HeightMapTransport.ParseAndPrepareAsync(
        context.Request.Body,
        heightMapRequestTypeInfo,
        context.RequestAborted);

    if (!preparation.IsValid)
    {
        return Results.Json(
            preparation.Error!,
            hostJsonOptions,
            statusCode: StatusCodes.Status400BadRequest);
    }

    var started = Stopwatch.GetTimestamp();
    var result = HeightMapGenerator.GenerateValidated(preparation.ValidatedRequest!);
    var computeMs = Stopwatch.GetElapsedTime(started).TotalMilliseconds;

    var response = new GenerationResponse(result, computeMs, CoreBuildId.Value);
    return Results.Json(response, hostJsonOptions);
});

app.MapFallbackToFile("index.html");

app.Run();

public sealed record AddRequest(int? Left, int? Right);

public sealed record SamplesRequest(int? Seed, int? Count);

public sealed record AddResponse(int Sum);

public sealed record SamplesResponse(float[] Values, double ComputeMs);

public sealed record HealthResponse(string Status);

public partial class Program;
