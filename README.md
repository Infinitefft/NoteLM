项目需求文档：NoteLM：高性能全栈 RAG 应用。

1. 重点展示：大文件异步处理、SSE 深度应用、向量检索与关系型数据协同。

2. 技术栈清单 (全栈架构)
前端: React + Tailwind CSS (极速出活)
状态管理: Zustand (轻量级，适合快速开发)
后端: NestJS
数据库:PostgreSQL: 存储用户信息、会话记录、文件元数据。
ORM: prisma
ChromaDB: 存储文档向量切片。
文件处理: pdf.js (预览), spark-md5 (Hash计算)。

3. 核心功能模块划分
模块一：
工业级大文件上传系统切片上传: 前端将大文件按 2MB/片 进行切割，并发上传。秒传功能: 上传前计算全局 MD5，后端匹配成功直接跳过上传。断点续传: 后端记录已接收切片索引，网络中断后仅传剩余部分。Worker 提速: 计算 Hash 过程放入 Web Worker，确保 UI 不卡顿。

模块二：多会话管理系统 (PostgreSQL 驱动)会话 CRUD: 侧边栏支持新建、删除、切换会话。历史追溯: 切换会话时自动拉取该会话下的所有历史聊天记录。标题生成: 第一条消息发出后，异步调用 LLM 总结会话标题。
模块三：RAG 检索增强逻辑 (全链路展示)文档解析: 后端接收文件后，进行  切片并写入 Chroma。状态实时流转: 前端展示：解析中 -> 向量化 -> 已就绪。混合检索。

模块四：SSE 流式对话处理 (核心技术亮点)Fetch 流模式: 使用 fetch + ReadableStream 实现支持 POST 的流式请求。解析适配层: 手写 Uint8Array 到文本的转换器，处理打字机效果。过程可视化: 在消息生成上方实时弹出 Steps 提示： 正在提取关键词...   检索向量库 (命中 5 条)...  正在整合回答...








出现的问题：
1. 用户首次进到首页，点击了某个会话，此时接口去请求拿到会话内容，数据库返回，但是返回数据后没有去更新页面ui，必须得再次点击当前会话才会显示
``` ts
const getMessages = useChatSessionStore((s) => s.getMessages)  // 订阅的是函数引用（永远不变）
const messages = sessionId ? getMessages(sessionId) : []        // 渲染时调用，但不会触发重渲染

useChatSessionStore((s) => s.getMessages) 订阅的是 getMessages 函数引用，而不是底层的 messagesBySession 数据。当 fetchMessages 完成并更新了 store 中的
messagesBySession，组件感知不到变化，不会重新渲染，所以页面不更新。

修复方式：直接用 selector 订阅 messagesBySession 数据本身，这样数据变化就会触发重渲染。
```


2. 无限循环问题
```
原来：
sessionId ? (s.messagesBySession[sessionId] ?? []) : [], 
改后：
sessionId ? (s.messagesBySession[sessionId] ?? EMPTY_MESSAGES) : EMPTY_MESSAGES,   

原因：─Zustand─的─selector─每次返回─?? []─会创建新的空数组引用，而─[] !== []（Object.is─判断不等），导致─Zustand─认为状态变了─→─重渲染─→─selector─又返回新─[]─→─无限循环。

修复： 提取模块级常量 const EMPTY_MESSAGES: ChatMessageDTO[] = []，selector 中用 ?? EMPTY_MESSAGES，引用始终稳定，不会误触发重渲染。
```