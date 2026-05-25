# 骑行训练 PWA

本地优先的 iPhone PWA，用来查看骑行训练计划、记录体重和基础身体数据。应用不需要后端，业务数据保存在浏览器本地 IndexedDB；当前已接入 51.LA 网站访问统计。

## 生产环境

当前把 GitHub Pages 作为生产环境。

```text
https://liswn.github.io/wk-sport-app/
```

分支约定：

| 分支 | 用途 |
| --- | --- |
| `main` | 源码、README、构建配置 |
| `gh-pages` | 生产环境静态构建产物 |

GitHub Pages 设置：

```text
Source：Deploy from a branch
Branch：gh-pages
Folder：/
```

## 页面访问路径

本地开发访问：

```text
http://127.0.0.1:5271/
```

生产预览访问：

```text
http://127.0.0.1:4173/
```

这是一个 Vite 单页应用，当前页面入口统一为 `/`。应用内页面通过底部 Tab 切换：

| 页面 | 访问方式 |
| --- | --- |
| 今日 | 打开 `/` 后点击「今日」 |
| 计划 | 打开 `/` 后点击「计划」 |
| 日历 | 打开 `/` 后点击「日历」 |
| 身体 | 打开 `/` 后点击「身体」 |
| 设置 | 打开 `/` 后点击「设置」 |

## 本地运行

安装依赖：

```bash
npm install
```

启动开发服务：

```bash
npm run dev
```

构建生产文件：

```bash
npm run build
```

预览生产构建：

```bash
npm run preview
```

## 发布到 GitHub Pages

当前生产发布方式是把 `dist/` 构建产物推送到 `gh-pages` 分支。GitHub Pages 请选择：

```text
Source：Deploy from a branch
Branch：gh-pages
Folder：/
```

仓库也保留了 GitHub Pages Actions 工作流：

```text
.github/workflows/pages.yml
```

如果以后改用 GitHub Actions 发布，需要在 GitHub Pages 设置里把 Source 改成 `GitHub Actions`。

详细发布步骤见：

```text
docs/RELEASE.md
```

使用说明和代码位置速查：

```text
docs/USER_GUIDE.md
docs/CODE_STRUCTURE.md
```

## Gitee Pages

Gitee Pages 服务当前不可用，因此不再作为生产环境。

## iPhone 添加到主屏幕

1. 用 Safari 打开生产环境 HTTPS 地址。
2. 点击分享按钮。
3. 选择「添加到主屏幕」。
4. 从主屏幕打开后会以 PWA 独立窗口运行。

## 隐私说明

- 所有训练、身体和打卡数据保存在浏览器本地 IndexedDB。
- 不需要登录。
- 不接后端 API。
- 已按当前需求接入 51.LA 网站访问统计，页面访问会加载第三方统计脚本。
- 训练、身体、打卡、备忘和 API Key 不会由本应用主动提交给 51.LA。
- JSON 备份和恢复都需要用户手动操作。
