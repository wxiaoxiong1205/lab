import { getPublicKey, requestRefreshToken } from '@/services/auth'
import { tokenStorage, useAuthStore } from '@/stores/authStore'

let publicKey: string
let refreshTokenPromise: Promise<void> | null = null

export function useIamLogin() {
  const { user: userInfo, setAuth, userMenus } = useAuthStore.getState()

  // 参数加密
  async function encryptParam(data: any, publicKey: string) {
    console.log(data, 'data', publicKey)
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
    return await getPublicKey()
  };

  const refreshTokenAction = async () => {
    if (!publicKey) {
      publicKey = await fetchPublicKey()
    }
    console.log(publicKey, 'publicKey', tokenStorage.getRefreshToken())
    const res = await requestRefreshToken(await encryptParam(new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokenStorage.getRefreshToken() || '',
    }).toString(), publicKey), userInfo?.tenantId || '')
    setAuth(userInfo, res?.access_token, userMenus)
    tokenStorage.setRefreshToken(res?.refresh_token || '')
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
    refreshToken,
  }
}
