param(
    [Parameter(Mandatory = $false)]
    [string]$DataDirOverride
)

# 影海卸载器用户数据保护脚本
# 由卸载器（NSIS）在用户勾选「删除用户数据」后调用。
# 职责：
#   1. 解析 %APPDATA%\movie-vault\data.json 中的媒体库/视频路径
#   2. 若任一路径位于用户数据目录内部 → 不删除任何内容，输出 LIBRARY_INSIDE_USERDATA，exit 9
#   3. 无冲突 → 删除用户数据目录，exit 0
#   4. 配置无法解析 → 保守不删除，输出 PARSE_FAILED，exit 8
# 绝对红线：不得删除用户设定的媒体库里的任何文件。

$ErrorActionPreference = 'Stop'

# NSIS 传入 -DataDirOverride 以指定要清理的目录；未传入则使用默认位置。
$dataDir = if ($DataDirOverride) { $DataDirOverride } else { Join-Path $env:APPDATA 'movie-vault' }
$dataDir = $dataDir.TrimEnd('\')

if (-not (Test-Path -LiteralPath $dataDir)) {
    exit 0
}

$dataJson = Join-Path $dataDir 'data.json'

# 路径规范化：去尾部反斜杠
function Get-Normalized([string]$value) {
    if ([string]::IsNullOrWhiteSpace($value)) { return $null }
    return ($value -replace '\\+$', '')
}

# 判断路径是否位于用户数据目录内部（含相等），大小写不敏感
function Test-InsideUserData([string]$path) {
    if ([string]::IsNullOrWhiteSpace($path)) { return $false }
    $p = (Get-Normalized $path).ToLowerInvariant()
    $d = $dataDir.ToLowerInvariant()
    if ($p -eq $d) { return $true }
    return $p.StartsWith($d + '\')
}

# 强制结束可能仍在运行的影海进程，释放 Electron 缓存/Storage 文件锁。
# 卸载器走到这里时应用文件已被删除，残留进程多为僵尸句柄，直接结束即可。
function Stop-yinghaiProcesses {
    $names = @('movie-vault', 'local-movie-vault', '影海')
    $procs = Get-Process -ErrorAction SilentlyContinue | Where-Object {
        $names -contains $_.ProcessName -or ($_.Path -and ($_.Path -like '*movie-vault*' -or $_.Path -like '*local-movie-vault*' -or $_.Path -like '*影海*'))
    }
    foreach ($proc in $procs) {
        try {
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        } catch {
            # 忽略无权结束或已退出的进程
        }
    }
}

# 无配置记录（应用从未在本机运行过）：目录内只有缓存/日志，删除安全
if (-not (Test-Path -LiteralPath $dataJson)) {
    Stop-yinghaiProcesses
    Start-Sleep -Milliseconds 500
    Remove-Item -LiteralPath $dataDir -Recurse -Force -ErrorAction SilentlyContinue
    exit 0
}

try {
    $j = Get-Content -LiteralPath $dataJson -Raw -Encoding UTF8 | ConvertFrom-Json
} catch {
    Write-Output 'PARSE_FAILED'
    exit 8
}

# 收集所有指向磁盘的路径引用：媒体库根目录、视频文件、以及顶层任意 path/folder/dir 字符串字段
$paths = @()
if ($null -ne $j.libraries) {
    $paths += @($j.libraries | ForEach-Object { Get-Normalized $_.folderPath })
}
if ($null -ne $j.videos) {
    $paths += @($j.videos | ForEach-Object { Get-Normalized $_.path })
}
$paths += @($j | Get-Member -MemberType NoteProperty | ForEach-Object {
    $v = $j.($_.Name)
    if ($v -is [string] -and $_.Name -match 'path|folder|dir') { Get-Normalized $v }
})

if (@($paths | Where-Object { Test-InsideUserData $_ }).Count -gt 0) {
    Write-Output 'LIBRARY_INSIDE_USERDATA'
    exit 9
}

# 删除前确保无残留进程持有文件锁，并给予进程退出缓冲时间。
Stop-yinghaiProcesses
Start-Sleep -Milliseconds 1000

$deleted = $false
$lastError = $null
for ($i = 0; $i -lt 5; $i++) {
    try {
        Remove-Item -LiteralPath $dataDir -Recurse -Force -ErrorAction Stop
        $deleted = $true
        break
    } catch {
        $lastError = $_
        if ($i -lt 4) { Start-Sleep -Milliseconds 1200 }
    }
}

if (-not $deleted) {
    Write-Output 'DELETE_FAILED'
    exit 1
}
exit 0
