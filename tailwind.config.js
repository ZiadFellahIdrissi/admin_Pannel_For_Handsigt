/** @type {import('tailwindcss').Config} */
module.exports = {
  // Toggled by the `data-theme="dark"` attribute theme-init.js stamps on
  // <html> (not the OS media query directly) so the viewer's explicit
  // choice always wins, in both directions.
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./views/**/*.ejs'],
  theme: {
    extend: {
      colors: {
        // Real Handsight Solutions brand tokens, defined as CSS custom
        // properties in public/css/input.css :root. Update the values
        // there if the brand guide changes - nothing here needs to move.
        brand: {
          dark: 'var(--dark)',
          DEFAULT: 'var(--dark-2)',
          darker: 'var(--dark-3)',
          accent: 'var(--blue)',
          accentLight: 'var(--blue-2)',
          accentDim: 'var(--blue-dim)',
          gray: 'var(--gray)',
          gray2: 'var(--gray-2)',
          text: 'var(--text)',
          textLight: 'var(--text-light)',
          light: 'var(--light)',
          borderDark: 'var(--border-dark)',
          borderLight: 'var(--border-light)'
        }
      },
      borderRadius: {
        DEFAULT: 'var(--radius-sm)',
        md: 'var(--radius-sm)',
        lg: 'var(--radius)'
      }
    }
  },
  plugins: []
};
