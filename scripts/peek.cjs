import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
p = r'E:\Movie Vault\src\renderer\src\components\settings\NetworkSection.tsx'
s = open(p, 'rb').read()
print('CRLF' if b'\r\n' in s else 'LF', '| size', len(s))
lines = s.decode('utf-8').splitlines()
for i in range(23, 32):
    print(i + 1, repr(lines[i]))
