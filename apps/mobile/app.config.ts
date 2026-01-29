import type { ExpoConfig } from '@expo/config-types';

const config: ExpoConfig = {
  name: 'solucity',
  slug: 'solucity',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'solucity',

  // ✅ Ícono principal de la app (launcher)
  icon: './assets/icon.png',

  userInterfaceStyle: 'light',
  newArchEnabled: true,

  // ✅ Splash
  splash: {
    image: './assets/splash-logo.png',
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
    package: 'com.solucity.app',
    versionCode: 1,

    blockedPermissions: ['android.permission.RECORD_AUDIO'],

    // ✅ Firebase
    googleServicesFile: './google-services.json',

    // ✅ Adaptive icon (Android moderno)
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },

    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,

    permissions: [
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.CAMERA',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.POST_NOTIFICATIONS',
    ],
  } as any,

  web: {
    output: 'single',
    favicon: './assets/favicon.png',
  },

  extra: {
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
    './plugins/removeRecordAudio',
  ],
};

export default config;
