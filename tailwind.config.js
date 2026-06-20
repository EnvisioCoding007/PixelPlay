/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./views/**/*.ejs",
    "./public/**/*.html"
  ],
  theme: {
    extend: {
      colors: {
        'pixel-bg': '#0b0c10',
        'sidebar-bg': '#121418',
        'content-bg': '#0f1115',
        'card-bg': '#16181d',
        'pixel-red': '#f92a40',
        'pixel-blue': '#2cb5e8',
        'pixel-blue-hover': '#1a9bc9',
        'pixel-yellow': '#f0b90b',
        'input-dark-border': '#2d3139',
        accent: 'var(--theme-accent)',
        charcoal: '#1A1A1A',
        primary: "var(--theme-accent, #0EA5E9)", // Backwards compatibility for primary if needed
        "background-light": "#F3F4F6",
        "background-dark": "#0B0C10",
        "surface-dark": "#16181D",
        "surface-hover": "#1F232B",
        "border-dark": "#1F232B",
        "text-muted": "#8A8A93"
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ["Inter", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "0.5rem",
      },
    },
  },
  plugins: [],
};
