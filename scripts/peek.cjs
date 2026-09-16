import sqlite3, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
p = r'C:\Users\19218\AppData\Roaming\yinghai\yinghai.db'
db = sqlite3.connect(p)
cols = [r[1] for r in db.execute('PRAGMA table_info(videos)')]
print('phash in videos:', 'phash' in cols)
n = db.execute('SELECT COUNT(*) FROM videos').fetchone()[0]
print('videos:', n)
db.close()
