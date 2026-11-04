# 题库随机练习

Java《程序设计基础》与《数据库原理及应用》题库的纯静态练习网站，共 550 题。

- 单选 231 · 判断 120 · 填空 81 · 简答 118
- 随机 / 顺序练习，可按题库、题型筛选
- 选择、判断、填空即时判分；简答对照参考答案自评
- 错题自动收集，可「只练错题」，支持「这次算我对」改判
- 练习记录保存在浏览器本地（localStorage），关掉再开继续
- 手机端适配：抽屉式筛选面板、底部导航、可添加到主屏幕（PWA）

## 本地运行

直接双击 `index.html` 即可；或起一个静态服务：

```bash
python -m http.server 8000
# 打开 http://localhost:8000
```

## 部署到 GitHub Pages

仓库已初始化并完成首次提交，推送到 GitHub 后在仓库设置里开启 Pages 即可：

1. 在 GitHub 新建一个 **public** 仓库（不要勾选初始化 README）；
2. 本地执行：

   ```bash
   git remote add origin https://github.com/<你的用户名>/<仓库名>.git
   git branch -M main
   git push -u origin main
   ```

3. 打开仓库 **Settings → Pages**，Source 选 **Deploy from a branch**，分支选 `main`、目录选 `/ (root)`，保存；
4. 等 1 分钟左右，访问：

   ```
   https://<你的用户名>.github.io/<仓库名>/
   ```

### 用手机练习

- 直接访问上面的网址；
- iOS Safari：分享 → 添加到主屏幕；Android Chrome：菜单 → 添加到主屏幕，即可像 App 一样全屏使用。

## 目录

```
index.html            页面结构
manifest.json         PWA 配置
assets/style.css      样式（含移动端适配）
assets/app.js         练习逻辑
assets/data.js        题库数据（window.QUESTIONS）
assets/icon-*.png     应用图标
gen_icons.py          图标生成脚本
```

## 更新题库

题库数据由 `../build_site.py` 从两份纯文本题库生成，重新生成后再提交 `assets/data.js` 即可。
