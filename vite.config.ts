import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// MediaPipe の WASM(.wasm)とモデル(.task)を含む最大ファイルサイズに
// 合わせて、必要な範囲だけ Workbox のキャッシュ上限を引き上げる。
// 実測: vision_wasm_internal.wasm が約 11.15MB で最大。
const MAX_PRECACHE_FILE_SIZE_BYTES = 12 * 1024 * 1024

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: [
        'favicon.png',
        'apple-touch-icon.png',
        'icon-source.png',
      ],
      manifest: {
        name: 'Jump Analyzer',
        short_name: 'Jump Analyzer',
        lang: 'ja',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        theme_color: '#010837',
        background_color: '#010837',
        description:
          'バレーボールのジャンプ動作を動画から解析するアプリ',
        categories: ['sports', 'utilities'],
        icons: [
          {
            src: 'pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // .task(モデル)と.wasmがキャッシュ対象から漏れないようにする
        globPatterns: [
          '**/*.{js,css,html,ico,png,svg,webmanifest,json,task,wasm}',
        ],
        maximumFileSizeToCacheInBytes: MAX_PRECACHE_FILE_SIZE_BYTES,
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        // 動画のBlob URLやユーザー選択ファイルはfetchを跨がないためruntimeCaching対象外。
      },
    }),
  ],
})
