using CrabShare.Api.Infrastructure.Storage;
using Microsoft.Extensions.Hosting.Internal;
using Microsoft.Extensions.Options;

namespace CrabShare.Api.Tests;

public sealed class EvidenceStorageTests : IDisposable
{
    private readonly string _parent = Path.Combine(Path.GetTempPath(), "CrabShareEvidenceStorageTests");
    private readonly string _id = Guid.NewGuid().ToString("N");
    private string Root => Path.Combine(_parent, _id);
    private LocalFileStorage Storage => new(Options.Create(new StorageOptions { RootPath = Root }),
        new HostingEnvironment { ContentRootPath = _parent });

    [Theory]
    [InlineData("../outside")] [InlineData("../../outside")] [InlineData("/outside")]
    public async Task Escaping_paths_cannot_be_written_read_or_deleted(string path)
    {
        using var input = new MemoryStream([1, 2, 3]);
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => Storage.SaveAsync(input, "camera.png", "image/png", path, default));
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => Storage.OpenReadAsync(path, default));
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => Storage.DeleteAsync(path, default));
        Assert.False(Directory.Exists(Root));
    }
    private sealed class FailedStream : Stream
    {
        private bool _read;
        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken ct = default)
        {
            if (_read) throw new IOException("Injected stream failure");
            _read = true; buffer.Span[0] = 1; return ValueTask.FromResult(1);
        }
        public override void Flush() => throw new NotSupportedException();
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }
    [Fact]
    public async Task Interrupted_image_write_removes_the_partial_file()
    {
        using var input = new FailedStream();
        await Assert.ThrowsAsync<IOException>(() => Storage.SaveAsync(input, "camera.png", "image/png", "evidence", default));
        Assert.Empty(Directory.GetFiles(Root, "*", SearchOption.AllDirectories));
    }
    public void Dispose()
    {
        var root = Path.GetFullPath(Root);
        if (Path.GetDirectoryName(root) != Path.GetFullPath(_parent) || Path.GetFileName(root) != _id)
            throw new InvalidOperationException("Unexpected test storage root");
        if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
    }
}
