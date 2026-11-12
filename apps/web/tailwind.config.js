import preset from '@clab/tokens/preset';

/** @type {import('tailwindcss').Config} */
export default {
  presets: [preset],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  plugins: [],
};
