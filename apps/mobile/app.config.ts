// apps/mobile/app.config.ts
import { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'solucity',
  slug: 'solucity',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  newArchEnabled: true,
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#004d5d',
  },

  ios: {
    supportsTablet: true,
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'Usamos tu ubicación para mostrar especialistas cercanos.',
      NSPhotoLibraryUsageDescription: 'Necesitamos acceder a tus fotos para subir tu DNI y selfie.',
      NSPhotoLibraryAddUsageDescription: 'Permití guardar fotos si querés descargar comprobantes.',
      NSCameraUsageDescription: 'Necesitamos la cámara para tomar fotos del DNI y una selfie.',
    },
  },

  android: {
    // ✅ ESTO ES LO QUE TE FALTA PARA EAS
    package: 'com.solucity.app',

    // ✅ IMPORTANTE (ruta relativa a apps/mobile/app.config.ts)
    googleServicesFile: './google-services.json',

    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    usesCleartextTraffic: true,
    permissions: [
      'ACCESS_COARSE_LOCATION',
      'ACCESS_FINE_LOCATION',
      'CAMERA',
      'READ_MEDIA_IMAGES',
      'POST_NOTIFICATIONS',
    ],
  } as any,

  web: { output: 'single', favicon: './assets/favicon.png' },

  extra: {
    API_URL: 'http://192.168.0.102:3000',
    eas: {
      projectId: '7fab222f-080a-420e-a1eb-87e000e2f4c3',
    },
  },

  plugins: [
    'expo-secure-store',
    'expo-location',
    [
      'expo-image-picker',
      {
        photosPermission: 'Necesitamos acceder a tus fotos para subir tu DNI y selfie.',
        cameraPermission: 'Necesitamos la cámara para tomar fotos del DNI y una selfie.',
      },
    ],
    'expo-notifications',
  ],
};

export default config;
