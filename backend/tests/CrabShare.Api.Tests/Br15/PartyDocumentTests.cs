using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using CrabShare.Api.Common.Auth;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Tests.Br15;

/// <summary>Giấy tờ pháp lý của đối tác tổ chức để Admin xác minh (BR-009, BR-016); cá nhân dùng eKYC, không gửi giấy tờ (BR-010).</summary>
[Trait("Category", "Database")]
public sealed class PartyDocumentTests(Br15Fixture f) : IClassFixture<Br15Fixture>
{
    private static MultipartFormDataContent Form(string docType = "BusinessRegistration", string note = "Giấy chứng nhận đăng ký doanh nghiệp")
    {
        var photo = new ByteArrayContent(Br15Scenario.Jpeg("giay-phep"));
        photo.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        return new MultipartFormDataContent { { new StringContent(docType), "DocType" }, { new StringContent(note), "Note" }, { photo, "File", "giay-phep.jpg" } };
    }

    /// <summary>Đối tác doanh nghiệp vừa đăng ký, chưa xác minh.</summary>
    private async Task<(long UserId, long PartyId)> NewCompanyAsync()
    {
        var userId = await f.CreateUserAsync("Đại diện", Roles.Customer, Roles.Investor);
        var partyId = await f.PartyIdOfUserAsync(userId);
        await using var db = f.OpenDb();
        var party = await db.Parties.SingleAsync(p => p.PartyId == partyId);
        party.PartyType = "Company";
        party.LegalName = $"Công ty TNHH Hải Sản {f.Next()}";
        party.Representative = "Võ Đại Diện";
        party.VerificationStatus = "Unverified";
        party.VerifiedAt = null;
        await db.SaveChangesAsync();
        return (userId, partyId);
    }

    [Fact]
    public async Task Organization_sends_its_papers_and_the_admin_sees_them_before_deciding()
    {
        var (userId, partyId) = await NewCompanyAsync();
        using var company = f.Client(userId, Roles.Customer, Roles.Investor);

        var upload = await company.PostAsync("/api/me/party/documents", Form());
        Assert.Equal(HttpStatusCode.Created, upload.StatusCode);
        var doc = await upload.Content.ReadFromJsonAsync<JsonElement>();
        var documentId = doc.GetProperty("documentId").GetInt64();
        Assert.Equal("BusinessRegistration", doc.GetProperty("docType").GetString());

        // Gửi giấy tờ là nộp hồ sơ: chờ Admin xem
        await using (var db = f.OpenDb())
            Assert.Equal("Pending", await db.Parties.Where(p => p.PartyId == partyId).Select(p => p.VerificationStatus).SingleAsync());

        using var admin = f.Admin();
        var dossier = await admin.GetFromJsonAsync<JsonElement>($"/api/admin/parties/{partyId}/dossier");
        Assert.Equal(documentId, dossier.GetProperty("documents")[0].GetProperty("documentId").GetInt64());
        var account = dossier.GetProperty("accounts")[0];
        Assert.Equal(userId, account.GetProperty("userId").GetInt64());
        Assert.Equal("Verified", account.GetProperty("investorVerification").GetString());

        var file = await admin.GetAsync($"/api/admin/parties/{partyId}/documents/{documentId}/file");
        Assert.Equal(HttpStatusCode.OK, file.StatusCode);
        Assert.Equal("image/jpeg", file.Content.Headers.ContentType!.MediaType);
        Assert.True((await file.Content.ReadAsByteArrayAsync()).Length > 0);
        Assert.Equal(HttpStatusCode.OK, (await company.GetAsync($"/api/me/party/documents/{documentId}/file")).StatusCode);

        // Người khác không xem được giấy tờ của đối tác này
        using var stranger = f.Client(await f.CreateUserAsync("Người lạ", Roles.Customer), Roles.Customer);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/me/party/documents/{documentId}/file")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await stranger.GetAsync($"/api/admin/parties/{partyId}/dossier")).StatusCode);

        // Xác minh xong thì giấy tờ là căn cứ, không xoá được nữa
        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsync($"/api/admin/parties/{partyId}/verify", null)).StatusCode);
        var remove = await company.DeleteAsync($"/api/me/party/documents/{documentId}");
        Assert.Equal(HttpStatusCode.UnprocessableEntity, remove.StatusCode);
        Assert.Equal("party.document_locked", await Br15Fixture.ErrorCode(remove));
    }

    [Fact]
    public async Task Papers_can_be_removed_before_verification_and_a_rejected_party_returns_to_review()
    {
        var (userId, partyId) = await NewCompanyAsync();
        using var company = f.Client(userId, Roles.Customer, Roles.Investor);
        var first = await (await company.PostAsync("/api/me/party/documents", Form())).Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal(HttpStatusCode.NoContent, (await company.DeleteAsync($"/api/me/party/documents/{first.GetProperty("documentId").GetInt64()}")).StatusCode);
        Assert.Empty(await company.GetFromJsonAsync<JsonElement[]>("/api/me/party/documents") ?? []);

        using var admin = f.Admin();
        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsJsonAsync($"/api/admin/parties/{partyId}/reject", new { reason = "Ảnh mờ, không đọc được mã số thuế" })).StatusCode);

        Assert.Equal(HttpStatusCode.Created, (await company.PostAsync("/api/me/party/documents", Form("License", "Ảnh chụp lại rõ hơn"))).StatusCode);
        await using var db = f.OpenDb();
        var party = await db.Parties.SingleAsync(p => p.PartyId == partyId);
        Assert.Equal("Pending", party.VerificationStatus);
        Assert.Null(party.RejectReason);
    }

    [Fact]
    public async Task An_individual_verifies_with_ekyc_and_cannot_send_papers()
    {
        var userId = await f.CreateUserAsync("Cá nhân", Roles.Customer);
        using var person = f.Client(userId, Roles.Customer);

        var upload = await person.PostAsync("/api/me/party/documents", Form());

        Assert.Equal(HttpStatusCode.UnprocessableEntity, upload.StatusCode);
        Assert.Equal("party.documents_org_only", await Br15Fixture.ErrorCode(upload));
    }
}
