/** OFM Smart Fleet brand tokens - PRD section 5.11 (locked). */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ofm: {
          red: "#C0392B",
          green: "#1DB06A",
          orange: "#E8930A",
          blue: "#2D7DD2",
          bg: "#F4F5F9",
        },
        sls: { blue: "#2563eb", ink: "#1e3a8a" },
        feed: { bag: "#d6c08a" },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        ar: ["'Noto Naskh Arabic'", "'Cairo'", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
