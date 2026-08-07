# AI Novel Studio 前端

这是 AI Novel Studio 的 Vue 3 + TypeScript + Vite 前端，面向单人本地创作使用。

## 前置条件

- Node.js 和 pnpm。
- 已按后端仓库 README 启动 Go API 服务。
- PostgreSQL 和 Chat/Embedding API 配置已就绪；这些依赖由后端使用。

## 本地开发

在当前目录安装依赖并启动 Vite：

```bash
pnpm install
pnpm dev
```

开发服务器默认地址为 `http://localhost:5173`。Vite 会将相对 `/api` 请求代理到后端默认地址 `http://127.0.0.1:8081`。如需直接访问其他 API 地址，可设置 `VITE_API_BASE_URL`；未设置时使用上述相对路径和代理。

## 页面路由

- `/`：小说列表。
- `/novels/new`：创建小说。
- `/novels/:novelId`：阅读器。
- `/chapters/:chapterId/edit`：章节编辑器。
- `/novel/:novelId`：创作工作台。

创作工作台内嵌上下文预览，调用后端 `preview-context` JSON API；章节生成通过 SSE 接收正文和重写事件，也支持停止并取消后端生成。项目没有独立预览页面。

## 常用检查

```bash
pnpm test
pnpm check
pnpm lint
pnpm build
```

`pnpm build` 会先执行类型检查；`pnpm preview` 可预览构建产物。
