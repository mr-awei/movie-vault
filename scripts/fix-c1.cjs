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

zh = """  'markers.title': "场景标记",
  'markers.subtitle': "定位精彩片段，点击时间点跳转播放",
  'markers.posPlaceholder': "时间 1:02:30",
  'markers.namePlaceholder': "标记名称",
  'markers.tagsPlaceholder': "标签（逗号分隔）",
  'markers.add': "添加标记",
  'markers.invalidPos': "时间格式不正确，示例：1:02:30 / 90 / 1:30",
  'markers.added': "已添加场景标记",
  'markers.fail': "添加标记失败",
  'markers.empty': "暂无场景标记，可添加影片里的精彩片段",
  'markers.unnamed': "未命名",
  'markers.playAt': "从该时间点播放",
"""
en = """  'markers.title': "Scene Markers",
  'markers.subtitle': "Bookmark key moments; click a time to jump",
  'markers.posPlaceholder': "Time 1:02:30",
  'markers.namePlaceholder': "Name",
  'markers.tagsPlaceholder': "Tags (comma separated)",
  'markers.add': "Add marker",
  'markers.invalidPos': "Invalid time. Examples: 1:02:30 / 90 / 1:30",
  'markers.added': "Scene marker added",
  'markers.fail': "Failed to add marker",
  'markers.empty': "No markers yet. Add key scenes of this video.",
  'markers.unnamed': "Unnamed",
  'markers.playAt': "Play from this position",
"""

patch(r'E:\Movie Vault\src\shared\i18n\locales\zh-CN.ts',
    "  'lock.progressSkipped':",
    zh + "  'lock.progressSkipped':")
patch(r'E:\Movie Vault\src\shared\i18n\locales\en-US.ts',
    "  'lock.progressSkipped':",
    en + "  'lock.progressSkipped':")
