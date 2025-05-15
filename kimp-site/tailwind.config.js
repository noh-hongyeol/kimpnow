/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
      "./app/**/*.{js,ts,jsx,tsx}",
      "./pages/**/*.{js,ts,jsx,tsx}",
      "./components/**/*.{js,ts,jsx,tsx}",
      "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
      extend: {
        keyframes: {
          flash: {
            '0%': { opacity: '1', transform: 'scale(1)', backgroundColor: 'rgba(255,255,255,0.2)' },
            '50%': { opacity: '0.5', transform: 'scale(1.05)', backgroundColor: 'rgba(255,255,255,0.4)' },
            '100%': { opacity: '1', transform: 'scale(1)', backgroundColor: 'transparent' },
          },
        },
        animation: {
          'flash-once': 'flash 0.4s ease-in-out',
        },
      },
    },
    plugins: [],
  };
  