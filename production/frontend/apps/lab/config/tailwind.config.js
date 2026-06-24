import tailwindPreset from '@deep/theme/preset'

/** @type {import('tailwindcss').Config} */
export default {
  content: ["../src/**/*.{html,js,jsx,ts,tsx}"],
  presets: [tailwindPreset],
  theme: {
    extend: {},
  },
  plugins: [],
}
