/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        logo: ['Silkscreen', 'monospace'],
      },
      colors: {
        brand: {
          50: '#e8f5ec',
          100: '#d3eedb',
          500: '#00a63e',
          600: '#008f35',
          700: '#007a2e',
        },
        // Light grey fill used by search, inputs and the editor in the design
        surface: '#f4f5f4',
      },
    },
  },
  plugins: [],
};
