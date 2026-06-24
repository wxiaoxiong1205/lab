import type { Config } from 'tailwindcss'
import tailwindPreset from '@deep/theme/preset'

export default {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{css}',
  ],
  presets: [tailwindPreset],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        label: 'rgba(38, 36, 76, 0.65)',
        default: 'rgba(38, 36, 76, 0.88)',
      },
    },
  },
  plugins: [],
} satisfies Config
