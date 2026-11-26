# Quota Panel

[English](README.md) | [Русский](README.ru.md) | 简体中文

用于 [Orca](https://orca.com) 的右侧边栏面板，帮你关注 [OpenRouter](https://openrouter.ai) 的每日免费请求额度，
避免过早耗尽。

![OpenRouter Quota 面板（中文）](assets/preview-zh.png)

## 功能

- **剩余请求数 (rpd)** — 显示当前 UTC 日的 `remaining / limit`，配有剩余额度进度条、阈值刻度线以及
  距每日 00:00 UTC 重置的实时倒计时（悬停可查看**本地时区**的重置时间）。
- **三种模式 + 自动** — **极速**、**均衡** 和 **省流**，以及 **自动**（按剩余额度阈值选择模式）。
  顶部还显示当前版本徽章（`v1.1.0`）。
- **设置弹窗（模式阈值）** — 点击顶部齿轮图标即可编辑极速（`>`）、省流（`<`）与均衡（`最小 – 最大`）
  边界。相邻阈值保持联动且经过校验（`最小 < 最大`），保存按钮仅在存在未保存修改时启用。
- **带 PIN 保护的 API 密钥** — 在可折叠的 **API 密钥** 分区中粘贴 OpenRouter 密钥（或使用 `key.txt`）。
  密钥在插件存储中以 AES-256-GCM 静态加密（基于本机派生密钥），查看密钥需输入本地 PIN（仅存储
  SHA-256 哈希），支持一键复制，并在 30 秒后或折叠分区时自动隐藏。
- **技能配置 (`config.json`)** — 紧凑的 2×2 数值表单（`cronMinutes`、`maxWorkers`、`perWorkerRpm`、
  `rpmCap`）以及 `defaultEffort`、`timezone` 和 `workWindowHours`，附带即时提示气泡。保存后会通过
  Orca CLI 创建或更新名为 `Quota review` 的机器人自动化任务。
- **内置 `quota-aware-planning` 技能** — 一键安装到所有 Orca 机器人（`~/.orca/bots/*/skills`）及
  OpenCode 全局镜像目录（保留已有配置、密钥与模式文件），显示 `已安装` 徽章并支持一键卸载。
- **日志** — 可折叠的持久化日志视图，按级别着色（`info` / `warn` / `error`），提供复制、清除按钮
  及自动滚动。
- **三种语言** — 支持英语、俄语和中文，按本地环境自动检测，并可在顶部下拉菜单一键切换（重启后保持）。

## 安装

在 Orca 中：**设置 → 插件 → 添加插件 → 从 Git URL**，然后粘贴本仓库地址：

```
https://github.com/sleet1k/orca-quota-panel.git
```

首次运行时 Orca 会请求授权（插件会运行一个小型 worker 并存储自己的数据），之后 **Quota Panel** 会
出现在右侧边栏。

## 数据与隐私

- API 密钥在插件存储中以 AES-256-GCM 静态加密（使用本机派生密钥），同时导出为 `key.txt` 供 bash
  技能读取，且**绝不**提交到仓库。
- 查看密钥受本地 PIN 保护（仅保存其 SHA-256 哈希）；显示的密钥为只读，30 秒后或折叠分区时自动隐藏。
- 阈值、语言选择、自动化 ID 及近期日志保存在插件存储中，重启后仍然保留。

## 开发

```sh
orca plugin validate .        # 校验清单与资源
orca plugin check .           # 每个场景渲染一次面板
orca plugin dev watch .       # 将文件夹加载到 Orca 并实时重载（Ctrl-C 卸载）
```

面板是单个 `src/panel.html`（HTML/CSS/JS，无需构建）。worker 是 `src/worker.ts`；
`src/protocol.ts` 定义两者之间的请求契约，`skill/quota-aware-planning/` 包含内置技能。Orca 在加载时
转译 worker。

## 更新日志

参见 [CHANGELOG.md](CHANGELOG.md)。

## 许可证

[MIT](LICENSE)。
