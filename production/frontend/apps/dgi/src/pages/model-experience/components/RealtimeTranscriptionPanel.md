# RealtimeTranscriptionPanel 实现逻辑说明

本文档用于详细说明 `RealtimeTranscriptionPanel.tsx` 的职责、状态流转、音频采集链路、WebSocket 通信协议、转写结果处理方式以及 UI 渲染逻辑，便于后续维护和扩展。

对应源码文件：

- `apps/dgi/src/pages/model-experience/components/RealtimeTranscriptionPanel.tsx`

## 1. 组件定位

`RealtimeTranscriptionPanel` 是“模型体验”页面中专门用于 **实时语音识别（Realtime）模型** 的独立面板组件。

它的核心职责不是普通的表单提交，而是维护一个完整的实时识别会话：

1. 从当前登录态中读取 token。
2. 请求浏览器麦克风权限。
3. 建立 WebSocket 连接。
4. 建立 Web Audio 音频处理链路。
5. 持续采集浏览器麦克风输入。
6. 将音频降采样为 `16kHz / Mono / PCM16`。
7. 按帧持续推送到后端实时识别服务。
8. 接收服务端返回的中间结果和最终结果。
9. 将结果展示在页面上。
10. 在暂停、恢复、停止、报错、组件卸载等场景下做资源清理。

从页面入口上看，这个组件只会在当前模型类别包含 `Realtime` 时渲染。在 `ModelChatPage.tsx` 中，逻辑是：

- 如果是 `AudioSpeech`，渲染语音合成面板。
- 如果是 `Realtime`，渲染 `RealtimeTranscriptionPanel`。
- 否则走普通聊天区域。

这意味着它是一个 **针对实时语音模型的专用交互容器**，并不和普通聊天消息流共用输入框逻辑。

## 2. 组件入参与依赖

### 2.1 Props

组件只接收两个参数：

- `model: ModelItem`
  - 当前选中的实时语音模型。
  - 组件会使用 `model.model_name` 作为 WebSocket 建连参数、会话 ID 前缀以及界面展示名称。
- `isFullscreen?: boolean`
  - 控制面板在全屏模式和普通模式下的外层布局样式。

### 2.2 外部依赖

主要依赖如下：

- `antd`
  - 提供 `Alert`、`Button`、`Tag`、`message`。
- `lucide-react`
  - 提供按钮图标 `Mic`、`Pause`、`Play`、`Square`。
- `ModelLogo`
  - 展示模型 logo。
- `useAuthStore`
  - 从全局登录态中取 token。
- `withApiPath`
  - 拼接后端接口路径。
- 浏览器 API
  - `navigator.mediaDevices.getUserMedia`
  - `AudioContext`
  - `MediaStreamAudioSourceNode`
  - `ScriptProcessorNode`
  - `WebSocket`

## 3. 常量设计

组件顶部定义了一组固定常量，它们本质上决定了“客户端推流协议”的默认行为。

### 3.1 `TARGET_SAMPLE_RATE = 16000`

目标采样率为 `16kHz`。
无论浏览器原始采样率是多少，最终发送给后端的数据都要转换到这个采样率。

原因通常有两个：

1. 后端 ASR 服务常以 `16kHz` 作为标准输入。
2. 降采样后数据体积更小，更适合实时流式传输。

### 3.2 `FRAME_SIZE = 960`

每次发送给服务端的 PCM 帧大小为 `960` 个采样点。

如果采样率是 `16000Hz`，那么：

- `960 / 16000 = 0.06s`

也就是大约每帧表示 `60ms` 音频。

这说明当前实现采用的是“小帧连续发送”的实时流式模式，而不是积累一大段音频后再整体上传。

### 3.3 `DEFAULT_CHUNK_SIZE = [5, 10, 5]`

这是发送给服务端初始化 JSON 中的配置字段之一。
它不是前端本地切片逻辑，而是给后端实时识别引擎的参数。

从前端实现看，组件只是透传该配置，不在本地解释其语义。

### 3.4 `DEFAULT_CHUNK_INTERVAL = 10`

同样属于识别服务配置参数，由前端初始化时传给后端。

### 3.5 `DEFAULT_MODE = '2pass'`

表示当前实时识别采用双阶段模式。
从代码行为推断，这通常意味着：

- 服务端会先返回流式中间结果。
- 再在更稳定的时机返回最终结果。

前端的 `interimTranscript` 与 `finalTranscript` 双轨展示设计，也和这一模式相匹配。

## 4. 工具函数拆解

这一部分函数基本都写在组件外部，属于纯逻辑工具，便于复用和避免组件内部体积过大。

### 4.1 `buildRealtimeWsUrl(modelName, token)`

作用：构造实时识别 WebSocket 地址。

处理步骤：

1. 使用 `withApiPath('/v1/experience/realtime')` 生成基础接口路径。
2. 基于 `window.location.origin` 构造完整 URL。
3. 如果当前页面协议是 `https:`，则把 WebSocket 协议转成 `wss:`。
4. 如果当前页面协议是 `http:`，则转成 `ws:`。
5. 在 query 上附加：
   - `model`
   - `auth_token`

最终建连地址大致形如：

```text
ws(s)://host/v1/experience/realtime?model=xxx&auth_token=xxx
```

这里把 token 放在 query 上，而不是 header。说明后端 WebSocket 认证方式是基于 URL 参数约定。

### 4.2 `createSessionId(modelName)`

作用：生成当前录音会话 ID。

实现特点：

1. 先把模型名中不安全字符替换成下划线。
2. 再拼接当前时间戳。

例如：

```text
Qwen-Realtime_1711111111111
```

该 ID 会同时用于：

- 页面展示；
- 发给服务端的 `wav_name`；
- 当前会话的唯一标识。

### 4.3 `getStoredToken()`

作用：从前端登录状态中获取 token。

获取顺序：

1. 先读 Zustand store：`useAuthStore.getState().token`
2. 如果 store 中没有，再 fallback 到 `localStorage` 中的 `auth-storage`

这个函数的意义在于兼容两种场景：

- 当前页面运行期间 store 已有 token。
- 页面刷新后 store 还没完全恢复，但 `localStorage` 已持久化 token。

异常时返回空字符串，不抛错。

### 4.4 `mergeTranscript(current, incoming)`

作用：将服务端返回的“最终文本”合并进已累积的最终转写结果。

它解决的是实时识别中常见的重复拼接问题。主要规则如下：

1. 新文本为空，则直接返回旧值。
2. 旧文本为空，则直接使用新值。
3. 如果新文本已经以前缀形式包含旧文本，说明新文本更完整，直接用新文本覆盖。
4. 如果旧文本已经以后缀形式包含新文本，说明新文本可能只是旧文本的一部分，保留旧值。
5. 其他情况，按空格拼接。

这个函数的核心目标是：

- 避免重复文本；
- 尽量保留服务端更完整的最终版本；
- 兼容部分 ASR 服务“多次返回累积结果”的特性。

### 4.5 `extractTextFromPayload(payload)`

作用：从不同格式的服务端消息中尽可能提取文本。

它兼容了多种 payload 结构：

- `payload` 本身就是字符串
- `payload.text`
- `payload.result`
- `payload.result.text`
- `payload.data.text`
- `payload.stamp_sents[]`

其中 `stamp_sents` 会把每个句段的 `text` 或 `sentence` 拼接起来。

这说明当前前端在做一件很实用的事情：
**不强依赖单一的后端响应格式，而是对多种识别引擎返回结构做兼容适配。**

### 4.6 `isFinalPayload(payload)`

作用：判断一条服务端消息是不是“最终结果”。

判定规则如下：

- `payload.is_final === true`
- `payload.isFinal === true`
- `mode/type` 中包含 `offline`
- `mode/type` 中包含 `final`

这同样体现了兼容性设计：不同后端模型或网关返回的字段命名可能不同，前端统一兜底识别。

### 4.7 `downsampleTo16k(input, inputSampleRate)`

作用：将浏览器采集到的浮点音频数据转换为 `16kHz / Int16 PCM`。

#### 输入

- `input: Float32Array`
  - Web Audio 中常见的单声道浮点采样数据，范围通常为 `[-1, 1]`
- `inputSampleRate: number`
  - 当前 `AudioContext.sampleRate`

#### 输出

- `Int16Array`
  - 可直接作为 PCM16 原始帧发送给 WebSocket

#### 处理逻辑

如果当前采样率已经是 `16000`：

1. 直接做数值裁剪到 `[-1, 1]`
2. 再把浮点值映射到 16 位整型区间

如果不是 `16000`：

1. 计算降采样比例 `ratio = inputSampleRate / 16000`
2. 计算输出长度
3. 用线性插值法从原始采样中取点
4. 再映射到 `Int16`

这里不是做高精度音频重采样，而是采用足够轻量的前端实时转换方案。
对实时识别场景来说，这种取舍是合理的，优先保证低延迟和实现简单。

### 4.8 `parseWsMessage(data)`

作用：把 WebSocket 返回的数据统一解析成 JS 对象。

兼容三种输入：

- `string`
- `Blob`
- `ArrayBuffer`

当前实现中：

- `string` 会尝试 `JSON.parse`
- 解析失败时，退化为 `{ text: data }`
- `Blob` 会先转成文本，再递归解析
- `ArrayBuffer` 直接返回 `null`

因此当前前端默认假设服务端消息以文本 JSON 为主，而不是二进制响应。

## 5. 状态与 Ref 设计

这个组件同时使用了 `state` 和 `ref`，两者职责分得比较清楚：

- `state` 负责驱动界面渲染。
- `ref` 负责保存异步过程中的可变对象和最新状态，避免闭包问题。

### 5.1 React State

#### `status`

类型：

```ts
'idle' | 'connecting' | 'recording' | 'paused' | 'stopping' | 'closed' | 'error'
```

含义：

- `idle`
  - 初始态，未开始。
- `connecting`
  - 正在申请麦克风或正在建立 WebSocket/音频链路。
- `recording`
  - 正在录音并实时推流。
- `paused`
  - 音频上下文已暂停，不再继续采集。
- `stopping`
  - 用户点击停止后，正在做收尾。
- `closed`
  - 用户主动结束，且会话已关闭。
- `error`
  - 出现异常。

#### `errorText`

用于展示顶部错误 `Alert`。

#### `finalTranscript`

保存已经确认的最终识别文本。

#### `interimTranscript`

保存当前服务端返回的流式中间文本。
它会随着后端持续更新，通常不是稳定文本。

#### `sessionId`

用于页面展示当前会话 ID。

### 5.2 Refs

#### `statusRef`

保存 `status` 的最新值，主要用于异步回调中读取“实时状态”，避免闭包捕获旧值。

例如：

- `processor.onaudioprocess`
- `ws.onclose`
- `handlePause`
- `handleResume`
- `handleStop`

都依赖最新状态判断。

#### `wsRef`

保存当前 WebSocket 实例。

#### `streamRef`

保存 `getUserMedia` 返回的麦克风流，便于统一停止 tracks。

#### `audioContextRef`

保存 Web Audio 上下文，用于暂停、恢复、关闭。

#### `sourceNodeRef`

保存媒体输入源节点。

#### `processorRef`

保存 `ScriptProcessorNode`，用于断开音频处理链。

#### `sampleBufferRef`

保存已经转成 `Int16` 但尚未达到发送帧大小的数据缓冲区。

这是整个“边采集边分帧发送”的核心中间缓存。

#### `sessionIdRef`

保存当前会话 ID 的最新值，确保停止时发送给服务端的 `wav_name` 正确。

#### `manualStopRef`

标识这次会话关闭是不是用户手动点击“结束录音”触发的。

它的作用是在 `ws.onclose` 中区分：

- 用户主动关闭：状态应该进入 `closed`
- 非主动关闭：状态应该回到 `idle`

## 6. 生命周期与清理逻辑

### 6.1 `useEffect(() => { statusRef.current = status }, [status])`

这个 effect 的作用很单纯：
每次 `status` 变化时，把最新值同步到 `statusRef`。

这样所有异步回调都可以读取到最新状态。

### 6.2 `stopAudioCapture()`

作用：停止并清理音频采集链路。

执行顺序：

1. `processorRef.current?.disconnect()`
2. `sourceNodeRef.current?.disconnect()`
3. 如果 `audioContext` 未关闭，则调用 `close()`
4. 停止 `stream` 上所有 tracks
5. 清空所有音频相关 ref
6. 清空采样缓冲区

这个函数只负责 **音频资源**，不负责 WebSocket 的关闭。

### 6.3 `cleanupSession(closeSocket = true)`

作用：统一清理整个会话。

执行顺序：

1. 先调用 `stopAudioCapture()`
2. 如果需要，再关闭 WebSocket
3. 清空 `wsRef`

这相当于更上层的“总清理函数”。

### 6.4 组件卸载时清理

组件在卸载时会执行：

```ts
// return () => {
//   void cleanupSession(true)
// }
```

这保证了以下场景不会残留资源：

- 页面切换
- 父组件卸载
- 模型切换导致当前面板被销毁

## 7. 音频采集与分帧发送链路

这一部分是组件的核心。

### 7.1 `flushSamples(flushRemaining = false)`

作用：把 `sampleBufferRef` 中已积累的 PCM 数据按帧发送到服务端。

规则如下：

1. 只有在 WebSocket 已连接且 `OPEN` 时才发送。
2. 当缓冲区长度 `>= FRAME_SIZE` 时，循环取出 `960` 个采样点。
3. 每一帧转成 `Int16Array` 后发送 `frame.buffer`。
4. 如果 `flushRemaining = true`，则在结束时把不足一帧的剩余采样也一起发出去。

这意味着：

- 正常录音过程中，只发完整帧。
- 停止录音时，会补发最后不足一帧的残留数据。

### 7.2 `setupAudioPipeline(stream)`

作用：基于浏览器麦克风流建立音频处理图。

执行步骤：

1. 兼容获取 `AudioContext` 构造函数。
2. 如果浏览器不支持，直接抛错。
3. 创建 `audioContext`。
4. 基于 `stream` 创建 `MediaStreamSource`。
5. 创建 `ScriptProcessorNode(4096, 1, 1)`。
6. 在 `onaudioprocess` 中读取输入数据。
7. 把输入浮点音频降采样为 `16k PCM16`。
8. 推入 `sampleBufferRef`。
9. 调用 `flushSamples(false)` 连续发帧。
10. 将 source 和 processor 接起来，并把 processor 接到 destination。
11. 把相关对象存入 ref。

### 7.3 `onaudioprocess` 的关键判断

在音频回调中，第一句是：

```ts
// if (statusRef.current !== 'recording') {

// }
```

这非常关键，因为它保证：

- 暂停态不会继续采集和发送；
- 只有 `recording` 状态才真正推流；
- 不需要反复重建整条音频链路来实现暂停。

## 8. WebSocket 消息处理逻辑

### 8.1 `handleWsMessage(data)`

作用：处理服务端返回的识别结果。

执行流程：

1. 调用 `parseWsMessage(data)` 把原始消息转成对象。
2. 调用 `extractTextFromPayload(payload)` 提取文本。
3. 如果没有文本，直接忽略。
4. 如果是最终结果：
   - 合并到 `finalTranscript`
   - 清空 `interimTranscript`
5. 否则：
   - 更新 `interimTranscript`

这形成了一个非常典型的双缓冲展示模型：

- `finalTranscript` 代表“已经稳定确认”的内容
- `interimTranscript` 代表“当前正在波动的流式内容”

## 9. 启动会话流程

### 9.1 `startRealtimeSession()`

这是“开始录音”按钮背后的主入口函数，也是整个组件最重要的控制函数。

完整流程如下。

#### 第一步：前置校验

1. 调用 `getStoredToken()` 获取 token。
2. 如果没有 token，直接提示错误并终止。
3. 检查 `navigator.mediaDevices.getUserMedia` 是否存在。
4. 如果浏览器不支持麦克风采集，直接提示错误并终止。

#### 第二步：初始化会话状态

1. `manualStopRef.current = false`
2. 清空 `errorText`
3. 清空 `finalTranscript`
4. 清空 `interimTranscript`
5. `status = 'connecting'`
6. 创建新的 `sessionId`
7. 同步到 `sessionIdRef` 和页面 state

这说明每次点击“开始录音”都会开启一个全新的识别会话，而不是复用上一次状态。

#### 第三步：申请麦克风

调用：

```ts
navigator.mediaDevices.getUserMedia({
  audio: {
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
  },
})
```

配置特点：

- 单声道；
- 开启回声消除；
- 开启噪声抑制。

这是面向语音识别场景的合理默认值。

#### 第四步：建立 WebSocket

1. 用 `buildRealtimeWsUrl(model.model_name, token)` 构建地址。
2. `new WebSocket(url)` 建立连接。
3. `binaryType = 'arraybuffer'`
4. 保存到 `wsRef`

#### 第五步：`ws.onopen`

连接建立成功后，组件会先发送一段初始化 JSON：

```json
{
  "chunk_size": [5, 10, 5],
  "wav_name": "sessionId",
  "is_speaking": true,
  "chunk_interval": 10,
  "itn": true,
  "mode": "2pass"
}
```

发送完初始化参数后：

1. 调用 `setupAudioPipeline(stream)` 建立本地音频处理链路。
2. 状态切换为 `recording`。

这体现出一个明确约束：
**先告诉后端“会话开始”和识别参数，再开始持续推送音频帧。**

#### 第六步：`ws.onmessage`

收到服务端消息后，转交 `handleWsMessage(event.data)`。

#### 第七步：`ws.onerror`

连接异常时：

1. 设置错误文案
2. 状态变为 `error`

这里没有直接调用 `cleanupSession()`，因此后续资源回收主要依赖：

- `onclose`
- 用户重试
- 组件卸载

#### 第八步：`ws.onclose`

连接关闭时：

1. 停止音频采集
2. 清空 `wsRef`
3. 如果当前不是 `error`
   - 用户主动停止则设为 `closed`
   - 否则回到 `idle`

这一步把“结束原因”转换成了明确的 UI 状态。

#### 第九步：异常捕获

如果在启动流程中任何一步抛错，例如：

- 麦克风权限拒绝
- 创建音频上下文失败
- 其他初始化异常

则会：

1. `cleanupSession(true)`
2. `status = 'error'`
3. 记录错误文本
4. 弹出错误消息

## 10. 暂停、恢复、停止逻辑

### 10.1 `handlePause()`

暂停条件：

- `audioContextRef.current` 存在
- 当前状态必须是 `recording`

处理方式：

1. 调用 `audioContext.suspend()`
2. `status = 'paused'`

注意这里没有关闭麦克风流，也没有断开 WebSocket。
只是暂停音频上下文处理，因此恢复速度会更快。

### 10.2 `handleResume()`

恢复条件：

- `audioContextRef.current` 存在
- 当前状态必须是 `paused`

处理方式：

1. 调用 `audioContext.resume()`
2. `status = 'recording'`

### 10.3 `handleStop()`

停止逻辑比暂停和恢复都更完整，属于“会话结束流程”。

执行步骤：

1. 判断 WebSocket 是否存在，且当前状态必须是 `recording` 或 `paused`
2. `manualStopRef.current = true`
3. `status = 'stopping'`
4. `flushSamples(true)`，补发缓冲区剩余音频
5. 清空 `interimTranscript`
6. `await stopAudioCapture()`，关闭音频链路
7. 如果 WebSocket 仍处于 `OPEN`
   - 发送结束 JSON

结束 JSON 如下：

```json
{
  "chunk_size": [5, 10, 5],
  "wav_name": "sessionId",
  "is_speaking": false,
  "chunk_interval": 10,
  "mode": "2pass"
}
```

这里最重要的语义是：

- `is_speaking: false`

它相当于显式告诉后端：“音频已经结束，请收尾并输出最终结果”。

状态本身并不会在 `handleStop()` 中直接变成 `closed`，而是等待 WebSocket 真正关闭后，在 `onclose` 中再切换成 `closed`。
这种设计更严谨，因为它反映的是“后端会话真的结束了”，而不是“前端只是点了停止按钮”。

## 11. 转写文本展示逻辑

### 11.1 `combinedTranscript`

组件内部用 `useMemo` 计算 `combinedTranscript`，逻辑是：

1. 如果有 `finalTranscript`，先展示最终文本。
2. 如果还有 `interimTranscript`，则在最终文本后换行追加。
3. 最终做一次 `trim()`。

它主要用于判断页面上“有没有任何识别结果”。

### 11.2 为什么页面同时展示两段文本

渲染层中实际展示是分开的：

- `finalTranscript` 用普通深色文字展示
- `interimTranscript` 用蓝色文字展示

这么做的原因很明确：

1. 用户能区分哪些内容已经稳定确认。
2. 用户能看到服务端正在实时刷新哪一段。
3. 双阶段识别体验更符合实时 ASR 的交互预期。

## 12. UI 结构说明

从视觉结构看，这个组件可以拆成四块：

### 12.1 顶部头部

展示内容：

- 模型 Logo
- 模型名称
- 描述文案
- 当前状态 Tag

状态 Tag 颜色映射如下：

- `recording` -> `processing`
- `paused` -> `warning`
- `error` -> `error`
- `closed` -> `success`
- 其他 -> `default`

状态文案映射如下：

- `idle` -> 待开始
- `connecting` -> 连接中
- `recording` -> 录音中
- `paused` -> 已暂停
- `stopping` -> 收尾中
- `closed` -> 已结束
- `error` -> 异常

### 12.2 会话信息区

只展示一个字段：`sessionId`

这个区域的价值在于：

- 调试时方便对照后端日志；
- 用户或测试人员反馈问题时可以带上会话 ID。

### 12.3 识别结果区

有两种状态：

1. 没有结果时，显示占位提示文案。
2. 有结果时，显示最终文本和中间文本。

结果区域支持滚动，适合长文本累计输出。

### 12.4 控制按钮区

按钮显示严格受 `status` 控制：

- `idle | closed | error`
  - 显示“开始录音”
- `recording`
  - 显示“暂停录音”
- `paused`
  - 显示“继续录音”
- `recording | paused`
  - 显示“结束录音”

这种设计保证了任何时刻只暴露合法操作，减少非法状态切换。

## 13. 状态机视角理解整个组件

如果把这个组件抽象成一个简化状态机，大致如下：

```text
idle
  -> connecting
  -> recording

recording
  -> paused
  -> stopping
  -> error
  -> idle（异常断开）

paused
  -> recording
  -> stopping

stopping
  -> closed（用户主动结束并成功关闭）
  -> error（异常）

closed
  -> connecting（再次开始）

error
  -> connecting（再次开始）
```

其中比较关键的一点是：

- `closed` 代表“正常结束”
- `idle` 更偏向“未开始 / 非手动结束后的空闲态”

## 14. 一次完整时序

下面用时序的方式串一下整个流程：

### 14.1 开始识别

1. 用户点击“开始录音”
2. 组件检查 token
3. 组件检查浏览器麦克风能力
4. 状态切到 `connecting`
5. 生成 `sessionId`
6. 请求麦克风权限
7. 创建 WebSocket
8. `ws.onopen`
9. 发送会话配置 JSON，`is_speaking: true`
10. 建立音频处理链
11. 状态切到 `recording`
12. `onaudioprocess` 持续触发
13. 浮点音频转 `16k PCM16`
14. 音频按 `960` 采样点切帧
15. 二进制帧持续发给服务端
16. 服务端持续返回中间结果 / 最终结果
17. 页面实时刷新文本

### 14.2 暂停识别

1. 用户点击“暂停录音”
2. `audioContext.suspend()`
3. 状态切到 `paused`
4. `onaudioprocess` 因状态检查而不再继续推流

### 14.3 恢复识别

1. 用户点击“继续录音”
2. `audioContext.resume()`
3. 状态切到 `recording`
4. 音频继续采集和推流

### 14.4 结束识别

1. 用户点击“结束录音”
2. 状态切到 `stopping`
3. 补发缓冲区剩余 PCM
4. 停止本地音频采集
5. 向后端发送 `is_speaking: false`
6. 后端收尾并关闭连接，或返回最后结果
7. `ws.onclose`
8. 状态变为 `closed`

## 15. 设计上的优点

这个实现有几个比较明显的优点。

### 15.1 前后端职责边界清楚

前端只负责：

- 采集音频
- 转码降采样
- 分帧发送
- 展示结果

识别策略、分块语义、最终结果判定更多交给后端。

### 15.2 对后端消息格式做了兼容

`extractTextFromPayload()` 与 `isFinalPayload()` 都做了多结构兼容，降低了前后端强耦合。

### 15.3 用 ref 解决异步闭包问题

像 `statusRef`、`sessionIdRef`、`manualStopRef` 这些设计都比较实用，适合这种“异步事件很多”的组件。

### 15.4 清理逻辑独立

`stopAudioCapture()` 和 `cleanupSession()` 分层明确，便于后续维护。

### 15.5 暂停/恢复成本低

暂停不是销毁会话，而是挂起 `AudioContext`，恢复时不需要重新建连。

## 16. 需要注意的点

下面这些不是一定有问题，但属于后续维护时需要重点关注的点。

### 16.1 `ScriptProcessorNode` 已偏旧

当前实现使用 `createScriptProcessor()`。
这个 API 还能工作，但现代浏览器更推荐 `AudioWorklet`。

现实现的优点是简单直接；缺点是：

- 主线程参与更多；
- 高频实时音频处理时性能和时序稳定性不如 `AudioWorklet`。

如果后续对延迟或稳定性要求更高，可以考虑迁移。

### 16.2 `processor.connect(audioContext.destination)`

当前处理节点连接到了扬声器输出目标。
这样做通常是为了让 `ScriptProcessorNode` 持续工作，但也要注意是否会带来不必要的音频输出链路副作用。

实际是否有可闻输出，取决于处理节点是否往输出写数据以及浏览器实现。

### 16.3 `ws.onerror` 没有立即总清理

`ws.onerror` 里只更新了错误状态，没有直接调用 `cleanupSession()`。
如果某些浏览器或网络异常路径下 `onclose` 触发不及时，可能会出现资源清理依赖延后的情况。

当前实现大多数情况下仍可接受，因为：

- 正常 WebSocket 异常通常会紧接着进入 `onclose`
- 组件卸载时也会做兜底清理

但这是后续可继续加强的一点。

### 16.4 `ArrayBuffer` 服务端消息未处理

`parseWsMessage()` 遇到 `ArrayBuffer` 会直接返回 `null`。
说明前端默认后端不会用二进制回传识别结果。

如果未来服务端协议变更为二进制消息，需要扩展这里的解析逻辑。

### 16.5 文本合并策略偏经验型

`mergeTranscript()` 是很实用的启发式拼接逻辑，但不是严格的 diff/patch 算法。
当后端返回格式非常特殊时，仍有可能出现重复或拼接不自然的问题。

## 17. 一句话总结

`RealtimeTranscriptionPanel` 本质上是一个“浏览器实时语音采集 + WebSocket 流式推送 + 双阶段识别结果展示”的完整前端会话控制器。

它把以下几件事串成了一条闭环链路：

- 登录态认证
- 麦克风采集
- 音频降采样与 PCM 编码
- WebSocket 实时推流
- 中间结果 / 最终结果处理
- 暂停、恢复、停止、异常、卸载清理

如果后续你要扩展这个组件，最值得优先关注的入口点通常有四个：

1. `startRealtimeSession()`：启动流程总控
2. `setupAudioPipeline()`：本地音频采集与处理
3. `handleWsMessage()`：服务端识别结果处理
4. `handleStop()`：会话结束与收尾控制

## 18. 建议的阅读顺序

如果是第一次接手这个组件，建议按下面顺序读源码：

1. 先看组件 state 和 refs，理解它管哪些资源。
2. 再看 `startRealtimeSession()`，掌握启动主流程。
3. 再看 `setupAudioPipeline()` 和 `flushSamples()`，理解音频如何被发送。
4. 再看 `handleWsMessage()`，理解结果如何回显。
5. 最后看 `handlePause()`、`handleResume()`、`handleStop()` 和清理逻辑。

这样会比从 JSX 开始读更容易建立整体心智模型。
