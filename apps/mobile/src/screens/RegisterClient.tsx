// apps/mobile/src/screens/RegisterClient.tsx
import { useNavigation } from '@react-navigation/native';
import axios from 'axios';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthProvider';
import { api } from '../lib/api';

type Step = 1 | 2 | 3;

type ZodDetails = {
  fieldErrors?: Partial<Record<string, string[]>>;
  formErrors?: string[];
};
type ApiError = { ok?: boolean; error?: string; details?: ZodDetails };
type VerifyOk = {
  ok: true;
  user: { id: string; email: string; role: string; name?: string | null; phone?: string | null };
  token: string;
};

function msgFromZod(details?: ZodDetails): string | null {
  const f = details?.fieldErrors ?? {};
  const passErr = f.password?.join(' ') ?? '';
  if (passErr && /at least\s*8|mín|minimum|8/i.test(passErr))
    return 'La contraseña es muy corta (mínimo 8 caracteres).';
  const codeErr = f.code?.join(' ') ?? '';
  if (codeErr && /(6.*digits?|regex|formato)/i.test(codeErr))
    return 'El código debe tener 6 dígitos.';
  const emailErr = f.email?.join(' ') ?? '';
  if (emailErr) return 'Ingresá un e-mail válido.';
  const nameErr = f.name?.join(' ') ?? '';
  if (nameErr) return 'El nombre es demasiado corto.';
  const phoneErr = f.phone?.join(' ') ?? '';
  if (phoneErr) return 'El teléfono no tiene un formato válido.';
  if (details?.formErrors?.length) return details.formErrors.join(' ');
  return null;
}

export default function RegisterClient() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();

  const [step, setStep] = useState<Step>(1);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState(''); // opcional
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');

  // ✅ ojitos
  const [showPass1, setShowPass1] = useState(false);
  const [showPass2, setShowPass2] = useState(false);

  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const emailRegex = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i, []);
  const nameOk = fullName.trim().length >= 2;
  const emailOk = emailRegex.test(email.trim());
  const otpOk = otp.trim().length === 6;
  const passOk = password.length >= 8;
  const passMatch = passOk && password === password2;

  // Ping inicial (solo DEV)
  useEffect(() => {
    if (!__DEV__) return;

    (async () => {
      try {
        const res = await api.get('/health');
        console.log('[health OK]', res.data);
      } catch (e) {
        if (axios.isAxiosError(e)) {
          console.log('[health ERROR]', e.code, e.response?.status, e.message);
        } else {
          console.log('[health ERROR]', e);
        }
      }
    })();
  }, []);

  // Paso 1: enviar OTP
  const sendEmailOtp = async () => {
    if (!nameOk || !emailOk || cooldown > 0 || loading) return;
    setLoading(true);
    try {
      if (__DEV__) console.log('[register/start] POST ->', { email: email.trim() });

      const res = await api.post('/auth/register/start', { email: email.trim() });
      console.log('[register/start] RES <-', res.status, res.data);
      if (res.data?.ok) {
        setCooldown(45);
        setStep(2);
      } else {
        const msg = typeof res.data === 'string' ? res.data : (res.data?.error ?? 'unknown');
        Alert.alert('No se pudo enviar el código', String(msg));
      }
    } catch (err) {
      if (axios.isAxiosError<ApiError>(err)) {
        console.log('[register/start] AXIOS ERR', {
          status: err.response?.status,
          data: err.response?.data,
          code: err.code,
          message: err.message,
        });
        const code = err.response?.data?.error;
        if (code === 'email_in_use')
          Alert.alert('E-mail en uso', 'Ya existe una cuenta registrada con ese e-mail.');
        else if (code === 'too_many_requests')
          Alert.alert('Demasiados intentos', 'Esperá un momento antes de volver a intentar.');
        else Alert.alert('Error', code ?? err.message ?? 'No se pudo enviar el código.');
      } else {
        console.log('[register/start] UNK ERR', err);
        Alert.alert('Error', 'No se pudo enviar el código. Verificá tu conexión.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Paso 2: pasar a contraseñas
  const proceedAfterOtp = () => {
    if (!otpOk) return Alert.alert('Código inválido', 'Revisá que sean 6 dígitos.');
    setStep(3);
  };

  // Paso 3: verificar OTP + crear usuario
  const finish = async () => {
    if (!passMatch || !otpOk) return;
    setLoading(true);
    try {
      const body = {
        email: email.trim(),
        code: otp.trim(),
        name: fullName.trim(),
        password,
        phone: phone.trim() ? phone.trim() : null,
      };
      if (__DEV__) console.log('[register/verify] POST ->', { ...body, password: '***' });

      const res = await api.post<VerifyOk>('/auth/register/verify', body);
      console.log('[register/verify] RES <-', res.status, res.data);

      if (res.data?.ok && res.data.token) {
        await login(res.data.token);
        return;
      }
      Alert.alert('No se pudo crear la cuenta', 'Intentá nuevamente.');
    } catch (err) {
      if (axios.isAxiosError<ApiError>(err)) {
        console.log('[register/verify] AXIOS ERR', {
          status: err.response?.status,
          data: err.response?.data,
          code: err.code,
          message: err.message,
        });
        const code = err.response?.data?.error;
        const details = err.response?.data?.details;
        const msg =
          code === 'otp_invalid'
            ? 'El código es incorrecto.'
            : code === 'otp_expired'
              ? 'El código expiró. Volvé al paso 1 para reenviar.'
              : code === 'otp_blocked'
                ? 'Demasiados intentos. Esperá antes de reintentar.'
                : code === 'weak_password'
                  ? 'La contraseña es muy corta (mín. 8).'
                  : code === 'email_in_use'
                    ? 'Ese e-mail ya está en uso.'
                    : code === 'invalid_input'
                      ? (msgFromZod(details) ?? 'Revisá los datos ingresados.')
                      : (code ?? err.message ?? 'Ocurrió un error. Intentá de nuevo.');
        Alert.alert('Error', msg);
      } else {
        console.log('[register/verify] UNK ERR', err);
        Alert.alert('Error', 'No se pudo verificar/crear la cuenta.');
      }
    } finally {
      setLoading(false);
    }
  };

  // cooldown timer (1 solo interval)
  useEffect(() => {
    if (cooldown <= 0) return;

    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          cooldownRef.current = null;
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
      cooldownRef.current = null;
    };
  }, [cooldown]);

  const bottomPad = Math.max(16, insets.bottom + 6);
  const goBack = () => nav.goBack();

  return (
    <LinearGradient colors={['#015A69', '#16A4AE']} style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.select({ ios: 'padding', android: undefined })}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable
              onPress={goBack}
              style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.75 }]}
              accessibilityRole="button"
              accessibilityLabel="Volver"
            >
              <Text style={styles.backIcon}>‹</Text>
            </Pressable>

            <Text style={styles.headerTitle}>
              {step === 1 && 'Registro (cliente)'}
              {step === 2 && 'Verificá tu e-mail'}
              {step === 3 && 'Creá tu contraseña'}
            </Text>
            <Text style={styles.headerSub}>Paso {step} de 3</Text>
          </View>

          {/* Contenido */}
          <View style={styles.content}>
            {step === 1 && (
              <View style={styles.card}>
                <LabeledInput
                  label="Nombre y apellido"
                  placeholder="Ej: Ana Pérez"
                  value={fullName}
                  onChangeText={setFullName}
                  autoCapitalize="words"
                  autoComplete="name"
                  returnKeyType="next"
                  editable={!loading}
                />

                <LabeledInput
                  label="E-mail"
                  placeholder="tu@correo.com"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  textContentType="username"
                  editable={!loading}
                />

                <LinedNote text="Teléfono (opcional)" />
                <LabeledInput
                  label=""
                  placeholder="+54 11 ..."
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  editable={!loading}
                />

                <Pressable
                  onPress={sendEmailOtp}
                  disabled={!nameOk || !emailOk || cooldown > 0 || loading}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    (!nameOk || !emailOk || cooldown > 0 || loading) && styles.btnDisabled,
                    pressed && { opacity: 0.95 },
                  ]}
                >
                  <Text style={styles.primaryText}>
                    {cooldown > 0 ? `Reenviar código (${cooldown}s)` : 'Enviar código al e-mail'}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setStep(2)}
                  disabled={cooldown === 0}
                  style={[styles.linkBtn, cooldown === 0 && { opacity: 0.5 }]}
                >
                  <Text style={styles.linkText}>Ya tengo el código</Text>
                </Pressable>
              </View>
            )}

            {step === 2 && (
              <View style={styles.card}>
                <LabeledInput
                  label="Código de verificación"
                  placeholder="6 dígitos"
                  value={otp}
                  onChangeText={(t) => setOtp(t.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  editable={!loading}
                />

                <Pressable
                  onPress={proceedAfterOtp}
                  disabled={!otpOk || loading}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    (!otpOk || loading) && styles.btnDisabled,
                    pressed && { opacity: 0.95 },
                  ]}
                >
                  <Text style={styles.primaryText}>Continuar</Text>
                </Pressable>

                <Pressable onPress={() => setStep(1)} style={styles.linkBtn}>
                  <Text style={styles.linkText}>Volver</Text>
                </Pressable>
              </View>
            )}

            {step === 3 && (
              <View style={styles.card}>
                {/* ✅ Password con ojito */}
                <LabeledPasswordInput
                  label="Contraseña"
                  placeholder="Mínimo 8 caracteres"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPass1}
                  isVisible={showPass1}
                  onToggleVisibility={() => setShowPass1((v) => !v)}
                  textContentType="newPassword"
                  autoComplete="new-password"
                  editable={!loading}
                />

                {/* ✅ Repetir password con ojito */}
                <LabeledPasswordInput
                  label="Repetir contraseña"
                  placeholder="Igual a la anterior"
                  value={password2}
                  onChangeText={setPassword2}
                  secureTextEntry={!showPass2}
                  isVisible={showPass2}
                  onToggleVisibility={() => setShowPass2((v) => !v)}
                  textContentType="newPassword"
                  autoComplete="new-password"
                  editable={!loading}
                />

                <Pressable
                  onPress={finish}
                  disabled={!passMatch || loading}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    (!passMatch || loading) && styles.btnDisabled,
                    pressed && { opacity: 0.95 },
                  ]}
                >
                  <Text style={styles.primaryText}>Crear cuenta</Text>
                </Pressable>

                <Pressable onPress={() => setStep(2)} style={styles.linkBtn}>
                  <Text style={styles.linkText}>Volver</Text>
                </Pressable>
              </View>
            )}
          </View>

          <View style={{ height: bottomPad }} />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

/* ---------- UI helpers ---------- */
function LinedNote({ text }: { text: string }) {
  return <Text style={styles.note}>{text}</Text>;
}

type InputProps = React.ComponentProps<typeof TextInput> & { label: string };
function LabeledInput({ label, style, ...rest }: InputProps) {
  return (
    <View style={styles.inputWrap}>
      {label ? <Text style={styles.inputLabel}>{label}</Text> : null}
      <TextInput
        {...rest}
        style={[styles.input, style]}
        placeholderTextColor="rgba(255,255,255,0.7)"
      />
    </View>
  );
}

/**
 * ✅ Input Password con botón "ojito"
 * - Sin librerías
 * - Respeta el mismo look del input original
 */
function LabeledPasswordInput({
  label,
  isVisible,
  onToggleVisibility,
  style,
  ...rest
}: React.ComponentProps<typeof TextInput> & {
  label: string;
  isVisible: boolean;
  onToggleVisibility: () => void;
}) {
  return (
    <View style={styles.inputWrap}>
      {label ? <Text style={styles.inputLabel}>{label}</Text> : null}

      <View style={[pwdStyles.wrap, style]}>
        <TextInput {...rest} style={pwdStyles.input} placeholderTextColor="rgba(255,255,255,0.7)" />

        <Pressable
          onPress={onToggleVisibility}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={isVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          style={({ pressed }) => [pwdStyles.eyeBtn, pressed && { opacity: 0.75 }]}
        >
          <Text style={pwdStyles.eyeText}>{isVisible ? '🙈' : '👁️'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ---------- Estilos ---------- */
const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  flex: { flex: 1 },

  header: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 8 },
  backBtn: { paddingVertical: 6, paddingRight: 16, paddingLeft: 2, alignSelf: 'flex-start' },
  backIcon: { color: '#E9FEFF', fontSize: 30, lineHeight: 30 },
  headerTitle: { color: '#fff', fontSize: 26, fontWeight: '800', marginTop: 8 },
  headerSub: { color: 'rgba(233,254,255,0.92)', marginTop: 4 },

  content: { flex: 1, paddingHorizontal: 20, paddingTop: 12 },

  card: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },

  inputWrap: { gap: 6 },
  inputLabel: { color: 'rgba(255,255,255,0.9)', fontWeight: '700' },
  input: {
    height: 48,
    borderRadius: 14,
    paddingHorizontal: 14,
    color: '#fff',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },

  primaryBtn: {
    height: 48,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  primaryText: { color: '#0B6B76', fontWeight: '800', letterSpacing: 0.5, fontSize: 16 },

  linkBtn: { alignSelf: 'center', paddingVertical: 6 },
  linkText: { color: 'rgba(255,255,255,0.95)', textDecorationLine: 'underline' },

  note: { color: 'rgba(255,255,255,0.75)', marginTop: 8, marginBottom: -4 },
});

const pwdStyles = StyleSheet.create({
  wrap: {
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    paddingRight: 6,
  },
  input: {
    flex: 1,
    color: '#fff',
    height: '100%',
    paddingRight: 10,
  },
  eyeBtn: {
    height: 40,
    minWidth: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeText: {
    fontSize: 18,
    lineHeight: 18,
  },
});
