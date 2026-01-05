// apps/mobile/src/screens/RegisterSpecialist.tsx
import { useNavigation } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthProvider';
import { api } from '../lib/api';

type Step = 1 | 2 | 3;
type KycUploadRes = { ok: true; url: string };
type Category = { id: string; name: string; slug: string };
type CategoryGroup = { id: string; name: string; slug: string; categories: Category[] };

export default function RegisterSpecialist() {
  const insets = useSafeAreaInsets();
  useNavigation(); // 🔧 evitamos warning "nav never used" sin romper nada
  const { setMode, login } = useAuth();

  const [step, setStep] = useState<Step>(1);

  // ===== PASO 1: identidad + OTP ===========================================
  const [email, setEmail] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');

  const [loadingStart, setLoadingStart] = useState(false);
  const [loadingVerify, setLoadingVerify] = useState(false);

  // token temporal que nos da /auth/register/verify
  const [pendingToken, setPendingToken] = useState<string | null>(null);

  const sendCode = async () => {
    if (loadingStart) return;
    try {
      Keyboard.dismiss(); // ✅ para que no haya que tocar 2 veces
      setLoadingStart(true);

      const trimmed = email.trim().toLowerCase();
      if (!trimmed.includes('@')) return Alert.alert('Email inválido', 'Ingresá un correo válido.');

      await api.post('/auth/register/start', { email: trimmed });
      setOtpSent(true);
      Alert.alert('Código enviado', 'Revisá tu correo y pegá el código.');
    } catch (e: any) {
      const err = e?.response?.data?.error;
      if (e?.response?.status === 409 || err === 'email_in_use') {
        return Alert.alert(
          'Correo ya registrado',
          'Ese correo ya está en uso. Probá iniciar sesión.',
        );
      }
      Alert.alert('Error', 'No se pudo enviar el código.');
    } finally {
      setLoadingStart(false);
    }
  };

  const verifyAndContinue = async () => {
    if (loadingVerify || pendingToken) return;
    try {
      Keyboard.dismiss();
      setLoadingVerify(true);

      if (!otp || otp.length < 6) return Alert.alert('Código inválido', 'Ingresá los 6 dígitos.');
      if (!name.trim()) return Alert.alert('Falta tu nombre', 'Ingresá tu nombre.');
      // ✅ Backend pide min 8 (tu zod)
      if (!password || password.length < 8)
        return Alert.alert('Contraseña inválida', 'Mínimo 8 caracteres.');
      if (password !== password2) return Alert.alert('Las contraseñas no coinciden');

      const r = await api.post('/auth/register/verify', {
        email: email.trim().toLowerCase(),
        code: otp,
        name,
        surname: surname || undefined,
        phone: phone || undefined,
        password,
        role: 'SPECIALIST',
      });

      const tok = r.data?.token as string | undefined;
      if (!tok) return Alert.alert('Error', 'No se recibió token.');
      setPendingToken(tok);

      setStep(2);
    } catch (e: any) {
      const err = e?.response?.data?.error;
      if (err === 'otp_already_used') Alert.alert('Código usado', 'Generá uno nuevo y reintentá.');
      else if (err === 'otp_expired') Alert.alert('Código vencido', 'Pedí un nuevo código.');
      else if (err === 'otp_invalid' || err === 'otp_not_found')
        Alert.alert('Código incorrecto', 'Verificá los 6 dígitos.');
      else if (e?.response?.status === 409)
        Alert.alert('Correo ya registrado', 'Ese correo ya está en uso. Probá iniciar sesión.');
      else if (err === 'weak_password')
        Alert.alert('Contraseña débil', 'Usá una contraseña de al menos 8 caracteres.');
      else Alert.alert('Error', 'No se pudo verificar el código.');
    } finally {
      setLoadingVerify(false);
    }
  };

  // ===== PASO 2: KYC (dni frente/dorso/selfie) =============================
  const [dniFront, setDniFront] = useState<string | null>(null);
  const [dniBack, setDniBack] = useState<string | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [loadingUpload, setLoadingUpload] = useState(false);

  const pickFrom = async (from: 'camera' | 'gallery', setter: (uri: string) => void) => {
    const fn =
      from === 'camera' ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;

    const res = await fn({
      quality: 1,
      allowsMultipleSelection: false,
      exif: true,
      // ✅ evita warning deprecated
      mediaTypes: ['images'],
    } as any);

    if (!res.canceled && res.assets?.[0]?.uri) setter(res.assets[0].uri);
  };

  // ✅ picker para PDF/imagen desde archivos (solo para matrícula/título)
  const pickDocument = async (setter: (uri: string) => void) => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (!res.canceled && res.assets?.[0]?.uri) {
        setter(res.assets[0].uri);
      }
    } catch (e) {
      console.log('[document picker]', e);
      Alert.alert('Error', 'No se pudo abrir el selector de documentos.');
    }
  };

  const isPdfUri = (uri: string) => uri.toLowerCase().includes('.pdf');

  // Compresión previa (ayuda en Android) - SOLO imágenes
  const compress = async (uri: string) => {
    try {
      const r = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1400 } }], {
        compress: 0.85,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      return r.uri;
    } catch {
      return uri;
    }
  };

  // headers con token temporal
  const tempAuthHeaders = () => (pendingToken ? { Authorization: `Bearer ${pendingToken}` } : {});

  // Upload genérico KYC (solo imágenes)
  const upload = async (uri: string): Promise<string> => {
    if (!pendingToken) throw new Error('missing_temp_token');

    const src = await compress(uri);
    const fd = new FormData();
    fd.append('file', { uri: src, name: 'kyc.jpg', type: 'image/jpeg' } as any);

    const r = await api.post<KycUploadRes>('/specialists/kyc/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data', ...tempAuthHeaders() },
      timeout: 60000, // 60s para uploads pesados
    });

    return r.data.url;
  };

  const continueToStep3 = async () => {
    try {
      if (!dniFront || !dniBack || !selfie) {
        return Alert.alert('Faltan fotos', 'Subí frente, dorso y selfie.');
      }
      setLoadingUpload(true);

      const [f, b, s] = await Promise.all([upload(dniFront), upload(dniBack), upload(selfie)]);
      setKycUrls({ dniFrontUrl: f, dniBackUrl: b, selfieUrl: s });

      // ✅ opcional pro: si existe este endpoint, deja el KYC en PENDING ya mismo.
      // No rompe nada si falla (catch vacío).
      try {
        await api.post(
          '/specialists/kyc/submit',
          { dniFrontUrl: f, dniBackUrl: b, selfieUrl: s },
          { headers: { ...tempAuthHeaders() } },
        );
      } catch {}

      setStep(3);
    } catch (e: any) {
      const err = e?.response?.data?.error;
      if (e?.response?.status === 401) Alert.alert('Sesión', 'Volvé a verificar tu email.');
      else if (err === 'low_quality')
        Alert.alert('Imagen muy pequeña', 'Elegí una foto más nítida (mínimo 800×600).');
      else if (err === 'unsupported_type') Alert.alert('Formato no soportado', 'Usá JPG/PNG/WebP.');
      else Alert.alert('Error', 'No se pudo subir la imagen.');
    } finally {
      setLoadingUpload(false);
    }
  };

  const [kycUrls, setKycUrls] = useState<{
    dniFrontUrl: string;
    dniBackUrl: string;
    selfieUrl: string;
  } | null>(null);

  // ===== PASO 3: rubros + matrícula opcional ===============================
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [licenseFile, setLicenseFile] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await api.get<CategoryGroup[]>('/categories');
        setGroups(r.data || []);
      } catch (e: any) {
        console.log('[categories]', e?.response?.data || e.message);
      }
    };
    load();
  }, []);

  const flatCategories = useMemo(
    () => groups.flatMap((g) => g.categories.map((c) => ({ ...c, group: g.slug }))),
    [groups],
  );

  const toggleSlug = (slug: string) => {
    setSelectedSlugs((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  };

  // ✅ Matrícula/Título: ahora soporta imagen o PDF
  const uploadLicense = async (uri: string): Promise<string> => {
    if (!pendingToken) throw new Error('missing_temp_token');

    const pdf = isPdfUri(uri);
    const src = pdf ? uri : await compress(uri);

    const fd = new FormData();

    if (pdf) {
      fd.append('file', { uri: src, name: 'matricula.pdf', type: 'application/pdf' } as any);
    } else {
      fd.append('file', { uri: src, name: 'matricula.jpg', type: 'image/jpeg' } as any);
    }

    const r = await api.post<KycUploadRes>('/specialists/kyc/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data', ...tempAuthHeaders() },
      timeout: 60000,
    });

    return r.data.url;
  };

  const finalize = async () => {
    if (finalizing) return; // ✅ anti doble tap
    try {
      Keyboard.dismiss();

      if (!pendingToken)
        return Alert.alert('Error', 'Sesión pendiente perdida. Reintentá el registro.');
      if (!kycUrls) return Alert.alert('Error', 'Faltan las imágenes de identidad.');
      if (selectedSlugs.length === 0) return Alert.alert('Elegí al menos un rubro.');

      setFinalizing(true);

      // ✅ subimos matrícula opcional (PDF o imagen) sin romper flujo
      if (licenseFile) {
        try {
          await uploadLicense(licenseFile);
        } catch (e) {
          console.log('[license upload]', e);
        }
      }

      await api.post(
        '/specialists/register',
        {
          specialties: selectedSlugs,
          bio: '',
          kyc: kycUrls,
        },
        { headers: { ...tempAuthHeaders() } },
      );

      // ✅ modo (preferencia UI) y login real (AuthProvider)
      await setMode('specialist');
      await login(pendingToken);
    } catch (e: any) {
      console.log('[specialists/register]', e?.response?.data || e.message);
      Alert.alert('Error', e?.response?.data?.error ?? 'No se pudo finalizar el registro.');
    } finally {
      setFinalizing(false);
    }
  };

  // ===== UI ================================================================
  return (
    <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1, paddingTop: insets.top + 8 }}>
      <KeyboardAwareScrollView
        enableOnAndroid
        extraScrollHeight={18}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          padding: 16,
          // ✅ clave: deja espacio REAL para navbar / gesto + botón final
          paddingBottom: insets.bottom + 140,
        }}
      >
        <Text style={s.h1}>Registro especialista</Text>
        <Text style={s.h2}>Paso {step} de 3</Text>

        {step === 1 && (
          <View style={s.card}>
            <Text style={s.label}>Correo electrónico</Text>
            <TextInput
              style={s.input}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              placeholder="especialista@correo.com"
              placeholderTextColor="#cfe"
              returnKeyType="send"
              onSubmitEditing={sendCode}
            />

            {!otpSent ? (
              <Pressable
                onPress={sendCode}
                disabled={loadingStart}
                style={[s.btn, loadingStart && s.disabled]}
              >
                <Text style={s.btnT}>{loadingStart ? 'Enviando…' : 'Enviar código'}</Text>
              </Pressable>
            ) : (
              <>
                <Text style={s.label}>Código (6 dígitos)</Text>
                <TextInput
                  style={s.input}
                  keyboardType="number-pad"
                  maxLength={6}
                  value={otp}
                  onChangeText={setOtp}
                  placeholder="••••••"
                  placeholderTextColor="#cfe"
                  returnKeyType="next"
                />

                <Text style={s.label}>Nombre</Text>
                <TextInput
                  style={s.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Tu nombre"
                  placeholderTextColor="#cfe"
                  returnKeyType="next"
                />

                <Text style={s.label}>Apellido (opcional)</Text>
                <TextInput
                  style={s.input}
                  value={surname}
                  onChangeText={setSurname}
                  placeholder="Tu apellido"
                  placeholderTextColor="#cfe"
                  returnKeyType="next"
                />

                <Text style={s.label}>Teléfono (opcional)</Text>
                <TextInput
                  style={s.input}
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="+54 11 1234-5678"
                  placeholderTextColor="#cfe"
                  returnKeyType="next"
                />

                <Text style={s.label}>Contraseña</Text>
                <TextInput
                  style={s.input}
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Mínimo 8 caracteres"
                  placeholderTextColor="#cfe"
                  returnKeyType="next"
                />

                <Text style={s.label}>Confirmar contraseña</Text>
                <TextInput
                  style={s.input}
                  secureTextEntry
                  value={password2}
                  onChangeText={setPassword2}
                  placeholder="Repetí la contraseña"
                  placeholderTextColor="#cfe"
                  returnKeyType="done"
                  onSubmitEditing={verifyAndContinue}
                />

                <Pressable
                  onPress={verifyAndContinue}
                  disabled={loadingVerify}
                  style={[s.btn, { marginTop: 8 }, loadingVerify && s.disabled]}
                >
                  <Text style={s.btnT}>
                    {loadingVerify ? 'Verificando…' : 'Continuar ▸ Paso 2'}
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        )}

        {step === 2 && (
          <View style={s.card}>
            <Text style={s.label}>DNI frente</Text>
            <PickBoxKyc
              uri={dniFront}
              onPickCamera={() => pickFrom('camera', setDniFront)}
              onPickGallery={() => pickFrom('gallery', setDniFront)}
            />

            <Text style={s.label}>DNI dorso</Text>
            <PickBoxKyc
              uri={dniBack}
              onPickCamera={() => pickFrom('camera', setDniBack)}
              onPickGallery={() => pickFrom('gallery', setDniBack)}
            />

            <Text style={s.label}>Selfie</Text>
            <PickBoxKyc
              uri={selfie}
              onPickCamera={() => pickFrom('camera', setSelfie)}
              onPickGallery={() => pickFrom('gallery', setSelfie)}
            />

            <Pressable
              onPress={continueToStep3}
              disabled={loadingUpload}
              style={[s.btn, loadingUpload && s.disabled]}
            >
              <Text style={s.btnT}>{loadingUpload ? 'Subiendo…' : 'Continuar ▸ Paso 3'}</Text>
            </Pressable>
          </View>
        )}

        {step === 3 && (
          <View style={s.card}>
            <Text style={s.label}>Seleccioná tus rubros</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {flatCategories.map((c) => {
                const active = selectedSlugs.includes(c.slug);
                return (
                  <Pressable
                    key={c.slug}
                    onPress={() => toggleSlug(c.slug)}
                    style={[s.chip, active && s.chipActive]}
                  >
                    <Text style={[s.chipT, active && s.chipTActive]}>{c.name}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[s.label, { marginTop: 12 }]}>Matrícula/Título (opcional)</Text>

            <PickBoxLicense
              uri={licenseFile}
              onPickCamera={() => pickFrom('camera', setLicenseFile)}
              onPickGallery={() => pickFrom('gallery', setLicenseFile)}
              onPickDocument={() => pickDocument(setLicenseFile)}
            />

            <Pressable
              onPress={finalize}
              disabled={finalizing}
              style={[s.btn, { marginTop: 8 }, finalizing && s.disabled]}
            >
              <Text style={s.btnT}>{finalizing ? 'Finalizando…' : 'Finalizar registro'}</Text>
            </Pressable>
          </View>
        )}
      </KeyboardAwareScrollView>
    </LinearGradient>
  );
}

/** PickBox original para KYC (solo imagen) */
function PickBoxKyc({
  uri,
  onPickCamera,
  onPickGallery,
}: {
  uri: string | null;
  onPickCamera: () => void;
  onPickGallery: () => void;
}) {
  return (
    <Pressable style={s.pick} onPress={onPickGallery} onLongPress={onPickCamera}>
      {uri ? (
        <Image source={{ uri }} style={s.preview} />
      ) : (
        <Text style={{ color: '#cfe' }}>Tomar/ Elegir foto…</Text>
      )}
    </Pressable>
  );
}

/** PickBox para Matrícula/Título: imagen o PDF */
function PickBoxLicense({
  uri,
  onPickCamera,
  onPickGallery,
  onPickDocument,
}: {
  uri: string | null;
  onPickCamera: () => void;
  onPickGallery: () => void;
  onPickDocument: () => void;
}) {
  const isPdf = uri ? uri.toLowerCase().includes('.pdf') : false;

  if (!uri) {
    return (
      <View style={[s.pick, { gap: 10 }]}>
        <Pressable onPress={onPickGallery}>
          <Text style={{ color: '#cfe' }}>🖼️ Elegir imagen (galería)</Text>
        </Pressable>
        <Pressable onPress={onPickCamera}>
          <Text style={{ color: '#cfe' }}>📷 Tomar foto (cámara)</Text>
        </Pressable>
        <Pressable onPress={onPickDocument}>
          <Text style={{ color: '#cfe' }}>📄 Subir documento (PDF)</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={s.pick}>
      {isPdf ? (
        <Text style={{ color: '#fff', fontWeight: '800' }}>📄 Documento seleccionado</Text>
      ) : (
        <Image source={{ uri }} style={s.preview} />
      )}
      <Text style={{ color: '#cfe', marginTop: 8 }}>Tocá para cambiar</Text>
      <Pressable onPress={onPickDocument} style={{ marginTop: 6 }}>
        <Text style={{ color: '#cfe' }}>Elegir otro documento (PDF)</Text>
      </Pressable>
      <Pressable onPress={onPickGallery} style={{ marginTop: 6 }}>
        <Text style={{ color: '#cfe' }}>Elegir otra imagen</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  h1: { color: '#fff', fontSize: 28, fontWeight: '800' },
  h2: { color: 'rgba(233,254,255,0.92)', marginBottom: 8 },
  card: { backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 16, padding: 14, gap: 10 },
  label: { color: '#fff', fontWeight: '700' },
  input: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    color: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
  },
  btn: {
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  btnT: { color: '#0B6B76', fontWeight: '800' },
  disabled: { opacity: 0.5 },
  pick: {
    minHeight: 140,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preview: { width: '100%', height: 140, borderRadius: 12 },
  chip: {
    paddingHorizontal: 10,
    height: 34,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: 'rgba(255,255,255,0.96)' },
  chipT: { color: '#e9feff', fontWeight: '700' },
  chipTActive: { color: '#0B6B76' },
});
