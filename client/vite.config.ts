
import {defineConfig} from 'vite'
import vue from '@vitejs/plugin-vue'
import * as path from "node:path";

export default defineConfig(({command, mode}) => {
    const isProd = command === 'build' // true during `vite` dev server

    return {
        base: '/app/',
        plugins: [vue()],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src'), // 👈 this line is required
            },
        },
        build: {
            minify: 'esbuild', // esbuild handles minification in Vite
        },
        server: {
            proxy: isProd
                ? undefined
                : {
                    '/api/rest': {
                        // Dev API port is configurable so the dev server can avoid a
                        // port already taken on the host machine.
                        target: process.env.VITE_API_TARGET ?? 'http://localhost:3000',
                        changeOrigin: true,
                        secure: false,
                    },
                },
        },
    };
})
