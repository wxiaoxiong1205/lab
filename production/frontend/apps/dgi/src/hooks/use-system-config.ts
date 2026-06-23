import { useRequest } from 'ahooks'
import { apiPluginList, apiSystemConfig } from '@/services/api'
import { $t } from '@/locales'

interface ModelTypeMap {
  [key: string]: string
}

/** 语音合成：年龄 */
export type VoiceAgeGroupConfig = Record<string, string>
/** 语音合成：业务语言（声音角色筛选） */
export type VoiceBizLanguageConfig = Record<string, string>
/** 语音合成：性别 */
export type VoiceGenderConfig = Record<string, string>
/** 语音合成：场景 */
export type VoiceSceneConfig = Record<string, string>
/** 语音合成：合成目标语言 */
export type VoiceTargetLanguageConfig = Record<string, string>

interface SystemConfig {
  MODEL_PERMISSION: Record<string, string>
  TOKEN_RATE_LIMIT_QPM: number
  TOKEN_RATE_LIMIT_TPM: number
  MODEL_TYPE: ModelTypeMap
  MODEL_IMAGES: (string | null)[]
  AMOUNT_SYMBOL: string
  QUOTA_PER_UNIT: number
  CHANNEL_TYPE: {
    key: number
    text: string
    value: number
    color: string
  }[]
  SECURITY_POLICY: {
    key: number
    text: string
  }[]
  DEEPEXI_STACK_SERVER?: string
  DEEPEXI_STACK_TOKEN: string
  DEEPEXI_STACK_SERVER_ENABLED?: boolean
  DEEPEXI_FIREWALL_ENABLED?: boolean
  DATA_SECURITY_LEVEL?: string[]
  WORKBENCH_HOST?: string
  SECURITY_LEVEL_ENABLED?: boolean
  DEEPEXI_LAB_SERVER_ENABLED?: boolean
  DEEPEXI_LAB_SERVER?: string
  ENDPOINT_LIST: string[]
  /** 语音合成：年龄（youth/adult/senior -> 青年/中年/老年） */
  VOICE_AGE_GROUP?: VoiceAgeGroupConfig
  /** 语音合成：业务语言（chinese/dialect/english/foreign -> 中文/方言/英文/小语种） */
  VOICE_BIZ_LANGUAGE?: VoiceBizLanguageConfig
  /** 语音合成：性别（male/female -> 男/女） */
  VOICE_GENDER?: VoiceGenderConfig
  /** 语音合成：场景（chat/novel/movie -> 陪伴聊天/小说阅读/影视配音） */
  VOICE_SCENE?: VoiceSceneConfig
  /** 语音合成：合成目标语言（Auto/zh/en/ja/ko/...） */
  VOICE_TARGET_LANGUAGE?: VoiceTargetLanguageConfig
}

interface IResponse<T> {
  code: number
  data: T
  msg?: string
  message?: string
}

interface IOption {
  label: string
  value: string | number
}

let systemConfig: SystemConfig | null = null
let pluginListCache: IOption[] | null = null

export function getModelPriceInfo(modelType: string) {
  switch (modelType) {
    case 'AudioTranscription':
      return {
        input: 0.09,
        output: 0.036,
      }
    case 'Realtime':
      return {
        input: 0.09,
        output: 0.036,
      }
    case 'AudioSpeech':
      return {
        input: 0.0024, // 0.0016~0.0032 的平均值
        output: 0.015, // 0.01~0.02 的平均值
      }
    case 'Vision_Language':
      return {
        input: 0.008,
        output: 0.024,
      }
    case 'Embeddings':
      return {
        input: 0.0005,
        output: 0,
      }
    case 'Rerank':
      return {
        input: 0.0008,
        output: 0,
      }
    case 'ChatCompletions':
    default:
      return {
        input: 0.002,
        output: 0.006,
      }
  }
}

export const useSystemConfig = (autoFetch = false) => {
  const {
    data,
    error,
    loading,
    run: fetchConfig,
    refresh: originalRefresh,
  } = useRequest(
    () => {
      if (systemConfig) return Promise.resolve(systemConfig)
      return apiSystemConfig().then((res: IResponse<SystemConfig>) => {
        systemConfig = res.data
        return systemConfig
      })
    },
    {
      manual: !autoFetch,
      cacheKey: 'systemConfig',
      throttleWait: 500,
    },
  )

  // 获取插件列表作为 channelTypeOptions
  const { data: pluginListData } = useRequest(
    () => {
      if (pluginListCache) return Promise.resolve(pluginListCache)
      return apiPluginList({
        page: 1,
        page_size: 1000, // 获取所有插件
      }).then((res) => {
        const options = res.data?.items?.map((item: any) => ({
          label: item.name,
          value: item.id,
        })) || []
        pluginListCache = options
        return options
      })
    },
    {
      manual: !autoFetch,
      cacheKey: 'pluginList',
      throttleWait: 500,
    },
  )

  // 自定义 refresh 函数，清除缓存后重新获取数据
  const refresh = () => {
    systemConfig = null // 清除缓存
    pluginListCache = null // 清除插件列表缓存
    return originalRefresh()
  }

  const modelTypeOptions: IOption[] = data?.MODEL_TYPE
    ? Object.entries(data.MODEL_TYPE).map(([value, label]) => ({
        label,
        value,
      }))
    : []

  const modelPermissionOptions: IOption[] = data?.MODEL_PERMISSION
    ? Object.entries(data.MODEL_PERMISSION).map(([value, label]) => ({
        label,
        value,
      }))
    : []

  // 使用插件列表数据作为 channelTypeOptions
  const channelTypeOptions: IOption[] = pluginListData || []

  const securityPolicyOptions: IOption[] = data?.SECURITY_POLICY
    ? data.SECURITY_POLICY.map((item) => ({
        label: item.text,
        value: item.key,
      }))
    : []

  // 语音合成配置 -> 下拉选项（value 为 config key，label 为配置文案）
  const recordToOptions = (record: Record<string, string> | undefined): IOption[] =>
    record ? Object.entries(record).map(([value, label]) => ({ value, label })) : []
  const voiceSceneOptions: IOption[] = recordToOptions(data?.VOICE_SCENE)
  const voiceBizLanguageOptions: IOption[] = recordToOptions(data?.VOICE_BIZ_LANGUAGE)
  const voiceGenderOptions: IOption[] = recordToOptions(data?.VOICE_GENDER)
  const voiceAgeGroupOptions: IOption[] = recordToOptions(data?.VOICE_AGE_GROUP)
  const voiceTargetLanguageOptions: IOption[] = recordToOptions(data?.VOICE_TARGET_LANGUAGE)

  localStorage.setItem('deepexiStackServerEnabled', JSON.stringify({
    deepexiStackServerEnabled: data?.DEEPEXI_STACK_SERVER_ENABLED ?? false,
    deepexiFirewallEnabled: data?.DEEPEXI_FIREWALL_ENABLED ?? false,
  }))

  return {
    isLoading: loading,
    error,
    modelAvatars: data?.MODEL_IMAGES ?? [],
    modelTypeOptions,
    channelTypeOptions,
    modelPermissionOptions,
    amountSymbol: data?.AMOUNT_SYMBOL ?? '$',
    quotaPerUnit: data?.QUOTA_PER_UNIT ?? 5000,
    securityPolicyOptions,
    gpuStackServer: data?.DEEPEXI_STACK_SERVER ?? '',
    gpuStackToken: data?.DEEPEXI_STACK_TOKEN ?? '',
    deepexiStackServerEnabled: data?.DEEPEXI_STACK_SERVER_ENABLED ?? false,
    deepexiFirewallEnabled: data?.DEEPEXI_FIREWALL_ENABLED ?? false,
    securityLevel: data?.DATA_SECURITY_LEVEL?.map((item) => ({ label: $t(item as keyof typeof $t), value: item })) ?? [],
    workbenchHost: data?.WORKBENCH_HOST ?? '',
    securityLevelEnabled: data?.SECURITY_LEVEL_ENABLED ?? false,
    deepexiLabServerEnabled: data?.DEEPEXI_LAB_SERVER_ENABLED ?? false,
    deepexiLabServer: data?.DEEPEXI_LAB_SERVER ?? '',
    endpointList: data?.ENDPOINT_LIST ?? [],
    refresh,
    fetchConfig,
    // 语音合成配置选项
    voiceSceneOptions,
    voiceBizLanguageOptions,
    voiceGenderOptions,
    voiceAgeGroupOptions,
    voiceTargetLanguageOptions,
  }
}

/**
 * 模型体验类型菜单
 */
export const ModelExperienceTypeMenu: Record < string, string > = {
  'text': $t('文本模型'),
  'vision': $t('多模态'),
  'vl-model': $t('VL模型'),
  'rerank': $t('重排模型'),
  'transcriptions': $t('语音模型'),
}
