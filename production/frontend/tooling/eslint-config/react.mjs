import getEslintConfigBase from './base.mjs'

export default function getEslintConfig(config = {}, ...overrides) {
  return getEslintConfigBase(
    {
      react: true,
      ...config,
    },
    {
      rules: {
        'no-sequences': ['warn'], // FIXME 允许使用逗号操作符, 临时放行
        'no-throw-literal': ['warn'], // FIXME 临时放行，允许 throw 字符串
        'node/prefer-global/process': ['warn'], // node:process有些场景会导致报错
      },
    },
    ...overrides,
  )
}
