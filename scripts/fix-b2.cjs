import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def patch(path, old, new):
    with open(path, 'rb') as f:
        raw = f.read()
    is_crlf = b'\r\n' in raw
    text = raw.decode('utf-8').replace('\r\n', '\n')
    if old not in text:
        print('NOT FOUND in', path, ':', repr(old[:60]))
        return
    text = text.replace(old, new, 1)
    if is_crlf:
        text = text.replace('\n', '\r\n')
    with open(path, 'wb') as f:
        f.write(text.encode('utf-8'))
    print('OK', path)

patch(r'E:\Movie Vault\src\shared\api-types.ts',
    "  videoLockMany(ids: string[], locked: boolean): Promise<number>",
    "  videoLockMany(ids: string[], locked: boolean): Promise<number>\n  /** v2.12：批量编辑元数据（白名单字段），返回实际更新条数 */\n  videoBatchUpdate(ids: string[], patch: Partial<Video>): Promise<number>")
