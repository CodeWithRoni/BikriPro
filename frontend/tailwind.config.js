/** BikriPro design tokens — "Ocean Blue" brand */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Vibrant yet soothing ocean blue; 600 is the primary brand shade
        ocean: {
          50: '#eef8ff', 100: '#d9efff', 200: '#bce3ff', 300: '#8dd2ff', 400: '#57b8fd',
          500: '#3099f9', 600: '#1a7cee', 700: '#1365db', 800: '#1652b1', 900: '#18478b', 950: '#132d55',
        },
        surface: { DEFAULT: '#ffffff', dark: '#0f172a' },
      },
      fontFamily: {
        sans: ['Inter', 'Hind Siliguri', 'Noto Sans Bengali', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)',
        pop: '0 12px 32px -8px rgba(19,101,219,.25)',
      },
    },
  },
  plugins: [],
};
