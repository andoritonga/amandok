/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
      colors: {
        dossier: '#F3EFE6',
        sheet: '#FAF8F3',
        ink: '#121316',
        slateink: '#4A4E58',
        vermilion: '#D92B2B',
        verified: '#0A6847',
        cobalt: '#1D4ED8',
        lighttable: '#0B0E14',
      },
      boxShadow: {
        press: '4px 4px 0px 0px #121316',
        'press-sm': '2px 2px 0px 0px #121316',
        'press-vermilion': '4px 4px 0px 0px #D92B2B',
      },
    },
  },
  plugins: [],
};
