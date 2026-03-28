import { CameraType, CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = {
  navigation: any;
  route: {
    params?: {
      onCaptured?: (uri: string) => void;
    };
  };
};

export default function SelfieCaptureScreen({ navigation }: Props) {
  const cameraRef = useRef<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [taking, setTaking] = useState(false);

  const takePhoto = async () => {
    try {
      if (!cameraRef.current || taking) return;

      setTaking(true);

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
      });

      const uri = photo?.uri;
      if (!uri) {
        Alert.alert('Error', 'No se pudo obtener la foto.');
        return;
      }

      navigation.navigate('RegisterSpecialist', {
        selfieUri: uri,
        selfieCapturedAt: Date.now(),
      });
    } catch (e) {
      console.log('[SelfieCaptureScreen][takePhoto][error]', e);
      Alert.alert('Error', 'No se pudo tomar la selfie.');
    } finally {
      setTaking(false);
    }
  };

  if (!permission) {
    return (
      <View style={s.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={s.permissionWrap}>
        <Text style={s.title}>Necesitamos acceso a la cámara</Text>
        <Text style={s.subtitle}>Usamos la cámara para tomar tu selfie de verificación.</Text>

        <Pressable style={s.primaryBtn} onPress={requestPermission}>
          <Text style={s.primaryBtnText}>Dar permiso</Text>
        </Pressable>

        <Pressable style={s.secondaryBtn} onPress={() => navigation.goBack()}>
          <Text style={s.secondaryBtnText}>Volver</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <View style={s.container}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={'front' as CameraType} />

      <SafeAreaView style={s.overlay}>
        <View style={s.topBar}>
          <Pressable style={s.backBtn} onPress={() => navigation.goBack()}>
            <Text style={s.backBtnText}>← Volver</Text>
          </Pressable>
        </View>

        <View style={s.guideWrap}>
          <View style={s.guideCircle} />
          <Text style={s.guideText}>
            Centrá tu rostro dentro del círculo y sacá la foto con buena luz.
          </Text>
        </View>

        <View style={s.bottomBar}>
          <Pressable
            style={[s.captureBtn, taking && { opacity: 0.6 }]}
            onPress={takePhoto}
            disabled={taking}
          >
            <View style={s.captureInner} />
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionWrap: {
    flex: 1,
    backgroundColor: '#0B6B76',
    padding: 24,
    justifyContent: 'center',
    gap: 14,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
  },
  topBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  backBtn: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
  },
  backBtnText: {
    color: '#fff',
    fontWeight: '800',
  },
  guideWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  guideCircle: {
    width: 250,
    height: 320,
    borderRadius: 160,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.95)',
    backgroundColor: 'transparent',
  },
  guideText: {
    color: '#fff',
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  bottomBar: {
    alignItems: 'center',
    paddingBottom: 24,
  },
  captureBtn: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 5,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  captureInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#fff',
  },
  primaryBtn: {
    height: 48,
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  primaryBtnText: {
    color: '#0B6B76',
    fontWeight: '800',
  },
  secondaryBtn: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: '#fff',
    fontWeight: '800',
  },
});
