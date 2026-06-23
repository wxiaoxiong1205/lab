import antfu from '@antfu/eslint-config'

export default function getEslintConfig(config = {}, ...overrides) {
  const { ignores = [], ...restConfig } = config
  return antfu(
    {
      ignores: [
        'dist',
        'public',
        '**/static/**',
        '.editorconfig',
        '.env.*',
        '.gitignore',
        'pnpm-lock.yaml',
        '*.svg',
        '*.png',
        '*.jpg',
        ...ignores,
      ],
      ...restConfig,
    },
    {
      rules: {
        'no-console': ['warn', { allow: ['warn', 'info', 'error'] }],
        'array-callback-return': ['warn'],
        'arrow-parens': ['error', 'always'], // 函数参数必需要用括号
        'style/arrow-parens': ['error', 'always'], // 函数参数必需要用括号
        // 'curly': ['error', 'multi', 'consistent'], // 多行一定要{}， if...else则匹配
        '@typescript-eslint/brace-style': ['off'], // 关闭奇怪的花括号带来的换行
        'unused-imports/no-unused-vars': ['warn'], // 未使用变量仅警告
        'prefer-promise-reject-errors': ['warn'], // 错误信息必须为 Error 对象
        'regexp/no-unused-capturing-group': ['warn'], // 关闭未使用的捕获组告警
        'style/max-statements-per-line': ['error', { max: 2 }], // style/max-statements-per-line 警告，控制超过2个条件判断
        'eslint-comments/no-unlimited-disable': ['off'], // 关闭eslint-comments/no-unlimited-disable 错误，允许全局禁用
      },
    },
    {
      files: ['**/*.vue'],
      rules: {
        'vue/no-unused-refs': ['warn'], // vue template 中的 ref 未使用仅警告
        'vue/custom-event-name-casing': ['warn', 'kebab-case', { ignores: ['/^[a-z]+(?:-[a-z]+)*:[a-z]+(?:-[a-z]+)*$/u'] }], // vue2必须，vue3支持驼峰，但推荐说法不一，故统一为 kebab-case，
      },
    },
    ...overrides,
  )
}
