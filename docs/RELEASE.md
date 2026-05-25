# 发布流程

以后如果说“发布”，按下面流程执行。

## 1. 确认工作区

```bash
git status --short --branch
```

确认没有意外未提交文件。

## 2. 构建验证

```bash
npm run build
```

构建通过后，`dist/` 是本次生产产物。

## 3. 提交源码

```bash
git add .
git commit -m "<change summary>"
git push github main
```

## 4. 更新生产分支

生产环境使用 GitHub Pages 的 `gh-pages` 分支，根目录直接放静态产物。

```bash
# 在 .gitee-pages 发布工作区内同步 dist 内容
# 保留 .git，清空其它文件
# 复制 dist/* 到 .gitee-pages/
# 保留或创建 .nojekyll、.spa、404.html

git -C .gitee-pages add .
git -C .gitee-pages commit -m "Deploy <change summary>"
git -C .gitee-pages push github gh-pages
```

## 5. 生产地址

```text
https://liswn.github.io/wk-sport-app/
```

GitHub Pages 设置：

```text
Source：Deploy from a branch
Branch：gh-pages
Folder：/
```

## 6. 注意

- 不把 `node_modules/`、`dist/` 提交到 `main`。
- 用户训练和身体数据只在浏览器 IndexedDB，本地不会进入仓库。
- 发布前优先让本地 `http://127.0.0.1:5271/` 看过一遍。
