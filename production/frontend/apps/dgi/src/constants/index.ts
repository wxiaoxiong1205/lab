export const PROVIDER_CUSTOM = 8
export const PROVIDER_AZURE_OPENAI = 3
export const PROVIDER_VOLCENGI = 40

// 人员权限级别
export const USER_PERMISSION_LEVELS = {
  NON_SECRET: '非密',
  GENERAL: '一般',
  IMPORTANT: '重要',
  CORE: '核心',
} as const

// 数据安全级别
export const DATA_SECURITY_LEVELS = {
  PUBLIC: '公开',
  ACCEPTANCE: '受控',
  GENERAL_PASSWORD: '普通商密',
  CORE_BUSINESS: '核心商密',
  INTERNAL: '内部',
  MM: 'MM',
  JM: 'JM',
} as const

// 权限映射配置 - 根据用户权限级别获取可访问的数据安全级别
export const PERMISSION_DATA_ACCESS_MAP = {
  [USER_PERMISSION_LEVELS.NON_SECRET]: [
    { label: DATA_SECURITY_LEVELS.PUBLIC, value: '公开', enabled: true },
    { label: DATA_SECURITY_LEVELS.ACCEPTANCE, value: '受控', enabled: true },
    { label: DATA_SECURITY_LEVELS.GENERAL_PASSWORD, value: '普通商密', enabled: true },
    { label: DATA_SECURITY_LEVELS.CORE_BUSINESS, value: '核心商密', enabled: true },
    { label: DATA_SECURITY_LEVELS.INTERNAL, value: '内部', enabled: true },
    { label: DATA_SECURITY_LEVELS.MM, value: 'MM', enabled: false },
    { label: DATA_SECURITY_LEVELS.JM, value: 'JM', enabled: false },
  ],
  [USER_PERMISSION_LEVELS.GENERAL]: [
    { label: DATA_SECURITY_LEVELS.PUBLIC, value: '公开', enabled: true },
    { label: DATA_SECURITY_LEVELS.ACCEPTANCE, value: '受控', enabled: true },
    { label: DATA_SECURITY_LEVELS.GENERAL_PASSWORD, value: '普通商密', enabled: true },
    { label: DATA_SECURITY_LEVELS.CORE_BUSINESS, value: '核心商密', enabled: true },
    { label: DATA_SECURITY_LEVELS.INTERNAL, value: '内部', enabled: true },
    { label: DATA_SECURITY_LEVELS.MM, value: 'MM', enabled: true },
    { label: DATA_SECURITY_LEVELS.JM, value: 'JM', enabled: false },
  ],
  [USER_PERMISSION_LEVELS.IMPORTANT]: [
    { label: DATA_SECURITY_LEVELS.PUBLIC, value: '公开', enabled: true },
    { label: DATA_SECURITY_LEVELS.ACCEPTANCE, value: '受控', enabled: true },
    { label: DATA_SECURITY_LEVELS.GENERAL_PASSWORD, value: '普通商密', enabled: true },
    { label: DATA_SECURITY_LEVELS.CORE_BUSINESS, value: '核心商密', enabled: true },
    { label: DATA_SECURITY_LEVELS.INTERNAL, value: '内部', enabled: true },
    { label: DATA_SECURITY_LEVELS.MM, value: 'MM', enabled: true },
    { label: DATA_SECURITY_LEVELS.JM, value: 'JM', enabled: true },
  ],
  [USER_PERMISSION_LEVELS.CORE]: [
    { label: DATA_SECURITY_LEVELS.PUBLIC, value: '公开', enabled: true },
    { label: DATA_SECURITY_LEVELS.ACCEPTANCE, value: '受控', enabled: true },
    { label: DATA_SECURITY_LEVELS.GENERAL_PASSWORD, value: '普通商密', enabled: true },
    { label: DATA_SECURITY_LEVELS.CORE_BUSINESS, value: '核心商密', enabled: true },
    { label: DATA_SECURITY_LEVELS.INTERNAL, value: '内部', enabled: true },
    { label: DATA_SECURITY_LEVELS.MM, value: 'MM', enabled: true },
    { label: DATA_SECURITY_LEVELS.JM, value: 'JM', enabled: true },
  ],
} as const

/**
 * 根据用户权限级别获取可访问的数据安全级别列表
 * @param userPermissionLevel 用户权限级别（中文）
 * @returns 数据安全级别选项列表，包含enabled状态
 */
export const getDataSecurityLevelsByUserPermission = (userPermissionLevel: keyof typeof PERMISSION_DATA_ACCESS_MAP) => {
  return PERMISSION_DATA_ACCESS_MAP[userPermissionLevel]
}

/**
 * 检查用户是否有权限访问指定的数据安全级别
 * @param userPermissionLevel 用户权限级别（中文）
 * @param dataSecurityLevel 数据安全级别
 * @returns 是否有权限访问
 */
export const hasDataSecurityAccess = (userPermissionLevel: keyof typeof PERMISSION_DATA_ACCESS_MAP, dataSecurityLevel: string): boolean => {
  const accessList = getDataSecurityLevelsByUserPermission(userPermissionLevel)
  const targetLevel = accessList.find((item) => item.value === dataSecurityLevel)
  return targetLevel?.enabled ?? false
}

// export const PROVIDER_LIST = [
//   {
//     label: $t("自定义"),
//     value: PROVIDER_CUSTOM,
//   },
//   {
//     label: "Azure OpenAI",
//     value: PROVIDER_AZURE_OPENAI,
//   },
//   {
//     label: $t("字节火山引擎"),
//     value: PROVIDER_VOLCENGI,
//   },
// ];

// export let MODEL_TYPE_LIST = [
//   {
//     label: $t("未指定类型"),
//     value: 'Unknown',
//   },
//   {
//     label: $t("Chat 文本生成"),
//     value: 'ChatCompletions',
//   },
//   {
//     label: "Embedding 向量",
//     value: 'Embeddings',
//   },
//   {
//     label: "Rerank 重排序",
//     value: 'Rerank',
//   },
//   {
//     label: "VL 多模态",
//     value: 'Vision-Language',
//   },
// ];
