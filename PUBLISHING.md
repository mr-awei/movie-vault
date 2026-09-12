# 发布流程（v2.0.1 起：只推代码，自动构建）

从 v2.0.1 起，**本地不再打包 / 签名 / 上传安装包**。你只需要推代码 + 打 tag，
GitHub Actions 会自动完成：构建安装包 → 证书签名 → 上传 GitHub Release → 同步 Gitee Release。

## 一键发布（推荐）

```cmd
node scripts/publish.mjs 2.1.0
```

脚本自动完成：
1. bump `package.json` 版本
2. 在 `CHANGELOG.md` 顶部插入该版本的占位段（**先手动补充本次改动内容再跑**，或跑完补内容后重跑——已存在时不覆盖）
3. `git commit` + `git tag v2.1.0`
4. 分别推送 `main` + tag 到 **Gitee 和 GitHub**
5. 提示你打开 Actions 页面看构建进度

之后什么都不用做——GitHub Actions（`.github/workflows/release.yml`）自动：
- Windows 上 `npm ci` + `typecheck` + `electron-builder` 构建安装包
- 用 `build/yingxia-sign.pfx` + 证书密码签名
- 上传到 GitHub Release（tag 对应）
- 创建 Gitee Release（正文放 GitHub 下载链接，Gitee 无 CI 无法自己构建）

## 首次使用前：配置两个 GitHub Secrets

打开 GitHub 仓库 → **Settings → Secrets and variables → Actions → New repository secret**：

| Secret 名 | 值 | 说明 |
|---|---|---|
| `CERT_PASSWORD` | `yingxia-sign.pfx` 的证书密码 | 你当初导入该证书到 Windows 时设置的密码；CI 上用它签名 |
| `GITEE_TOKEN` | Gitee 私人令牌 | 用于自动创建 Gitee Release（在 gitee.com → 个人设置 → 私人令牌 生成，勾选 `projects` 权限） |

> 不配置 `GITEE_TOKEN` 也不影响 GitHub 构建发布，只是跳过 Gitee Release 同步。
> `CERT_PASSWORD` 缺失时构建不会失败，但安装包未签名（Windows 会提示未知发布者）。

## 手动发布（不用脚本时）

```cmd
npm run typecheck
git add -A
git commit -m "v2.1.0: xxx"
git tag v2.1.0
git push https://github.com/mr-awei/yingxia-video-manager.git main v2.1.0
git push https://gitee.com/mr-awei/yingxia-video-manager.git main v2.1.0
```

## 构建进度

- GitHub Actions：`https://github.com/mr-awei/yingxia-video-manager/actions`
- 完成后 GitHub Release 自动出现安装包（约 5-8 分钟）

## 常见问题

- **Gitee 为什么不能自动构建？** Gitee 没有可用的免费 CI 服务（Gitee Go 已停止面向普通用户）。所以 Gitee Release 的正文由 GitHub Actions 同步 GitHub 下载链接，点链接从 GitHub 下载安装包。
- **本地还想手动打包？** 仍然可以：`npm run pack`，然后手动签名（`signtool sign /sha1 <证书指纹> /fd SHA256 /tr http://timestamp.sectigo.com /td SHA256 "release\影海 Setup x.x.x.exe"`）。
