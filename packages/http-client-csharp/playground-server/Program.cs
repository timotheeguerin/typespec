// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

var allowedOrigins = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
{
    "http://localhost:5173", // vite dev
    "http://localhost:4173", // vite preview
    "http://localhost:3000",
    "https://typespec.io",
    "https://www.typespec.io",
};
// Add additional origins from PLAYGROUND_URLS (comma-separated) or PLAYGROUND_URL (single)
var playgroundUrls = Environment.GetEnvironmentVariable("PLAYGROUND_URLS")
    ?? Environment.GetEnvironmentVariable("PLAYGROUND_URL");
if (!string.IsNullOrEmpty(playgroundUrls))
{
    foreach (var origin in playgroundUrls.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
    {
        if (Uri.TryCreate(origin, UriKind.Absolute, out var uri))
        {
            allowedOrigins.Add(uri.GetLeftPart(UriPartial.Authority));
        }
    }
}

builder.Services.AddCors();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = 429;
    options.AddFixedWindowLimiter("generate", limiter =>
    {
        limiter.PermitLimit = 10;
        limiter.Window = TimeSpan.FromMinutes(1);
        limiter.QueueLimit = 2;
        limiter.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
    });
});

var app = builder.Build();

app.UseCors(policy => policy
    .WithOrigins([.. allowedOrigins])
    .AllowAnyMethod()
    .AllowAnyHeader());

app.UseRateLimiter();

// Resolve the generator DLL path. Default: dist/generator in the http-client-csharp package.
var generatorPath = Environment.GetEnvironmentVariable("GENERATOR_PATH")
    ?? Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "dist", "generator", "Microsoft.TypeSpec.Generator.dll"));

if (!File.Exists(generatorPath))
{
    Console.Error.WriteLine($"WARNING: Generator DLL not found at {generatorPath}");
    Console.Error.WriteLine("Set GENERATOR_PATH environment variable to the correct path.");
}
else
{
    Console.WriteLine($"Generator DLL: {generatorPath}");
}

app.MapGet("/health", () =>
{
    string dotnetVersion;
    try
    {
        var psi = new ProcessStartInfo("dotnet", "--version") { RedirectStandardOutput = true, UseShellExecute = false };
        var proc = Process.Start(psi)!;
        dotnetVersion = proc.StandardOutput.ReadToEnd().Trim();
        proc.WaitForExit();
    }
    catch (Exception ex) { dotnetVersion = ex.Message; }

    // Check for core dumps in /tmp and subdirectories
    var dumpFiles = new List<string>();
    if (Directory.Exists("/home"))
    {
        foreach (var f in Directory.GetFiles("/home", "coredump*", SearchOption.TopDirectoryOnly))
            dumpFiles.Add(f);
    }

    return Results.Ok(new
    {
        status = "ok",
        generatorFound = File.Exists(generatorPath),
        generatorPath,
        dotnetVersion,
        runtime = System.Runtime.InteropServices.RuntimeInformation.FrameworkDescription,
        os = System.Runtime.InteropServices.RuntimeInformation.OSDescription,
        arch = System.Runtime.InteropServices.RuntimeInformation.OSArchitecture.ToString(),
        coreDumps = dumpFiles
    });
});

app.MapGet("/coredump/{filename}", (string filename) =>
{
    var path = Path.Combine("/home", filename);
    if (!File.Exists(path) || !filename.StartsWith("coredump"))
        return Results.NotFound();
    return Results.File(path, "application/octet-stream", filename);
});

app.MapPost("/generate", async (HttpRequest request) =>
{
    var body = await JsonSerializer.DeserializeAsync<GenerateRequest>(
        request.Body, GenerateJsonContext.Default.GenerateRequest);

    if (body?.CodeModel is null || body?.Configuration is null)
    {
        return Results.BadRequest(new { error = "Missing 'codeModel' or 'configuration' fields" });
    }

    if (!File.Exists(generatorPath))
    {
        return Results.StatusCode(503);
    }

    // Create a temporary working directory
    var tempDir = Path.Combine(Path.GetTempPath(), "tsp-playground", Guid.NewGuid().ToString("N"));
    var generatedDir = Path.Combine(tempDir, "src", "Generated");
    Directory.CreateDirectory(generatedDir);

    var exitCode = -1;

    try
    {
        // Write the input files the generator expects
        await File.WriteAllTextAsync(Path.Combine(tempDir, "tspCodeModel.json"), body.CodeModel);
        await File.WriteAllTextAsync(Path.Combine(tempDir, "Configuration.json"), body.Configuration);

        var generatorName = body.GeneratorName ?? "ScmCodeModelGenerator";

        // Run the generator in-process by loading the assembly and invoking its entry point
        Console.WriteLine($"Starting generator in-process: {generatorPath}");
        Console.WriteLine($"Code model size: {body.CodeModel!.Length} chars");
        Console.WriteLine($"Configuration: {body.Configuration}");
        Console.WriteLine($"Temp dir: {tempDir}");

        var args = new[] { tempDir, "-g", generatorName, "--new-project" };

        var assembly = System.Reflection.Assembly.LoadFrom(generatorPath);
        var entryPoint = assembly.EntryPoint;
        if (entryPoint == null)
        {
            return Results.Json(
                new GenerateErrorResponse("Generator assembly has no entry point", ""),
                GenerateJsonContext.Default.GenerateErrorResponse,
                statusCode: 500);
        }

        try
        {
            var result = entryPoint.Invoke(null, new object[] { args });
            if (result is Task<int> taskInt)
            {
                exitCode = await taskInt;
            }
            else if (result is Task task)
            {
                await task;
                exitCode = 0;
            }
            else if (result is int intResult)
            {
                exitCode = intResult;
            }
            else
            {
                exitCode = 0;
            }
        }
        catch (Exception ex)
        {
            var inner = ex.InnerException ?? ex;
            Console.Error.WriteLine($"[generator error] {inner.Message}");
            Console.Error.WriteLine(inner.StackTrace);
            return Results.Json(
                new GenerateErrorResponse($"Generator threw exception: {inner.Message}", inner.StackTrace ?? ""),
                GenerateJsonContext.Default.GenerateErrorResponse,
                statusCode: 500);
        }

        Console.WriteLine($"Generator exited with code {exitCode}");

        if (exitCode != 0)
        {
            return Results.Json(
                new GenerateErrorResponse($"Generator failed with exit code {exitCode}", ""),
                GenerateJsonContext.Default.GenerateErrorResponse,
                statusCode: 500);
        }

        // Collect all generated files
        var files = new List<GeneratedFile>();
        if (Directory.Exists(tempDir))
        {
            foreach (var filePath in Directory.EnumerateFiles(tempDir, "*", SearchOption.AllDirectories))
            {
                // Skip the input files
                var fileName = Path.GetFileName(filePath);
                if (fileName is "tspCodeModel.json" or "Configuration.json")
                    continue;

                var relativePath = Path.GetRelativePath(tempDir, filePath).Replace('\\', '/');
                var content = await File.ReadAllTextAsync(filePath);
                files.Add(new GeneratedFile(relativePath, content));
            }
        }

        return Results.Json(
            new GenerateResponse(files),
            GenerateJsonContext.Default.GenerateResponse);
    }
    finally
    {
        // Clean up temp directory
        // Keep temp dir on failure for manual debugging via SSH
        if (exitCode == 0)
        {
            try { Directory.Delete(tempDir, recursive: true); } catch { }
        }
        else
        {
            Console.WriteLine($"Keeping temp dir for debugging: {tempDir}");
        }
    }
}).RequireRateLimiting("generate");

var port = Environment.GetEnvironmentVariable("PORT")
    ?? Environment.GetEnvironmentVariable("WEBSITES_PORT")
    ?? "5174";
var url = Environment.GetEnvironmentVariable("ASPNETCORE_URLS") ?? $"http://+:{port}";
Console.WriteLine($"C# playground server listening on {url}");
app.Run(url);

// --- Request/Response types ---

record GenerateRequest(string? CodeModel, string? Configuration, string? GeneratorName);
record GeneratedFile(string Path, string Content);
record GenerateResponse(List<GeneratedFile> Files);
record GenerateErrorResponse(string Error, string? Details);

[JsonSerializable(typeof(GenerateRequest))]
[JsonSerializable(typeof(GenerateResponse))]
[JsonSerializable(typeof(GenerateErrorResponse))]
[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
partial class GenerateJsonContext : JsonSerializerContext { }
