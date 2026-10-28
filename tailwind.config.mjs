/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
      colors: {
        dossier: 'rgb(var(--color-dossier) / <alpha-value>)',
        sheet: 'rgb(var(--color-sheet) / <alpha-value>)',
        ink: 'rgb(var(--color-ink) / <alpha-value>)',
        slateink: 'rgb(var(--color-slateink) / <alpha-value>)',
        vermilion: 'rgb(var(--color-vermilion) / <alpha-value>)',
        verified: 'rgb(var(--color-verified) / <alpha-value>)',
        cobalt: 'rgb(var(--color-cobalt) / <alpha-value>)',
        lighttable: '#0B0E14',
      },
      boxShadow: {
        press: '4px 4px 0px 0px var(--shadow-ink)',
        'press-sm': '2px 2px 0px 0px var(--shadow-ink)',
        'press-vermilion': '4px 4px 0px 0px #D92B2B',
      },
    },
  },
  plugins: [],
};
