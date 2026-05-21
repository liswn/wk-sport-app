# 骑行训练 PWA

本地优先的 iPhone PWA，用来查看骑行训练计划、记录体重和基础身体数据。应用不需要后端、不接统计或广告，数据保存在浏览器本地 IndexedDB。

## 页面访问路径

本地开发访问：

```text
http://127.0.0.1:5173/
```

生产预览访问：

```text
http://127.0.0.1:4173/
```

这是一个 Vite 单页应用，当前页面入口统一为 `/`，应用内页面通过底部 Tab 切换：

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

## 部署到 GitHub Pages

仓库已包含 GitHub Pages Actions 工作流：

```text
.github/workflows/pages.yml
```

推送到 GitHub 的 `main` 分支后，GitHub Actions 会执行：

```bash
npm ci
npm run build
```

并把 `dist/` 发布到 GitHub Pages。

## iPhone 添加到主屏幕

1. 用 Safari 打开部署后的 HTTPS 地址。
2. 点击分享按钮。
3. 选择「添加到主屏幕」。
4. 从主屏幕打开后会以 PWA 独立窗口运行。

## 隐私说明

- 所有训练、身体和打卡数据保存在浏览器本地 IndexedDB。
- 不需要登录。
- 不接后端 API。
- 不接埋点、统计、广告或第三方远程脚本。
- JSON 备份和恢复都需要用户手动操作。
