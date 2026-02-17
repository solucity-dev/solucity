// apps/mobile/app.config.js
/** @type {import('@expo/config-types').ExpoConfig} */
module.exports = {
  name: 'Solucity',
  slug: 'solucity',
  version: '1.1.4',
  orientation: 'portrait',
  scheme: 'solucity',

  icon: './assets/icon.png',

  userInterfaceStyle: 'light',
  newArchEnabled: true,

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
    versionCode: 30,
    blockedPermissions: ['android.permission.RECORD_AUDIO'],
    googleServicesFile: './google-services.json',
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
    notification: {
      icon: './assets/notification-icon.png',
      color: '#004d5d',
    },
  },

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
