/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#fffaf0',
        pink: { soft: '#ffe3ec', DEFAULT: '#ffc9da', deep: '#f08fb0' },
        lavender: { soft: '#f0eaff', DEFAULT: '#ddd0ff', deep: '#9b83e6' },
        milk: { soft: '#eaf5ff', DEFAULT: '#cfe6ff', deep: '#6fa8e8' },
        butter: { soft: '#fff8d6', DEFAULT: '#ffeea0', deep: '#e8c13d' },
        mint: { soft: '#e6faf1', DEFAULT: '#c4f0dc', deep: '#4fbf93' },
        ink: { DEFAULT: '#4a3f5c', soft: '#7a6f8c', faint: '#b9b0c6' },
      },
      fontFamily: {
        pixel: ['Galmuri11', 'Galmuri9', 'system-ui', 'sans-serif'],
        body: ['Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        pixel: '3px 3px 0 0 rgba(74,63,92,0.18)',
        'pixel-lg': '5px 5px 0 0 rgba(74,63,92,0.18)',
      },
    },
  },
  plugins: [],
};
