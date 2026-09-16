#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Split ipc/index.ts into domain modules by function boundaries."""
import re, io

SRC = r"E:\Movie Vault\src\main\ipc\index.ts"
OUT = r"E:\Movie Vault\src\main\ipc"

with io.open(SRC, encoding="utf-8") as f:
    lines = f.readlines()

# Find line numbers (1-based) of key boundaries
def find_line(pattern, start=0):
    for i in range(start, len(lines)):
        if re.search(pattern, lines[i]):
            return i + 1
    return None

def extract(start_line, end_line):
    """Return text of lines start_line..end_line inclusive (1-based)."""
    return "".join(lines[start_line-1:end_line])

# Boundaries (from earlier grep):
# registerLibraryIpc at L560, registerVideoIpc L1162, registerSettingsIpc L1710,
# registerPlaylistIpc L1738, registerSystemIpc L1758, registerIpc L2065, EOF 2072
b_lib = find_line(r"^function registerLibraryIpc", 0)          # 560
b_vid = find_line(r"^function registerVideoIpc", b_lib)        # 1162
b_set = find_line(r"^function registerSettingsIpc", b_vid)     # 1710
b_pls = find_line(r"^function registerPlaylistIpc", b_set)     # 1738
b_sys = find_line(r"^function registerSystemIpc", b_pls)       # 1758
b_exp = find_line(r"^export function registerIpc", b_sys)      # 2065
eof = len(lines)

print(f"boundaries: lib={b_lib} vid={b_vid} set={b_set} pls={b_pls} sys={b_sys} exp={b_exp} eof={eof}")

# helpers.ts = everything before registerLibraryIpc (L1..L559)
helpers = extract(1, b_lib - 1)
# strip the trailing 'function registerLibraryIpc() {' opening line already excluded by end=b_lib-1

with io.open(OUT + r"\helpers.ts", "w", encoding="utf-8", newline="\n") as f:
    f.write(helpers)
print("wrote helpers.ts", len(helpers.splitlines()), "lines")

# domain files: include from 'function registerXxxIpc() {' up to the line before next boundary
def func_text(start, end):
    # include the function header line itself (start) up to end-1 (next boundary line)
    return extract(start, end - 1)

with io.open(OUT + r"\library.ts", "w", encoding="utf-8", newline="\n") as f:
    f.write(func_text(b_lib, b_vid))
print("wrote library.ts")

with io.open(OUT + r"\video.ts", "w", encoding="utf-8", newline="\n") as f:
    f.write(func_text(b_vid, b_set))
print("wrote video.ts")

with io.open(OUT + r"\settings.ts", "w", encoding="utf-8", newline="\n") as f:
    f.write(func_text(b_set, b_pls))
print("wrote settings.ts")

with io.open(OUT + r"\playlist.ts", "w", encoding="utf-8", newline="\n") as f:
    f.write(func_text(b_pls, b_sys))
print("wrote playlist.ts")

with io.open(OUT + r"\system.ts", "w", encoding="utf-8", newline="\n") as f:
    f.write(func_text(b_sys, b_exp))
print("wrote system.ts")

# index.ts placeholder will be rewritten manually
print("done")
