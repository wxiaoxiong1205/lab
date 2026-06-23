import getEslintConfig from '@deep/eslint-config/react'

export default getEslintConfig(
  {
    env: { browser: true, es2022: true },
    ignores: [
      'build',
      'docker',
      'scripts',
      'docs',
      'config',
      'types',
      'menus',
      'project_doc',
    ],
  },
  {
    rules: {
      // ========== 核心规则 ==========
      'no-undef': 'error',
      // 临时关闭：允许先不处理 hooks 调用位置问题（你本次要排除该 error）
      'react-hooks/rules-of-hooks': 'error',

      // ========== 先用 warn 避免阻塞 ==========
      '@typescript-eslint/no-unused-vars': 'warn',
      'eqeqeq': 'warn',

      // ========== 逻辑/条件类 ==========
      'no-constant-condition': 'off',
      'no-empty': 'off',
      'no-unused-vars': 'off',

      // ========== 类型相关 ==========
      '@typescript-eslint/no-explicit-any': 'off',
      'no-unsafe-optional-chaining': 'off',
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/ban-types': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      'ts/no-use-before-define': 'off',
      '@typescript-eslint/no-use-before-define': 'off',

      // ========== 风格/格式 ==========
      'ts/consistent-type-definitions': 'off',
      'style/no-tabs': 'off',
      'style/no-mixed-spaces-and-tabs': 'off',
      'import/no-duplicates': 'off',
      'style/multiline-ternary': 'off',
      'antfu/if-newline': 'off',
      'antfu/consistent-list-newline': 'off',
      'antfu/top-level-function': 'off',
      'no-var': 'off',
      'no-irregular-whitespace': 'warn',
      '@eslint-react/no-missing-key': 'warn',

      // ========== 语言特性 ==========
      'unicorn/prefer-number-properties': 'off',
      'prefer-promise-reject-errors': 'off',
      'ts/no-require-imports': 'off',
      'ts/no-var-requires': 'off',
      'unicorn/no-new-array': 'off',
      'no-use-before-define': 'off',
      'ts/no-this-alias': 'off',
      'prefer-regex-literals': 'off',

      // ========== 正则 ==========
      'regexp/no-unused-capturing-group': 'off',
      'regexp/strict': 'off',
      'regexp/no-super-linear-backtracking': 'off',
      'regexp/no-useless-quantifier': 'off',
      'regexp/prefer-w': 'off',
      'regexp/use-ignore-case': 'off',
      'regexp/no-useless-non-capturing-group': 'off',

      // ========== 测试 ==========
      'test/prefer-lowercase-title': 'off',
      'test/consistent-test-it': 'off',

      // ========== React / 未使用 import ==========
      'unused-imports/no-unused-imports': 'off',
      'react/no-nested-components': 'off',
      'react/no-unstable-default-props': 'off',

      // 临时关闭（用于排除你点名的这几类 error）
      'node/handle-callback-err': 'off',
      'ts/no-unused-expressions': 'off',
    },
  },
)
