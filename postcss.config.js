export default {
  plugins: {
    // Tema, src/theme/index.css içinde @import ile birleştirilir; bu eklenti
    // tailwindcss'ten ÖNCE çalışıp dosyaları tek dosyada satır içine alır.
    'postcss-import': {},
    tailwindcss: {},
    autoprefixer: {},
  },
}
