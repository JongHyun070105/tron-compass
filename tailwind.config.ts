import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        tron: {
          red: "#FF060A",
          dark: "#0B0F19",
          card: "#111827",
          border: "#1F2937",
          subtle: "#374151",
          accent: "#EF4444",
        },
      },
    },
  },
  plugins: [],
};
export default config;
