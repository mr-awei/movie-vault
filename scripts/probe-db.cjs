import sqlite3, json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

db = sqlite3.connect(r'C:\Users\19218\AppData\Roaming\yinghai\yinghai.db')
rows = db.execute('SELECT title, tags, tag_categories FROM videos WHERE tag_categories IS NOT NULL LIMIT 5').fetchall()
for title, tags, cats in rows:
    print('标题:', title)
    try:
        c = json.loads(cats)
        for k, v in c.items():
            print('  ', k, '=>', v)
    except Exception as e:
        print('  cats parse err', e)
    print('  tags:', tags)
