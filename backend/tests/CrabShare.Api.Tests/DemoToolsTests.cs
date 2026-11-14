using CrabShare.Api.Common;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;

namespace CrabShare.Api.Tests;

/// <summary>Công cụ demo (/api/dev/...) chỉ mở ở Development hoặc khi môi trường được bật Demo:Tools một cách chủ động.</summary>
public class DemoToolsTests
{
    private sealed class Env(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "CrabShare.Api";
        public string ContentRootPath { get; set; } = "";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private static IConfiguration Config(string? demoTools)
        => new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Demo:Tools"] = demoTools }).Build();

    [Fact]
    public void Development_always_has_the_demo_tools()
        => Assert.True(DemoTools.Enabled(new Env("Development"), Config(null)));

    [Theory]
    [InlineData(null)]
    [InlineData("false")]
    public void Production_hides_them_unless_switched_on(string? setting)
        => Assert.False(DemoTools.Enabled(new Env("Production"), Config(setting)));

    [Fact]
    public void Production_shows_them_when_the_environment_is_marked_as_a_demo()
        => Assert.True(DemoTools.Enabled(new Env("Production"), Config("true")));
}
