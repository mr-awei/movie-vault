import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

path = r'E:\Movie Vault\src\renderer\src\components\Toolbar.tsx'
with open(path, 'rb') as f:
    raw = f.read()
is_crlf = b'\r\n' in raw
text = raw.decode('utf-8').replace('\r\n', '\n')
old = "onClick={() => { console.log('[batch] menu click force=true'); setBatchMenuOpen(false); onBatchFetch(true) }}"
new = "onClick={() => { setBatchMenuOpen(false); onBatchFetch(true) }}"
if old in text:
    text = text.replace(old, new, 1)
    print('replaced OK')
else:
    print('NOT FOUND')
if is_crlf:
    text = text.replace('\n', '\r\n')
with open(path, 'wb') as f:
    f.write(text.encode('utf-8'))
