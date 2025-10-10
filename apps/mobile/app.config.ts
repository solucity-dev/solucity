// app.config.ts
import type { ExpoConfig } from '@expo/config'
import 'dotenv/config'

const ENV = process.env.APP_ENV ?? 'development'

const config: ExpoConfig = {
  name: 'solucity',
  slug: 'solucity',
  scheme: 'solucity',
  version: '1.0.0',
  extra: {
    API_URL: process.env.EXPO_PUBLIC_API_URL,
    FEATURE_FLAGS: process.env.EXPO_PUBLIC_FEATURE_FLAGS,
    APP_ENV: ENV,
    eas: { projectId: 'replace-me-later-if-you-use-eas' },
  },
  icon: './assets/icon.png',
  splash: {
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  // 👇 ESTE CAMBIO
  web: {
    output: 'single',
    favicon: './assets/favicon.png',
  },
}

export default config
