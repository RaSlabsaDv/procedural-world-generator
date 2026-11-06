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
var terrainRequestTypeInfo = HostJson.GetTypeInfo<TerrainWireRequest>(hostJsonOptions);

var contentTypeProvider = new FileExtensionContentTypeProvider();
contentTypeProvider.Mappings[".dat"] = "application/octet-stream";
contentTypeProvider.Mappings[".wasm"] = "application/wasm";

app.UseDefaultFiles();
app.UseStaticFiles(new StaticFileOptions { ContentTypeProvider = contentTypeProvider });

app.MapGet("/api/health", () => Results.Ok(new HealthResponse("ok")));

app.MapPost("/api/v1/terrains", async (HttpContext context) =>
{
    context.Response.Headers["Cache-Control"] = "no-store";
    var preparation = await TerrainTransport.ParseAndPrepareAsync(context.Request.Body,
        terrainRequestTypeInfo, context.RequestAborted);
    if (!preparation.IsValid)
        return Results.Json(preparation.Error!, hostJsonOptions, statusCode: StatusCodes.Status400BadRequest);
    var started = Stopwatch.GetTimestamp();
    var result = TerrainGenerator.GenerateValidated(preparation.ValidatedRequest!);
    var computeMs = Stopwatch.GetElapsedTime(started).TotalMilliseconds;
    return Results.Json(new TerrainGenerationResponse(result.HeightMap, result.Simulation,
        preparation.Parameters!, computeMs, CoreBuildId.Value), hostJsonOptions);
});

app.Map("/api/{**path}", () => Results.NotFound());

app.MapFallbackToFile("index.html");

app.Run();

public sealed record HealthResponse(string Status);

public partial class Program;
