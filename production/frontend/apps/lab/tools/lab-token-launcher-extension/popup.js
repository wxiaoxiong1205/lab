const DEFAULT_SETTINGS = {
  labUrl: 'http://localhost:5173/',
  tokenKey: 'auth_token',
  refreshTokenKey: 'auth_refresh_token',
}

const elements = {
  labUrl: document.getElementById('labUrl'),
  tokenKey: document.getElementById('tokenKey'),
  refreshTokenKey: document.getElementById('refreshTokenKey'),
  launchBtn: document.getElementById('launchBtn'),
  saveBtn: document.getElementById('saveBtn'),
  status: document.getElementById('status'),
}

function setStatus(message, isError = false) {
  elements.status.textContent = message
  elements.status.style.background = isError ? '#fef2f2' : '#ecfeff'
  elements.status.style.color = isError ? '#991b1b' : '#155e75'
}

function readFormSettings() {
  return {
    labUrl: elements.labUrl.value.trim() || DEFAULT_SETTINGS.labUrl,
    tokenKey: elements.tokenKey.value.trim() || DEFAULT_SETTINGS.tokenKey,
    refreshTokenKey:
      elements.refreshTokenKey.value.trim() || DEFAULT_SETTINGS.refreshTokenKey,
  }
}

async function loadSettings() {
  const saved = await chrome.storage.sync.get(DEFAULT_SETTINGS)

  elements.labUrl.value = saved.labUrl
  elements.tokenKey.value = saved.tokenKey
  elements.refreshTokenKey.value = saved.refreshTokenKey
}

async function saveSettings() {
  const settings = readFormSettings()

  try {
    new URL(settings.labUrl)
  }
  catch {
    throw new Error('本地 Lab 地址不是合法 URL')
  }

  await chrome.storage.sync.set(settings)
  setStatus('配置已保存')

  return settings
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

  if (!tab?.id || !tab.url) {
    throw new Error('没有找到当前标签页')
  }

  if (!/^https?:/i.test(tab.url)) {
    throw new Error('请切到官网页面后再读取 token')
  }

  return tab
}

async function extractTokensFromActiveTab(settings) {
  const tab = await getActiveTab()
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: ({ tokenKey, refreshTokenKey }) => {
      const getValue = (key) =>
        window.localStorage.getItem(key) || window.sessionStorage.getItem(key)

      return {
        pageUrl: window.location.href,
        token: getValue(tokenKey),
        refreshToken: getValue(refreshTokenKey),
      }
    },
    args: [settings],
  })

  return results[0]?.result
}

async function launchLab() {
  const settings = await saveSettings()
  setStatus('正在读取当前标签页缓存...')

  const payload = await extractTokensFromActiveTab(settings)
  if (!payload?.token) {
    throw new Error(
      `当前页面没有读到 ${settings.tokenKey}。请确认你已经在官网登录，并且 token 存在 localStorage 或 sessionStorage。`,
    )
  }

  const labUrl = new URL(settings.labUrl)
  labUrl.searchParams.set('_tk', payload.token)

  if (payload.refreshToken) {
    labUrl.searchParams.set('_rtk', payload.refreshToken)
  }

  await chrome.tabs.create({ url: labUrl.toString() })

  setStatus(
    `已从当前页面读取 token 并打开 lab。\n来源页面: ${payload.pageUrl}`,
  )
}

elements.saveBtn.addEventListener('click', async () => {
  try {
    await saveSettings()
  }
  catch (error) {
    setStatus(error.message || '保存失败', true)
  }
})

elements.launchBtn.addEventListener('click', async () => {
  try {
    await launchLab()
  }
  catch (error) {
    setStatus(error.message || '打开 lab 失败', true)
  }
})

loadSettings().catch((error) => {
  setStatus(error.message || '初始化失败', true)
})
