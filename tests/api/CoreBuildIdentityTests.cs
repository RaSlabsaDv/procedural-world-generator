using System.Diagnostics;
using System.Text.RegularExpressions;
using Xunit;

namespace WorldGenerator.Api.Tests;

public sealed class CoreBuildIdentityTests
{
    [Fact]
    public async Task BuildIdentity_UsesTheCleanGitRevision()
    {
        using var fixture = new IdentityFixture();
        var revision = await fixture.InitializeGitAsync();

        Assert.Equal($"git:{revision}", await fixture.GenerateAsync());
    }

    [Fact]
    public async Task BuildIdentity_MarksModifiedCoreInputsAsDirty()
    {
        using var fixture = new IdentityFixture();
        var revision = await fixture.InitializeGitAsync();
        await File.AppendAllTextAsync(Path.Combine(fixture.Root, "src", "core", "input.txt"), "changed");

        Assert.Equal($"git:{revision}-dirty", await fixture.GenerateAsync());
    }

    [Fact]
    public async Task BuildIdentity_FallsBackWhenThereIsNoRepository()
    {
        using var fixture = new IdentityFixture();

        Assert.Equal("unversioned", await fixture.GenerateAsync());
    }

    [Fact]
    public async Task BuildIdentity_FallsBackWhenGitIsUnavailable()
    {
        using var fixture = new IdentityFixture();

        Assert.Equal("unversioned", await fixture.GenerateAsync(
            $"-p:CoreBuildIdGitExecutable={Path.Combine(fixture.Root, "missing-git")}"));
    }

    [Fact]
    public async Task BuildIdentity_DoesNotTreatFailedStatusAsDirtyOrClean()
    {
        using var fixture = new IdentityFixture();
        await fixture.InitializeGitAsync();
        // rev-parse still succeeds, but status rejects this corrupt index.
        await File.WriteAllTextAsync(Path.Combine(fixture.Root, ".git", "index"), "invalid index");

        Assert.Equal("unversioned", await fixture.GenerateAsync());
    }

    [Fact]
    public async Task BuildIdentity_UsesAnExplicitOverrideWithoutGit()
    {
        using var fixture = new IdentityFixture();

        Assert.Equal("release-2026.11", await fixture.GenerateAsync("-p:CoreBuildId=release-2026.11"));
    }

    private sealed class IdentityFixture : IDisposable
    {
        public string Root { get; } = Path.Combine(Path.GetTempPath(), $"pwg identity {Guid.NewGuid():N}");

        public IdentityFixture()
        {
            var directory = new DirectoryInfo(AppContext.BaseDirectory);
            while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "ProceduralWorldGenerator.slnx")))
            {
                directory = directory.Parent;
            }

            Assert.NotNull(directory);
            var hosts = Path.Combine(Root, "src", "hosts");
            Directory.CreateDirectory(hosts);
            Directory.CreateDirectory(Path.Combine(Root, "src", "core"));
            File.Copy(
                Path.Combine(directory.FullName, "src", "hosts", "HostBuildIdentity.targets"),
                Path.Combine(hosts, "HostBuildIdentity.targets"));
            File.WriteAllText(Path.Combine(Root, "src", "core", "input.txt"), "original");
            File.WriteAllText(Path.Combine(Root, ".gitignore"), "obj/\n");
            File.WriteAllText(Path.Combine(Root, "Identity.proj"), """
                <Project>
                  <PropertyGroup><IntermediateOutputPath>obj/</IntermediateOutputPath></PropertyGroup>
                  <Import Project="src/hosts/HostBuildIdentity.targets" />
                </Project>
                """);
        }

        public async Task<string> InitializeGitAsync()
        {
            await RunAsync("git", "init", "--quiet", ".");
            await RunAsync("git", "add", "--all");
            await RunAsync("git", "-c", "user.name=Identity Test", "-c", "user.email=identity@example.invalid",
                "-c", "commit.gpgsign=false", "-c", $"core.hooksPath={Path.Combine(Root, "no-hooks")}",
                "commit", "--quiet", "-m", "fixture");
            return (await RunAsync("git", "rev-parse", "--short=12", "HEAD")).Trim();
        }

        public async Task<string> GenerateAsync(params string[] properties)
        {
            await RunAsync("dotnet", ["msbuild", "Identity.proj", "-t:GenerateCoreBuildId", "-nologo", "-v:quiet", .. properties]);
            var source = await File.ReadAllTextAsync(Path.Combine(Root, "obj", "CoreBuildId.g.cs"));
            var match = Regex.Match(source, "ValueCore = \"([^\"]+)\"");
            Assert.True(match.Success, source);
            return match.Groups[1].Value;
        }

        private async Task<string> RunAsync(string executable, params string[] arguments)
        {
            var start = new ProcessStartInfo(executable)
            {
                WorkingDirectory = Root,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false
            };
            foreach (var argument in arguments)
            {
                start.ArgumentList.Add(argument);
            }

            using var process = Process.Start(start)!;
            var stdout = process.StandardOutput.ReadToEndAsync();
            var stderr = process.StandardError.ReadToEndAsync();
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
            try
            {
                await process.WaitForExitAsync(timeout.Token);
            }
            catch (OperationCanceledException)
            {
                process.Kill(entireProcessTree: true);
                throw;
            }

            var output = await stdout;
            var error = await stderr;
            Assert.True(process.ExitCode == 0, $"{executable} exited {process.ExitCode}: {output}\n{error}");
            return output;
        }

        public void Dispose() => Directory.Delete(Root, recursive: true);
    }
}
