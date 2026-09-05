/** @type {import('tailwindcss').Config} */
const config = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}', './lib/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#07100e',
        panel: '#0c1714',
        panel2: '#101e1a',
        line: 'rgba(206,236,221,.14)',
        muted: '#789087',
        acid: '#d4ff70',
        mint: '#61dec0',
        ember: '#ff6b3d',
        ink: '#edf5f0',
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        sans: ['Manrope', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        panel: '0 4px 15px rgba(0, 0, 0, .25)',
        glow: '0 0 0 2px rgba(212,255,112,.25)',
      },
    },
  },
  plugins: [],
}

module.exports = config