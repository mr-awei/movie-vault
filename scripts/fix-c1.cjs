import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def patch(path, old, new):
    with open(path, 'rb') as f:
        raw = f.read()
    is_crlf = b'\r\n' in raw
    text = raw.decode('utf-8').replace('\r\n', '\n')
    if old not in text:
        print('NOT FOUND in', path, ':', repr(old[:70]))
        return
    text = text.replace(old, new, 1)
    if is_crlf:
        text = text.replace('\n', '\r\n')
    with open(path, 'wb') as f:
        f.write(text.encode('utf-8'))
    print('OK', path)

patch(r'E:\Movie Vault\src\shared\api-types.ts',
    "  markerDelete(id: string): Promise<boolean>",
    "  markerDelete(id: string): Promise<boolean>\n  /** v2.12.1：重复检测进度（主进程推送 {done,total}） */\n  onDuplicateProgress(cb: (p: { done: number; total: number }) => void): () => void")
