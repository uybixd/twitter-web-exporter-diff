# twitter-web-exporter-diff（fork）

这是 prinsss/twitter-web-exporter 的一个 fork。  
上游项目：https://github.com/prinsss/twitter-web-exporter

English README: [../README.md](../README.md)

## 这个 fork 的新增功能

这个 fork 增加了 **Followers/Following 列表快照对比**。  
当关注列表发生变化时，你可以立刻知道发生了什么。

## 使用方法：Followers/Following 快照对比

1. 打开 Twitter/X 上某个用户的 **Followers** 或 **Following** 页面。  
2. 向下滚动加载足够多的用户（建议滚动到底部，以获得完整快照）。  
3. 点击 **Followers** 或 **Following** 面板，打开表格视图。  
4. 点击 **Save Snapshot**，把当前列表保存为基准快照。  
5. 之后当你发现关注数有变化时，先点击 **Clear** 清除之前抓取的关注列表，重复步骤 1-3，然后点击 **Compare Snapshot**。  
6. 你会看到差异结果：  
   - **Added**：最新快照中新增的账号  
   - **Removed**：最新快照中消失的账号  
   - **Changed**：同一用户 id，但资料字段发生了变化（例如名字/头像）

提示：
- 快照按钮只会在 Followers/Following 页面显示。  
- 对比结果取决于页面实际加载了多少数据（滚动很关键）。

我用 Elon 做了一个演示。

<div style="display:flex; gap:20px;">
  <img src="04-demo-added.png" width="48%">
  <img src="05-demo-removed.png" width="48%">
</div>

## 安装

与上游一致：  
https://github.com/prinsss/twitter-web-exporter#installation

安装 Tampermonkey 后，使用以下链接安装：
[twitter-web-exporter-snapshot-diff.user.js](https://github.com/uybixd/twitter-web-exporter-diff/releases/latest/download/twitter-web-exporter-snapshot-diff.user.js)

## 许可证

MIT（与上游一致）
