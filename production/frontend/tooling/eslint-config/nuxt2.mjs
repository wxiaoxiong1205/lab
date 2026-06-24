import getEslintConfigVue2 from './vue2.mjs'
// import { FlatCompat } from '@eslint/eslintrc'

// const compat = new FlatCompat()

export default function getEslintConfig(config = {}, ...overrides) {
  const { ignores = [], ...restConfig } = config
  return getEslintConfigVue2(
    {
      ignores: [
        '.nuxt',
        'test',
        ...ignores,
      ],
      ...restConfig,
    },
    // ...compat.config({
    //   extends: [
    //     '@nuxtjs/eslint-config-typescript',
    //   ],
    // }),
    {
      files: ['**/*.vue'],
      rules: {
        'vue/block-order': ['warn', {
          order: [['script', 'template'], 'style'],
        }],

        'ts/no-use-before-define': 'warn',
      },
    },
    ...overrides,
  )
}
