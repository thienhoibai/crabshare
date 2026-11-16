using CrabShare.Api.Common;

namespace CrabShare.Api.Tests;

public class CorsOriginsTests
{
    private static readonly Func<string, bool> Allowed = CorsOrigins.Matcher(
        ["https://crabshare.vercel.app", "http://localhost:5173/"],
        ["https://crabshare-*-nguyn1hien.vercel.app"]);

    [Theory]
    [InlineData("https://crabshare.vercel.app")]
    [InlineData("http://localhost:5173")]
    [InlineData("https://crabshare-1xil2zzqp-nguyn1hien.vercel.app")]
    [InlineData("https://crabshare-git-develop-nguyn1hien.vercel.app")]
    [InlineData("https://CRABSHARE-GIT-DEVELOP-NGUYN1HIEN.VERCEL.APP")]
    public void Origin_cua_minh_duoc_goi_API(string origin) => Assert.True(Allowed(origin));

    [Theory]
    [InlineData("https://evil.vercel.app")]
    [InlineData("https://crabshare-x.evil.com-nguyn1hien.vercel.app.evil.com")]
    [InlineData("https://crabshare-a.b-nguyn1hien.vercel.app")]
    [InlineData("http://crabshare-git-develop-nguyn1hien.vercel.app")]
    [InlineData("https://crabshare--nguyn1hien.vercel.app")]
    [InlineData("https://crabshare.vercel.app.evil.com")]
    public void Origin_la_bi_chan(string origin) => Assert.False(Allowed(origin));
}
