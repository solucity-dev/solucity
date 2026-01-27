// apps/mobile/src/screens/RegisterSpecialist.tsx
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Image,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthProvider';
import { api } from '../lib/api';
import { registerForPush } from '../notifications/registerForPush';

type Step = 1 | 2 | 3;
type KycUploadRes = { ok: true; url: string };
type Category = { id: string; name: string; slug: string };
type CategoryGroup = { id: string; name: string; slug: string; categories: Category[] };
type CategoriesRes = { ok: true; groups: CategoryGroup[] };

export default function RegisterSpecialist() {
  const insets = useSafeAreaInsets();

  const { setMode, login } = useAuth();

  const [step, setStep] = useState<Step>(1);

  // ===== UI: progreso animado =====
  const progressAnim = useRef(new Animated.Value(1 / 3)).current;

  useEffect(() => {
    const target = step / 3;
    Animated.timing(progressAnim, {
      toValue: target,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [step, progressAnim]);

  // ===== PASO 1: identidad + OTP ===========================================
  const [email, setEmail] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');

  // ✅ ojitos
  const [showPass1, setShowPass1] = useState(false);
  const [showPass2, setShowPass2] = useState(false);

  const [loadingStart, setLoadingStart] = useState(false);
  const [loadingVerify, setLoadingVerify] = useState(false);

  // token temporal que nos da /auth/register/verify
  const [pendingToken, setPendingToken] = useState<string | null>(null);

  // ✅ checks paso 1
  const step1Checks = useMemo(() => {
    const checks = [
      { ok: email.trim().includes('@'), label: 'Email' },
      { ok: otpSent, label: 'Código enviado' },
      { ok: otp.trim().length === 6, label: 'Código 6 dígitos' },
      { ok: name.trim().length >= 2, label: 'Nombre' },
      { ok: password.length >= 8, label: 'Contraseña (8+)' },
      { ok: password.length >= 8 && password === password2, label: 'Confirmación' },
    ];
    return checks;
  }, [email, otpSent, otp, name, password, password2]);

  const sendCode = async () => {
    if (loadingStart) return;
    try {
      Keyboard.dismiss();
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
      if (e?.response?.status === 429 || err === 'too_many_requests') {
        return Alert.alert('Demasiados intentos', 'Esperá unos minutos y reintentá.');
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
      if (!password || password.length < 8)
        return Alert.alert('Contraseña inválida', 'Mínimo 8 caracteres.');
      if (password !== password2) return Alert.alert('Las contraseñas no coinciden');

      const r = await api.post('/auth/register/verify', {
        email: email.trim().toLowerCase(),
        code: otp.trim(),
        name: name.trim(),
        surname: surname.trim() ? surname.trim() : undefined,
        phone: phone.trim() ? phone.trim() : undefined,
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
      else if (e?.response?.status === 429 || err === 'otp_blocked')
        Alert.alert('Demasiados intentos', 'Esperá unos minutos y pedí un nuevo código.');
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

  // ✅ checks paso 2
  const step2Checks = useMemo(
    () => [
      { ok: !!dniFront, label: 'DNI frente' },
      { ok: !!dniBack, label: 'DNI dorso' },
      { ok: !!selfie, label: 'Selfie' },
    ],
    [dniFront, dniBack, selfie],
  );

  const step2Complete = !!dniFront && !!dniBack && !!selfie;

  // ✅ hint suave paso 2 (exactamente qué falta)
  const [step2Hint, setStep2Hint] = useState<string | null>(null);

  useEffect(() => {
    if (step2Complete) setStep2Hint(null);
  }, [step2Complete]);

  const pickFrom = async (
    from: 'camera' | 'gallery',
    setter: (uri: string) => void,
    opts?: { cameraType?: ImagePicker.CameraType },
  ) => {
    try {
      if (from === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          return Alert.alert('Permiso requerido', 'Necesitamos acceso a la cámara.');
        }
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          return Alert.alert('Permiso requerido', 'Necesitamos acceso a tus fotos.');
        }
      }

      const fn =
        from === 'camera' ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;

      const res = await fn({
        quality: 1,
        allowsMultipleSelection: false,
        // ✅ evita warning deprecado
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        cameraType: opts?.cameraType,
      });

      if (!res.canceled && res.assets?.[0]?.uri) setter(res.assets[0].uri);
    } catch (e) {
      console.log('[pickFrom]', e);
      Alert.alert('Error', 'No se pudo abrir la cámara o la galería.');
    }
  };

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
      timeout: 60000,
    });

    return r.data.url;
  };

  const [kycUrls, setKycUrls] = useState<{
    dniFrontUrl: string;
    dniBackUrl: string;
    selfieUrl: string;
  } | null>(null);

  const continueToStep3 = async () => {
    try {
      if (!dniFront || !dniBack || !selfie) {
        return Alert.alert('Faltan fotos', 'Subí frente, dorso y selfie.');
      }
      setLoadingUpload(true);

      const [f, b, s] = await Promise.all([upload(dniFront), upload(dniBack), upload(selfie)]);
      setKycUrls({ dniFrontUrl: f, dniBackUrl: b, selfieUrl: s });

      // opcional pro: si existe este endpoint, deja el KYC en PENDING ya mismo.
      // (si no existe, ignoramos silenciosamente)
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

  // ===== PASO 3: rubros (sin matrícula/título en registro) ==================
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [finalizing, setFinalizing] = useState(false);

  // ✅ hint suave paso 3
  const [step3Hint, setStep3Hint] = useState<string | null>(null);

  useEffect(() => {
    if (selectedSlugs.length > 0) setStep3Hint(null);
  }, [selectedSlugs.length]);

  // ✅ checks paso 3
  const step3Checks = useMemo(
    () => [{ ok: selectedSlugs.length > 0, label: 'Rubros' }],
    [selectedSlugs.length],
  );

  useEffect(() => {
    const load = async () => {
      try {
        const r = await api.get<CategoriesRes>('/categories');
        setGroups(r.data.groups ?? []);
      } catch (e: any) {
        console.log('[categories]', e?.response?.data || e.message);
        setGroups([]);
      }
    };

    load();
  }, []);

  const flatCategories = useMemo(() => {
    return (groups ?? []).flatMap((g) =>
      (g.categories ?? []).map((c) => ({ ...c, group: g.slug })),
    );
  }, [groups]);

  const toggleSlug = (slug: string) => {
    setSelectedSlugs((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  };

  /**
   * ✅ MÁS SEGURO:
   * - registramos el push token "a demanda" después del login
   * - esto evita depender del timing del NotificationsProvider
   */
  const ensurePushTokenRegistered = async () => {
    try {
      const pushToken = await registerForPush();
      if (!pushToken) return;

      await api.post(
        '/notifications/push-token',
        { token: pushToken, platform: Platform.OS },
        { headers: { ...tempAuthHeaders(), 'Cache-Control': 'no-cache' } },
      );
    } catch {
      // no frenamos el flujo por esto
    }
  };

  const finalize = async () => {
    if (finalizing) return;
    try {
      Keyboard.dismiss();

      if (!pendingToken)
        return Alert.alert('Error', 'Sesión pendiente perdida. Reintentá el registro.');
      if (!kycUrls) return Alert.alert('Error', 'Faltan las imágenes de identidad.');

      if (selectedSlugs.length === 0) {
        setStep3Hint('Elegí al menos un rubro para continuar.');
        return Alert.alert('Falta un paso', 'Elegí al menos un rubro para poder finalizar.');
      }

      setFinalizing(true);

      const r2 = await api.post(
        '/specialists/register',
        { specialties: selectedSlugs, bio: '', kyc: kycUrls },
        { headers: { ...tempAuthHeaders() } },
      );

      const newToken = r2.data?.token as string | undefined;
      const tokenToUse = newToken ?? pendingToken;

      // ✅ 1) login real + modo especialista
      await login(tokenToUse);
      await setMode('specialist');

      // ✅ 2) aseguramos push token YA
      await ensurePushTokenRegistered();

      // ✅ 3) re-disparo submit (para que dispare push "PENDING" sí o sí)
      try {
        await api.post('/specialists/kyc/submit', kycUrls, { headers: { ...tempAuthHeaders() } });
      } catch {}
    } catch (e: any) {
      console.log('[specialists/register]', e?.response?.data || e.message);
      Alert.alert('Error', e?.response?.data?.error ?? 'No se pudo finalizar el registro.');
    } finally {
      setFinalizing(false);
    }
  };

  const checksForStep = step === 1 ? step1Checks : step === 2 ? step2Checks : step3Checks;

  // ===== UI ================================================================
  return (
    <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1 }}>
      <KeyboardAwareScrollView
        enableOnAndroid
        extraScrollHeight={18}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          padding: 16,
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 140,
        }}
      >
        <Text style={s.h1}>Registro especialista</Text>

        {/* ✅ progreso animado */}
        <View style={{ marginTop: 8, marginBottom: 10 }}>
          <View style={s.progressTrack}>
            <Animated.View
              style={[
                s.progressFill,
                {
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>

          <View style={s.progressRow}>
            <Text style={s.h2}>Paso {step} de 3</Text>
            <View style={s.stepDots}>
              <Dot active={step >= 1} />
              <Dot active={step >= 2} />
              <Dot active={step >= 3} />
            </View>
          </View>
        </View>

        {/* ✅ mini checks */}
        <View style={s.checksWrap}>
          {checksForStep.map((c) => (
            <MiniCheck key={c.label} ok={c.ok} label={c.label} />
          ))}
        </View>

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
              textContentType="username"
              autoComplete="email"
              editable={!loadingStart && !loadingVerify}
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
                  onChangeText={(t) => setOtp(t.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••••"
                  placeholderTextColor="#cfe"
                  returnKeyType="next"
                  textContentType="oneTimeCode"
                  editable={!loadingVerify}
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
                <PasswordInputRow
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Mínimo 8 caracteres"
                  visible={showPass1}
                  onToggle={() => setShowPass1((v) => !v)}
                  onSubmitEditing={() => {}}
                  returnKeyType="next"
                  textContentType="newPassword"
                  autoComplete="new-password"
                />

                <Text style={s.label}>Confirmar contraseña</Text>
                <PasswordInputRow
                  value={password2}
                  onChangeText={setPassword2}
                  placeholder="Repetí la contraseña"
                  visible={showPass2}
                  onToggle={() => setShowPass2((v) => !v)}
                  onSubmitEditing={verifyAndContinue}
                  returnKeyType="done"
                  textContentType="newPassword"
                  autoComplete="new-password"
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
            <PickBoxKyc
              label="DNI frente"
              mode="dni"
              uri={dniFront}
              onPickCamera={() =>
                pickFrom('camera', setDniFront, { cameraType: ImagePicker.CameraType.back })
              }
              onPickGallery={() => pickFrom('gallery', setDniFront)}
              onClear={() => setDniFront(null)}
            />

            <PickBoxKyc
              label="DNI dorso"
              mode="dni"
              uri={dniBack}
              onPickCamera={() =>
                pickFrom('camera', setDniBack, { cameraType: ImagePicker.CameraType.back })
              }
              onPickGallery={() => pickFrom('gallery', setDniBack)}
              onClear={() => setDniBack(null)}
            />

            <PickBoxKyc
              label="Selfie"
              mode="selfie"
              uri={selfie}
              onPickCamera={() =>
                pickFrom('camera', setSelfie, { cameraType: ImagePicker.CameraType.front })
              }
              onPickGallery={() => pickFrom('gallery', setSelfie)}
              onClear={() => setSelfie(null)}
            />

            {step2Hint ? <Text style={s.hint}>{step2Hint}</Text> : null}

            <Pressable
              onPress={() => {
                if (!step2Complete) {
                  setStep2Hint('Subí DNI frente, dorso y selfie para continuar.');
                  return;
                }
                continueToStep3();
              }}
              disabled={loadingUpload || !step2Complete}
              style={[s.btn, (loadingUpload || !step2Complete) && s.disabled]}
            >
              <Text style={s.btnT}>
                {loadingUpload
                  ? 'Subiendo…'
                  : !step2Complete
                    ? 'Completá las fotos'
                    : 'Continuar ▸ Paso 3'}
              </Text>
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

            {/* ✅ Aviso simple: documentación se sube después desde Home */}
            <View style={s.infoBox}>
              <Text style={s.infoText}>
                La documentación (matrícula/título) se carga después, desde tu Inicio como
                especialista, en cada rubro.
              </Text>
            </View>

            {step3Hint ? <Text style={s.hint}>{step3Hint}</Text> : null}

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

/** ✅ Password input con ojito, mantiene mismo look del s.input */
type PasswordRowProps = {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  visible: boolean;
  onToggle: () => void;
  returnKeyType?: 'done' | 'next' | 'send';
  onSubmitEditing?: () => void;

  // ✅ extras (autofill)
  textContentType?: React.ComponentProps<typeof TextInput>['textContentType'];
  autoComplete?: React.ComponentProps<typeof TextInput>['autoComplete'];

  // ✅ hardening
  editable?: boolean;
};

function PasswordInputRow(props: PasswordRowProps) {
  const { visible, onToggle, ...rest } = props;
  return (
    <View style={pwd.wrap}>
      <TextInput
        {...rest}
        style={pwd.input}
        secureTextEntry={!visible}
        placeholderTextColor="#cfe"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Pressable
        onPress={onToggle}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        style={({ pressed }) => [pwd.eyeBtn, pressed && { opacity: 0.75 }]}
      >
        <Text style={pwd.eyeText}>{visible ? '🙈' : '👁️'}</Text>
      </Pressable>
    </View>
  );
}

/** UI: punto de pasos */
function Dot({ active }: { active: boolean }) {
  return <View style={[s.dot, active && s.dotActive]} />;
}

/** UI: mini check */
function MiniCheck({ ok, label }: { ok: boolean; label: string }) {
  return (
    <View style={s.checkItem}>
      <View style={[s.checkIcon, ok ? s.checkIconOk : s.checkIconNo]}>
        <Text style={[s.checkIconT, ok ? { color: '#0B6B76' } : { color: '#fff' }]}>
          {ok ? '✓' : '·'}
        </Text>
      </View>
      <Text style={s.checkLabel}>{label}</Text>
    </View>
  );
}

/** PickBox KYC mejorado (DNI: cámara/galería, Selfie: cámara directa) */
function PickBoxKyc({
  uri,
  label,
  mode,
  onPickCamera,
  onPickGallery,
  onClear,
}: {
  uri: string | null;
  label: string;
  mode: 'dni' | 'selfie';
  onPickCamera: () => void;
  onPickGallery: () => void;
  onClear?: () => void;
}) {
  if (!uri) {
    return (
      <View style={s.pickCard}>
        <View style={s.pickHeader}>
          <Text style={s.pickTitle}>{label}</Text>
          <View style={[s.badge, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
            <Text style={s.badgeT}>Pendiente</Text>
          </View>
        </View>

        <View style={s.pickButtonsRow}>
          {mode === 'dni' ? (
            <>
              <Pressable onPress={onPickGallery} style={[s.smallBtn, s.smallBtnSoft]}>
                <Text style={s.smallBtnT}>🖼️ Galería</Text>
              </Pressable>
              <Pressable onPress={onPickCamera} style={[s.smallBtn, s.smallBtnSoft]}>
                <Text style={s.smallBtnT}>📷 Cámara</Text>
              </Pressable>
            </>
          ) : (
            <Pressable onPress={onPickCamera} style={[s.smallBtn, s.smallBtnStrong]}>
              <Text style={[s.smallBtnT, { color: '#0B6B76' }]}>🤳 Sacar selfie</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={s.pickCard}>
      <View style={s.pickHeader}>
        <Text style={s.pickTitle}>{label}</Text>
        <View style={[s.badge, { backgroundColor: 'rgba(255,255,255,0.96)' }]}>
          <Text style={[s.badgeT, { color: '#0B6B76' }]}>✓ Listo</Text>
        </View>
      </View>

      <Image source={{ uri }} style={s.previewBig} />

      <View style={s.previewActionsRow}>
        {mode === 'dni' ? (
          <>
            <Pressable onPress={onPickGallery} style={[s.smallBtn, s.smallBtnSoft]}>
              <Text style={s.smallBtnT}>🖼️ Cambiar</Text>
            </Pressable>
            <Pressable onPress={onPickCamera} style={[s.smallBtn, s.smallBtnSoft]}>
              <Text style={s.smallBtnT}>📷 Otra</Text>
            </Pressable>
          </>
        ) : (
          <Pressable onPress={onPickCamera} style={[s.smallBtn, s.smallBtnSoft]}>
            <Text style={s.smallBtnT}>🤳 Otra selfie</Text>
          </Pressable>
        )}

        {!!onClear && (
          <Pressable onPress={onClear} style={[s.smallBtn, s.smallBtnDanger]}>
            <Text style={s.smallBtnT}>✕</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const pwd = StyleSheet.create({
  wrap: {
    height: 46,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    paddingRight: 6,
  },
  input: {
    flex: 1,
    color: '#fff',
    height: '100%',
    paddingRight: 10,
  },
  eyeBtn: {
    height: 36,
    minWidth: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeText: { fontSize: 18, lineHeight: 18 },
});

const s = StyleSheet.create({
  h1: { color: '#fff', fontSize: 28, fontWeight: '800' },
  h2: { color: 'rgba(233,254,255,0.92)' },

  // progreso
  progressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  progressFill: {
    height: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.96)',
  },
  progressRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepDots: { flexDirection: 'row', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.25)' },
  dotActive: { backgroundColor: 'rgba(255,255,255,0.96)' },

  // checks
  checksWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    height: 34,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  checkIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkIconOk: { backgroundColor: 'rgba(255,255,255,0.96)' },
  checkIconNo: { backgroundColor: 'rgba(255,255,255,0.18)' },
  checkIconT: { fontWeight: '900' },
  checkLabel: { color: 'rgba(233,254,255,0.92)', fontWeight: '800', fontSize: 12 },

  // hints
  hint: {
    marginTop: 6,
    color: 'rgba(233,254,255,0.92)',
    fontWeight: '900',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },

  // card base
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

  // chips
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

  // badges
  badge: {
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeT: { color: 'rgba(233,254,255,0.92)', fontWeight: '900' },

  // pick cards (kyc)
  pickCard: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 16,
    padding: 12,
    gap: 10,
  },
  pickHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pickTitle: { color: '#fff', fontWeight: '900' },
  pickButtonsRow: { flexDirection: 'row', gap: 10 },
  previewBig: { width: '100%', height: 170, borderRadius: 14 },

  previewActionsRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  smallBtn: {
    flex: 1,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallBtnSoft: { backgroundColor: 'rgba(255,255,255,0.12)' },
  smallBtnStrong: { backgroundColor: 'rgba(255,255,255,0.96)' },
  smallBtnDanger: { maxWidth: 46, backgroundColor: 'rgba(255,255,255,0.12)' },
  smallBtnT: { color: '#e9feff', fontWeight: '900' },

  // ✅ info box (paso 3)
  infoBox: {
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  infoText: {
    color: 'rgba(233,254,255,0.92)',
    fontWeight: '800',
    lineHeight: 18,
  },
});
