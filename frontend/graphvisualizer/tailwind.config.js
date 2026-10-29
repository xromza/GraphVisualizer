const token = name => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: token('canvas'),
        surface: token('surface'),
        fill: token('fill'),
        'fill-hover': token('fill-hover'),
        'fill-selected': token('fill-selected'),
        separator: token('separator'),
        label: token('label'),
        secondary: token('secondary'),
        tertiary: token('tertiary'),
        accent: token('accent'),
        'accent-fill': token('accent-fill'),
        success: token('success'),
        warning: token('warning'),
        danger: token('danger'),
        'danger-fill': token('danger-fill'),
      },
      borderRadius: {
        panel: '20px',
        card: '12px',
        control: '8px',
      },
      fontFamily: {
        sans: 'var(--font-text)',
        mono: 'var(--font-numeric)',
      },
    },
  },
  plugins: [],
}
