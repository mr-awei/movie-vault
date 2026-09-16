import io, sys, os
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

# 1. video.ts 删 flushSave import
patch(r'E:\Movie Vault\src\main\ipc\video.ts',
    "import { flushSave } from '../lib/store'\n",
    "")

# 2. video.ts 删两处 flushSave 调用（含前导注释）
patch(r'E:\Movie Vault\src\main\ipc\video.ts',
    """        // 关键：updateVideo 内部是 debounce 写盘，这里强制 flush 确保落盘
        await flushSave()
""",
    "")

patch(r'E:\Movie Vault\src\main\ipc\video.ts',
    """          })
          await flushSave()
""",
    """          })
""")
