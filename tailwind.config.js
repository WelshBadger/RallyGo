/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        rl: {
          bg: '#0f0f0f',
          surface: '#1a1a1a',
          card: '#222222',
          border: 'rgba(255,255,255,0.1)',
          accent: '#FF9641',
          'accent-hover': '#F4811F',
          carbon: '#303030',
          muted: 'rgba(255,255,255,0.45)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
