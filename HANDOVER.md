# dsh-comfyui-bridge 交接文档

> **交接日期**: 2026-09-08
> **插件版本**: 1.1.0（本次迁移适配版）
> **适配 DSH 版本**: 0.1.7-rc.1（`@deepseek-ai/dsh` npm monorepo）
> **项目新家**: `C:\Users\lcl\Desktop\DSH插件开发\dsh-comfyui-bridge`

---

## 一、这个插件是什么

DSH（DeepSeek Harness）的 Host 侧 cordis 插件，让任何 DSH agent 会话直接驱动本地/局域网 ComfyUI 生图生视频。对模型暴露 **8 个全局工具**：

| 工具 | 作用 |
|---|---|
| `comfyui_status` | 服务健康/版本/显卡 VRAM/队列检查；连不上时自动诊断安装与设备可行性 |
| `comfyui_models` | 模型分类枚举 + 视频生成能力探测 |
| `comfyui_generate` | **核心**：preset 预设模式（txt2img/img2img/wan_t2v/wan_i2v/wan22_ti2v/svd_img2vid/animatediff/h3_t2v/h3_flf2v/h3_r2v）+ workflow 逃生舱（任意 API 格式图）|
| `comfyui_history` | 历史检索与产物断点续下 |
| `comfyui_interrupt` | 中断当前任务，可选清队列/卸载模型释放显存 |
| `comfyui_upload` | 本地文件上传至 ComfyUI input/temp/output 目录 |
| `comfyui_fetch_model` | 模型下载：已知注册表（ModelScope/HF-Mirror 镜像）或自定义 URL，断点续传 + 字节校验 |
| `comfyui_install` | ComfyUI 官方便携版一键安装评估（需用户显式确认）|

产物自动下载到会话工作区 `comfyui-outputs/`，供 `read_image` 查看与多模态质检。

## 二、源码从哪里来（迁移记录）

| 事项 | 说明 |
|---|---|
| **原安装形态** | npm 包 `dsh-comfyui-bridge@1.0.0`，经 pnpm 装在 `dsh-home\profiles\web\node_modules\dsh-comfyui-bridge`（`dsh plugin --profile web add` 产物）|
| **运行加载机制** | profile 的 `package.json` → `dsh.profile.bundles` 列表含 `"dsh-comfyui-bridge"` → 挂载包内 `cordis.patch.yml`（`dsh.bundle.patch` 声明）→ cordis 按 `insert` 行加载 `lib/index.mjs` |
| **本次迁移** | 全部 7 个 lib 源文件 + package.json + cordis.patch.yml + README/LICENSE **原样复制**到本目录，随后做 0.1.7 适配（见下）|
| **原位置仍在用** | `dsh-home\profiles\web\node_modules\dsh-comfyui-bridge`（1.0.0）仍是当前 DSH 运行时实际加载的副本；**切换到本目录开发版的方法见第五节** |

## 三、0.1.7 适配内容（1.0.0 → 1.1.0）

对照 `backend\dsh\node_modules\@deepseek-ai\dsh@0.1.7-rc.1` 全部官方插件逐一验证后的结论与改动：

### 3.1 接口兼容性审查结论

| 接口点 | 0.1.7 状态 | 结论 |
|---|---|---|
| `export const name / inject` | 不变 | ✅ 无需改 |
| `export function apply(ctx, config)` | 不变（官方 `dsh-tool-web` 同构）| ✅ 无需改 |
| `ctx.tools.register({name, description, parameters, output:{schema,render}, execute})` 原生定义 | `dsh-tools/lib/index.js:2878 register()` 仍直接接受；**新增接受 `timeoutMs` 字段**（正有限数校验）| ✅ 兼容，可加增强 |
| `ctx.systemPrompt.section({name, order, text})` | 不变（官方有 `getSectionOrder()` 辅助但非必须）| ✅ 无需改 |
| `ctx.effect()` | 不变 | ✅ 无需改 |
| `ctx.web` / `ctx.web.fetch` | 未使用（本插件自持 fetch）| — |
| `defineTool()` + schemastery | 官方新工具的推荐形态，**但非破坏性**——registry 两条路都接受 | 保持原生定义（零依赖纪律优先）|

### 3.2 实际改动（最小侵入，共 3 处）

1. **`lib/index.mjs` — `comfyui_generate` 加 `timeoutMs: 3600000`**
   原因：0.1.7 的 `dsh-tool-call-timeout-policy` 会读工具定义的 `timeoutMs` 作为协作超时预算；generate 内部 `timeout_sec` 上限 3600s（长视频任务），外层预算若小于内部预算会被策略中途误杀。两者对齐为 1 小时。
2. **`lib/index.mjs` — `comfyui_fetch_model` 加 `timeoutMs: 3600000`**
   原因同上：大模型断点续传（10-20GB）可达 1 小时以上。
3. **`package.json`**: `version` 1.0.0 → 1.1.0；`dsh.compatibility.tested` 增加 `"0.1.7-rc.1"`。

**未改动**（有意保守）：工具参数 schema 保持手写 JSON Schema（不用 schemastery 声明式），维持插件"零 @deepseek-ai 依赖"纪律——官方 `dsh-web-search-panel` 等社区插件同样如此（见其 index.mjs 头注释"依赖纪律"）。

### 3.3 验证记录

- `node --check` 全部 7 个 lib 文件语法通过
- `smoke-test.mjs` 冒烟测试通过：模拟 cordis ctx 调 `apply()`，确认 8 工具注册、`comfyui_generate`/`comfyui_fetch_model` 的 `timeoutMs=3600000` 生效、`comfyui:guide` 系统提示词段挂载
- 运行环境实测：本会话内 8 工具全程可用（生图/上传/中断/状态等真实调用成功）

## 四、源码架构地图

```
lib/
├── index.mjs          133KB 主入口。注释头有完整设计说明。结构：
│   ├─ 常量/默认配置 (DEFAULT_BASE_URL 等)
│   ├─ 工具函数 (clampInt, formatTimestamp, levenshtein, findSimilarNames...)
│   ├─ readSafetensorsGroups()   safetensors 头解析(模型库探测用)
│   ├─ normalizeLoraArg()        LoRA 参数归一 ("file@0.8" 语法)
│   ├─ buildTxt2Img()/buildImg2Img()/buildWan22TI2V()   预设工作流构图
│   │   (其余预设 wan/svd/animatediff/h3 在同文件分散函数)
│   ├─ inferWorkspaceFromSessions()  从会话存储反推工作区根(产物落点)
│   ├─ ComfyClient 类           HTTP 客户端: /system_stats /object_info /prompt
│   │                           /history /queue /free /upload/image; 404 自适应
│   │                           回退 /api 前缀并缓存
│   └─ apply(ctx, config)       入口: 组装 8 个工具对象 + systemPrompt 段 + 注册
├── capability.mjs      设备能力守卫: probeDevice/estimate/check (显存预算,
│                       空闲内存检查, 生成前拦截"装不下"任务)
├── downloader.mjs      单连接断点续传下载器 (Range 请求, AbortSignal)
├── imageMeta.mjs       PNG/JPEG 尺寸读取 + resolveAutoDimensions (SD1.5/SDXL/Flux
│                       尺寸启发, 64 倍数对齐)
├── installer.mjs       ComfyUI 官方便携版安装评估与执行 (assessComfyUIStatus/
│                       executeComfyUIInstall)
├── modelRegistry.mjs  已知模型注册表 (KNOWN_MODELS + byFilename/findInLibrary +
│                       STANDARD_SUBFOLDERS + inferSubfolderFromName 关键词级联)
└── pathDiscovery.mjs  模型库发现: 运行进程扫描 → 全盘常见路径扫描 →
                        extra_model_paths.yaml; chooseFetchDestination
cordis.patch.yml       bundle 补丁: 单行 insert id=comfyui-bridge,
                        通用默认 config (baseUrl/outputsDir/timeout 等)
```

**关键设计约定**：
- **零依赖纪律**：不 import 任何 `@deepseek-ai/*`；只用 Node 内置（fs/path/os/zlib/crypto/child_process）+ 全局 fetch/FormData/AbortController。升级 DSH 不需要动本插件。
- **结构化返回**：所有 execute 永不 throw 到框架层，返回 `{ok, status, error, ...}` 由 render 呈现。
- **机器配置分离**：`cordis.patch.yml` 只放通用默认；机器特定配置（modelsDir 等）写用户层 `dsh-home\cordis.patch.yml` 同 id 行覆盖。

## 五、开发与部署工作流

### 5.1 当前生效副本 vs 本目录

**状态更新（2026-09-08 迁移时已执行）**：已用 junction 把运行时指向本目录——
`dsh-home\profiles\web\node_modules\dsh-comfyui-bridge` 现在是指向本目录的 Junction（LinkType 验证过，经该路径加载确认为 1.1.0 + timeoutMs 生效）。**DSH Desktop 重启后即运行本目录源码**。原 npm 1.0.0 实体完整备份在旁：`..\dsh-comfyui-bridge-npm-1.0.0.bak`。

回滚方法（若需）：
```powershell
$nm = "$env:APPDATA\DSH Desktop\dsh-home\profiles\web\node_modules\dsh-comfyui-bridge"
Remove-Item $nm -Force                       # 删 Junction 本体
Copy-Item "C:\Users\lcl\Desktop\DSH插件开发\dsh-comfyui-bridge-npm-1.0.0.bak" $nm -Recurse
```

日后若 `dsh plugin update` 或重装覆盖了 junction，按同样三步重建（备份→删→junction）。

### 5.2 改代码后如何生效

- junction 直连：**重启 DSH Desktop**（Host 进程重启才重载插件模块）
- 普通 pnpm 装载：同上，且要先重新 add 或手动同步文件
- 验证：新会话里模型应能看到 `comfyui_status` 等工具；或在 Web UI 插件页看本插件行

### 5.3 冒烟测试（无需 DSH 环境）

```powershell
node "C:\Users\lcl\Desktop\DSH插件开发\dsh-comfyui-bridge\smoke-test.mjs"
# 预期输出: 注册工具数 = 8, 两个 timeoutMs=3600000, ✓ 全部通过
```

### 5.4 发布流程（下次发版）

```powershell
# 版本号已改好(package.json 1.1.0) → 回到插件根目录
npm publish          # 需先 npm login; publishConfig.access=public 已配好
# 用户侧升级: dsh plugin --profile web update dsh-comfyui-bridge
```

npm registry 上 `dsh-comfyui-bridge` 当前只有 1.0.0（2026-09-08 11:52 UTC 发布）。1.1.0 发布后此记录作废。

## 六、已知问题与历史锚点

1. **1.0.0 → 1.1.0 之前**：长任务（>30min 的 H3 视频等）可能被 DSH 0.1.7 的协作超时策略误杀——这正是加 `timeoutMs` 的动机。
2. **ComfyUI 侧历史坑**（不属于本插件，但排障时会遇到）：
   - ComfyUI 内存紧张时重启会静默丢节点（`--fast` 缓存残缺），表现是 UnetLoaderGGUF 等消失 → 干净重启、关大户程序
   - 社区 GGUF 模型文件可能有张量偏移 bug（黑图）→ 用 `fix_gguf_offsets.py` 修（桌面 DSH 目录）
3. **本文档相关的用户级配置**：`dsh-home\cordis.patch.yml` 目前**没有** comfyui-bridge 行（bundle 默认即可用）；需要钉死 modelsDir 时按 README 第 3 节加行。

## 七、给接手者的快速上手清单

- [ ] 读本文件 + README 第 1-4 节（功能与工具用法）
- [ ] 跑 `smoke-test.mjs` 确认环境 OK
- [ ] 跑 `comfyui_status`（任意 DSH 会话）确认桥接连通
- [x] ~~想改代码 → 按 5.1 方式一 junction 直连~~（已执行，DSH 重启即用开发版）
- [ ] 改完发版 → 5.4

*交接人：DSH agent（glm-5.3）· 2026-09-08*
