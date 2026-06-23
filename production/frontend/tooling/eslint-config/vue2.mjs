import getEslintConfigBase from './base.mjs'

export default function getEslintConfig(config = {}, ...overrides) {
  return getEslintConfigBase(
    {
      vue: {
        vueVersion: 2,
      },
      ...config,
    },
    {
      rules: {
        'no-sequences': ['warn'], // FIXME 允许使用逗号操作符, 临时放行
        'no-throw-literal': ['warn'], // FIXME 临时放行，允许 throw 字符串
        'node/prefer-global/process': ['warn'], // node:process有些场景会导致报错
      },
    },
    {
      files: ['**/*.vue'],
      rules: {
        'vue/no-deprecated-slot-attribute': ['warn'],
        'vue/no-deprecated-v-on-native-modifier': ['off'],
        'vue/no-deprecated-v-bind-sync': ['off'],
        'vue/no-template-shadow': ['warn'], // FIXME 模板内的重复变量名，嵌套v-for出现几率较大
        'vue/no-reserved-component-names': ['warn'], // FIXME html保留标签名冲突
        'vue/no-mutating-props': ['warn'], // props允许被修改，多数是<form :model="formData"/>场景
      },
    },
    ...overrides,
  )
}
