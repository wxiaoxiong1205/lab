import { getPublicKey, iamLogin, iamRefreshToken } from '@/services/api'
import useAuthStore from '@/stores/auth'

let publicKey: string
let refreshTokenPromise: Promise<void> | null = null

export function useIamLogin() {
  const { userInfo, setToken, setRefreshToken, refreshToken: rtk } = useAuthStore.getState()

  // 参数加密
  async function encryptParam(data: any, publicKey: string) {
    const { JSEncrypt } = await import('jsencrypt')
    const jsEncrypt = new JSEncrypt()
    jsEncrypt.setPublicKey(publicKey)
    const str = (typeof data === 'string' ? data : JSON.stringify(data)) as string
    const splitLength = 60
    const result = Array.from({
      length: Math.ceil(str.length / splitLength),
    }).map((x, index) =>
      jsEncrypt.encrypt(str.substring(index * splitLength, (index + 1) * splitLength)),
    )
    return result
  }

  // 获取公钥
  async function fetchPublicKey() {
    const res = await getPublicKey()
    const { payload } = res as unknown as { payload: string, code: number }
    return Promise.resolve(payload)
  };

  const login = async (params: { username: string, password: string, enterpriseCode: string }) => {
    // 获取公钥
    if (!publicKey) {
      publicKey = await fetchPublicKey()
    }

    // 调用登录API
    const res = await iamLogin({
      grant_type: await encryptParam('deepexi', publicKey),
      username: await encryptParam(params.username, publicKey),
      password: await encryptParam(params.password, publicKey),
      enterpriseCode: await encryptParam(params.enterpriseCode, publicKey),
    })
    setToken(res.payload?.access_token)
    setRefreshToken(res.payload?.refresh_token)
  }

  const refreshTokenAction = async () => {
    if (!publicKey) {
      publicKey = await fetchPublicKey()
    }
    const res = await iamRefreshToken(await encryptParam(new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: rtk || '',
      client_id: userInfo?.tenant_id || '',
    }).toString(), publicKey), userInfo?.tenant_id || '')
    setToken(res.payload?.access_token)
    setRefreshToken(res.payload?.refresh_token || '')
  }
  const refreshToken = async () => {
    if (refreshTokenPromise) {
      return refreshTokenPromise
    }
    refreshTokenPromise = refreshTokenAction().finally(() => {
      refreshTokenPromise = null
    })
    return refreshTokenPromise
  }

  return {
    login,
    refreshToken,
  }
}
