import * as path from 'node:path'
import {defineConfig} from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({command, mode}) => {
    const isProd = command === 'build' // true during `vite` dev server

    return {
        base: '/app/',
        plugins: [vue()],
        resolve: {
            alias: {
                // `import.meta.dirname` rather than `__dirname`: Vite 8's
                // native config loader (the planned default) has no CJS globals.
                '@': path.resolve(import.meta.dirname, './src'),
            },
        },
        build: {
            // Vite 8 minifies with Oxc through Rolldown. The previous explicit
            // minify: 'esbuild' forced an optional peer that is not installed
            // in a clean environment - it only worked locally because esbuild
            // happened to be hoisted into node_modules, and the Docker build
            // failed on it.
            minify: true,
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
