export interface DeveloperGuideHeading {
  id: string
  level: number
  title: string
}

export const developerGuide = {
  title: '开发指南',
  headings: [
    { id: 'developer-guide-overview', level: 1, title: '开放平台 API 简介' },
    { id: 'developer-guide-authentication', level: 1, title: '认证方式' },
    { id: 'developer-guide-create-key', level: 1, title: 'API Key 创建与使用' },
    { id: 'developer-guide-expiration-security', level: 1, title: '有效期与安全建议' },
    { id: 'developer-guide-request-example', level: 1, title: '请求示例' },
    { id: 'developer-guide-error-codes', level: 1, title: '错误码说明' },
  ] satisfies DeveloperGuideHeading[],
  html: `
    <h1 id="developer-guide-overview" class="manual-heading manual-heading-1">开放平台 API 简介</h1>
    <p class="manual-paragraph">开放平台 API 面向开发者和集成方提供平台能力调用入口，用于在外部系统中访问 Deepexilab 的数据、模型服务、训练任务和评估结果等能力。</p>
    <p class="manual-paragraph">当前版本先提供 API Key 的个人自助管理能力，真实网关鉴权、调用量统计和审计日志将在后续后端接入阶段补齐。</p>

    <h1 id="developer-guide-authentication" class="manual-heading manual-heading-1">认证方式</h1>
    <p class="manual-paragraph">调用开放平台 API 时，需要在 HTTP Header 中携带 API Key。平台侧会根据密钥识别调用者身份，并按当前用户权限限制可访问的数据范围。</p>
    <pre class="manual-code"><code>Authorization: Bearer &lt;API_KEY&gt;</code></pre>
    <p class="manual-paragraph">API Key 归属于创建它的个人账号，不归属于项目。切换项目上下文不会改变密钥所有者。</p>

    <h1 id="developer-guide-create-key" class="manual-heading manual-heading-1">API Key 创建与使用</h1>
    <ol class="manual-list">
      <li>点击右上角个人按钮，进入“开放平台 API”。</li>
      <li>点击“创建密钥”，填写密钥名称、有效期和备注。</li>
      <li>创建成功后，列表会展示 API 密钥前缀。</li>
      <li>点击列表中的复制按钮，可复制当前展示的 API 密钥前缀。</li>
    </ol>
    <p class="manual-paragraph">列表中展示密钥名称、API 密钥前缀、状态、有效期、创建时间和最后使用时间，便于用户识别与管理。</p>

    <h1 id="developer-guide-expiration-security" class="manual-heading manual-heading-1">有效期与安全建议</h1>
    <ul class="manual-list">
      <li>推荐为自动化脚本选择 30 天或 90 天有效期，降低长期泄露风险。</li>
      <li>不要将 API Key 写入代码仓库、日志、截图或公开文档。</li>
      <li>如果密钥疑似泄露，请立即禁用或删除，并重新创建。</li>
      <li>过期密钥不可恢复，需要重新创建新的密钥。</li>
    </ul>

    <h1 id="developer-guide-request-example" class="manual-heading manual-heading-1">请求示例</h1>
    <pre class="manual-code"><code>curl -X GET "https://api.example.com/v1/projects" \\
  -H "Authorization: Bearer dlab_xxxxxxxxxxxxx" \\
  -H "Content-Type: application/json"</code></pre>
    <p class="manual-paragraph">示例域名仅用于说明。真实 API 域名和资源路径以后端开放平台网关发布为准。</p>

    <h1 id="developer-guide-error-codes" class="manual-heading manual-heading-1">错误码说明</h1>
    <div class="manual-table-wrap">
      <table class="manual-table">
        <tbody>
          <tr><td><strong>错误码</strong></td><td><strong>含义</strong></td><td><strong>处理建议</strong></td></tr>
          <tr><td>401</td><td>未携带密钥或密钥无效</td><td>检查 Authorization Header 和密钥内容。</td></tr>
          <tr><td>403</td><td>密钥有效但无资源权限</td><td>确认账号角色、项目权限和资源范围。</td></tr>
          <tr><td>429</td><td>请求频率超过限制</td><td>降低调用频率，或联系管理员提升限额。</td></tr>
          <tr><td>500</td><td>服务端异常</td><td>稍后重试，并记录请求 ID 便于排查。</td></tr>
        </tbody>
      </table>
    </div>
  `,
}
