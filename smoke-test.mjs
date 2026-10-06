// 冒烟测试: 模拟 cordis ctx 加载迁移后的 dsh-comfyui-bridge, 验证 8 工具注册
import { pathToFileURL } from 'node:url'

const plugPath = pathToFileURL('C:/Users/lcl/Desktop/DSH插件开发/dsh-comfyui-bridge/lib/index.mjs').href
const mod = await import(plugPath)

console.log('name =', mod.name)
console.log('inject =', JSON.stringify(mod.inject))
console.log('typeof apply =', typeof mod.apply)
if (mod.name !== 'comfyui-bridge' || !Array.isArray(mod.inject) || typeof mod.apply !== 'function') {
  throw new Error('插件导出形态不符')
}

// 模拟 cordis ctx: tools/systemPrompt 注册表 + effect
const registered = []
const promptSections = []
const ctx = {
  effect(fn) { return fn() },
  tools: {
    register(def) {
      if (!def.name || typeof def.execute !== 'function' || !def.output || typeof def.output.render !== 'function') {
        throw new Error(`工具 ${def.name} 定义不完整`)
      }
      if (def.timeoutMs !== undefined && (!Number.isFinite(def.timeoutMs) || def.timeoutMs <= 0)) {
        throw new Error(`工具 ${def.name} timeoutMs 非法`)
      }
      registered.push(def)
    },
  },
  systemPrompt: {
    section(s) { promptSections.push(s) },
  },
  get() { return undefined },
}

mod.apply(ctx, { baseUrl: 'http://127.0.0.1:8188' })

console.log(`注册工具数 = ${registered.length}`)
for (const t of registered) {
  const tm = t.timeoutMs !== undefined ? ` timeoutMs=${t.timeoutMs}` : ''
  console.log(`  - ${t.name}${tm}`)
}
const names = registered.map((t) => t.name)
const expect = ['comfyui_status', 'comfyui_models', 'comfyui_generate', 'comfyui_history', 'comfyui_interrupt', 'comfyui_upload', 'comfyui_fetch_model', 'comfyui_install']
const missing = expect.filter((n) => !names.includes(n))
if (missing.length > 0) throw new Error(`缺失工具: ${missing.join(', ')}`)
if (registered.find((t) => t.name === 'comfyui_generate').timeoutMs !== 3600000) throw new Error('comfyui_generate.timeoutMs 未生效')
if (registered.find((t) => t.name === 'comfyui_fetch_model').timeoutMs !== 3600000) throw new Error('comfyui_fetch_model.timeoutMs 未生效')
if (promptSections.length !== 1 || promptSections[0].name !== 'comfyui:guide') throw new Error('systemPrompt 段注册异常')
console.log('systemPrompt 段 =', promptSections[0].name, 'order =', promptSections[0].order)
console.log('\n✓ 冒烟测试全部通过: 8 工具注册 + 2 个 timeoutMs 适配 + 系统提示词段')
