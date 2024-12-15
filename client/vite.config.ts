import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// @ts-expect-error See https://github.com/gxmari007/vite-plugin-eslint/issues/79
import eslintPlugin, {Options} from "vite-plugin-eslint";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), eslintPlugin({
    include: ['src/**/*.ts', 'src/**/*.tsx', 'src/**/*.js', 'src/**/*.jsx'],
  } as Options)],
  server: {
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:6001',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  }
})
