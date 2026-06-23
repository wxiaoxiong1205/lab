import apiClient from './apiClient'
import type { LoginResponse } from '@/types'

export const IAM_CLIENT_CODE = '414dddb1453f4e27bb046bd158227f1b'

interface IamResponse<T> {
  code: number
  message: string
  payload: T
}

export async function requestRefreshToken(data: any, client_id: string) {
  return apiClient.request<IamResponse<LoginResponse>>({
    url: '/deepexi-client-iam-sso/oauth/token',
    baseURL: '/',
    method: 'post',
    data,
    params: {
      client_id,
    },
    headers: {
      'X-CLIENT-CODE-HEADER': IAM_CLIENT_CODE,
    },
    isRefreshToken: true, // 标识为刷新token请求
  }).then((response) => response.data.payload)
}

export function getPublicKey() {
  return apiClient.request<IamResponse<string>>({
    url: '/deepexi-client-iam-sso/sso/public-key',
    baseURL: '/',
    method: 'get',
    headers: {
      'X-CLIENT-CODE-HEADER': IAM_CLIENT_CODE,
    },
  }).then((response) => response.data.payload)
}
