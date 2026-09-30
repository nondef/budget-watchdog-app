/// <reference types="vitest/config" />

import legacy from '@vitejs/plugin-legacy'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { defineConfig } from 'vite'
import { readFileSync } from "fs"

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

// https://vitejs.dev/config/
export default defineConfig({
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    plugins: [
        vue(),
        legacy(),
    ],
    server: {
        port: Number(process.env.PORT) || 8821,
        headers: {
            'Cross-Origin-Embedder-Policy': 'require-corp',
            'Cross-Origin-Opener-Policy': 'same-origin',
        }
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    optimizeDeps: {
        exclude: ['jeep-sqlite']
    },
    test: {
        globals: true,
        environment: 'jsdom'
    },
})
