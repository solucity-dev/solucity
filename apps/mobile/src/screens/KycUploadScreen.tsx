import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '../lib/api';

type KycStatus = 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';

type SpecialistMeResponse = {
  ok?: boolean;
  profile?: {
    kycStatus?: KycStatus;
    kyc?: {
      dniFrontUrl?: string | null;
      dniBackUrl?: string | null;
      selfieUrl?: string | null;
      rejectionReason?: string | null;
      status?: KycStatus;
    } | null;
  };
};

type KycUploadRes = { ok: true; url: string };

function absoluteUrl(u?: string | null): string | undefined {
  if (!u) return undefined;
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('/')) return `${api.defaults.baseURL?.replace(/\/+$/, '')}${u}`;
  return u;
}

async function compress(uri: string) {
  try {
    const r = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1400 } }], {
      compress: 0.85,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return r.uri;
  } catch {
    return uri;
  }
}

async function pickImage(from: 'camera' | 'gallery') {
  const fn =
    from === 'camera' ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;

  const res = await fn({
    quality: 1,
    allowsMultipleSelection: false,
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
  } as any);

  if (res.canceled || !res.assets?.[0]?.uri) return null;
  return res.assets[0].uri;
}

async function uploadKycFile(localUri: string) {
  const src = await compress(localUri);
  const fd = new FormData();
  fd.append('file', { uri: src, name: 'kyc.jpg', type: 'image/jpeg' } as any);

  const r = await api.post<KycUploadRes>('/specialists/kyc/upload', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  });

  return r.data.url;
}

export default function KycUploadScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [status, setStatus] = useState<KycStatus>('UNVERIFIED');
  const [reason, setReason] = useState<string | null>(null);

  const [dniFrontUrl, setDniFrontUrl] = useState<string | null>(null);
  const [dniBackUrl, setDniBackUrl] = useState<string | null>(null);
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);

  // modal picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const [target, setTarget] = useState<'front' | 'back' | 'selfie' | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get<SpecialistMeResponse>('/specialists/me', {
        headers: { 'Cache-Control': 'no-cache' },
      });

      const p = data?.profile ?? (data as any);
      const kycStatus: KycStatus = p?.kycStatus ?? 'UNVERIFIED';
      setStatus(kycStatus);

      const kyc = p?.kyc ?? null;
      setReason(kyc?.rejectionReason ?? null);

      setDniFrontUrl(kyc?.dniFrontUrl ?? null);
      setDniBackUrl(kyc?.dniBackUrl ?? null);
      setSelfieUrl(kyc?.selfieUrl ?? null);
    } catch (e: any) {
      if (__DEV__) console.log('[KycUploadScreen] load error', e?.response?.data ?? e);
      Alert.alert('Ups', 'No pudimos cargar tu documentación.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const frontSrc = useMemo(() => {
    const u = absoluteUrl(dniFrontUrl);
    return u ? { uri: u } : null;
  }, [dniFrontUrl]);

  const backSrc = useMemo(() => {
    const u = absoluteUrl(dniBackUrl);
    return u ? { uri: u } : null;
  }, [dniBackUrl]);

  const selfieSrc = useMemo(() => {
    const u = absoluteUrl(selfieUrl);
    return u ? { uri: u } : null;
  }, [selfieUrl]);

  const missing = !dniFrontUrl || !dniBackUrl || !selfieUrl;

  const openPicker = (t: 'front' | 'back' | 'selfie') => {
    setTarget(t);
    setPickerOpen(true);
  };

  const setUrlForTarget = (url: string) => {
    if (target === 'front') setDniFrontUrl(url);
    if (target === 'back') setDniBackUrl(url);
    if (target === 'selfie') setSelfieUrl(url);
  };

  const doPick = async (from: 'camera' | 'gallery') => {
    try {
      setPickerOpen(false);
      if (!target) return;

      const local = await pickImage(from);
      if (!local) return;

      setSaving(true);
      const uploadedUrl = await uploadKycFile(local);
      setUrlForTarget(uploadedUrl);
    } catch (e: any) {
      const err = e?.response?.data?.error;
      if (err === 'low_quality')
        Alert.alert('Imagen muy chica', 'Probá con una foto más nítida (mínimo 800×600).');
      else if (err === 'unsupported_type') Alert.alert('Formato no soportado', 'Usá JPG/PNG/WebP.');
      else Alert.alert('Ups', 'No se pudo subir la imagen.');
    } finally {
      setSaving(false);
      setTarget(null);
    }
  };

  const saveKyc = async () => {
    try {
      if (!dniFrontUrl || !dniBackUrl || !selfieUrl) {
        return Alert.alert('Faltan archivos', 'Subí DNI frente, DNI dorso y selfie.');
      }
      setSaving(true);

      // ✅ Ajustá si tu backend usa otro endpoint para guardar/reenviar KYC
      await api.post('/specialists/kyc/submit', {
        dniFrontUrl,
        dniBackUrl,
        selfieUrl,
      });

      Alert.alert('Listo', 'Tu documentación fue actualizada.');
      nav.goBack();
    } catch (e: any) {
      if (__DEV__) console.log('[KycUploadScreen] save error', e?.response?.data ?? e);
      Alert.alert('Ups', 'No pudimos guardar tu documentación.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }} />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1, paddingTop: insets.top + 6 }}>
        <View style={styles.header}>
          <Pressable onPress={() => nav.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color="#E9FEFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Envío de documentación</Text>
          <View style={{ width: 34 }} />
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 30 + insets.bottom }}
          showsVerticalScrollIndicator={false}
        >
          {status === 'REJECTED' && reason ? (
            <View style={styles.reasonBox}>
              <Text style={styles.reasonTitle}>Motivo del rechazo</Text>
              <Text style={styles.reasonText}>{reason}</Text>
            </View>
          ) : null}

          <DocBox
            title="DNI (frente)"
            subtitle={dniFrontUrl ? 'Subido ✅' : 'Falta subir'}
            img={frontSrc}
            onPress={() => openPicker('front')}
          />

          <DocBox
            title="DNI (dorso)"
            subtitle={dniBackUrl ? 'Subido ✅' : 'Falta subir'}
            img={backSrc}
            onPress={() => openPicker('back')}
          />

          <DocBox
            title="Selfie"
            subtitle={selfieUrl ? 'Subida ✅' : 'Falta subir'}
            img={selfieSrc}
            onPress={() => openPicker('selfie')}
          />

          <Pressable
            onPress={saveKyc}
            disabled={saving || missing}
            style={[styles.btn, (saving || missing) && { opacity: 0.6 }]}
          >
            <Text style={styles.btnT}>
              {saving ? 'Guardando…' : missing ? 'Completá los 3 archivos' : 'Guardar / Reenviar'}
            </Text>
          </Pressable>

          <Text style={styles.hint}>
            Tip: tocá un documento para elegir de galería. Podés mantener presionado para usar
            cámara (si querés lo agregamos, ahora lo dejamos simple).
          </Text>
        </ScrollView>
      </SafeAreaView>

      <Modal
        transparent
        visible={pickerOpen}
        animationType="fade"
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable style={styles.modalBG} onPress={() => setPickerOpen(false)}>
          <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
            <Pressable style={styles.modalBtn} onPress={() => doPick('camera')}>
              <Ionicons name="camera" size={20} color="#0A5B63" />
              <Text style={styles.modalBtnT}>Sacar foto</Text>
            </Pressable>
            <Pressable style={styles.modalBtn} onPress={() => doPick('gallery')}>
              <Ionicons name="image" size={20} color="#0A5B63" />
              <Text style={styles.modalBtnT}>Elegir de galería</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </LinearGradient>
  );
}

function DocBox({
  title,
  subtitle,
  img,
  onPress,
}: {
  title: string;
  subtitle: string;
  img: { uri: string } | null;
  onPress: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.muted}>{subtitle}</Text>
        </View>

        <Pressable onPress={onPress} style={styles.smallBtn}>
          <Text style={styles.smallBtnT}>{img ? 'Reemplazar' : 'Subir'}</Text>
        </Pressable>
      </View>

      <View style={styles.previewWrap}>
        {img ? (
          <Image source={img} style={styles.previewImg} resizeMode="cover" />
        ) : (
          <Text style={styles.placeholder}>Sin archivo</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'center' },
  backBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, color: '#E9FEFF', fontSize: 18, fontWeight: '800', textAlign: 'center' },

  card: {
    backgroundColor: 'rgba(0, 35, 40, 0.28)',
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  },
  cardTitle: { color: '#E9FEFF', fontWeight: '900', fontSize: 15 },
  muted: { color: '#9ec9cd', marginTop: 4 },

  previewWrap: {
    height: 160,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginTop: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewImg: { width: '100%', height: '100%' },
  placeholder: { color: '#9ec9cd', fontWeight: '700' },

  btn: {
    height: 48,
    borderRadius: 14,
    backgroundColor: '#E9FEFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  btnT: { color: '#0A5B63', fontWeight: '900' },

  smallBtn: {
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#E9FEFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallBtnT: { color: '#0A5B63', fontWeight: '900' },

  hint: { color: '#9ec9cd', marginTop: 10, fontSize: 12 },

  reasonBox: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  reasonTitle: { color: '#E9FEFF', fontWeight: '900', marginBottom: 6 },
  reasonText: { color: '#E9FEFF' },

  modalBG: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: { backgroundColor: '#E9FEFF', borderRadius: 16, padding: 16, minWidth: 260 },
  modalBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  modalBtnT: { color: '#0A5B63', fontWeight: '800' },
});
