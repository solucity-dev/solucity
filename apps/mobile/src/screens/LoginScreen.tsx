import { useNavigation } from '@react-navigation/native';
import axios from 'axios';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo, useState } from 'react';
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

type LoginResponse = {
  ok: boolean;
  token: string;
  user: { id: string; email: string; role: 'CUSTOMER' | 'SPECIALIST' | 'ADMIN' };
};

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false); // ✅ ojito
  const [loading, setLoading] = useState(false);

  const emailOk = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email.trim()), [email]);
  const passOk = password.length >= 8;

  const onSubmit = async () => {
    if (!emailOk || !passOk || loading) return;

    setLoading(true);
    try {
      const body = { email: email.trim().toLowerCase(), password };
      const res = await api.post<LoginResponse>('/auth/login', body);

      if (res.data?.ok && res.data.token) {
        await login(res.data.token);
        return;
      }

      Alert.alert('No se pudo iniciar sesión', 'Verificá tus credenciales e intentá de nuevo.');
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const code = (err.response?.data as any)?.error;
        const msg =
          code === 'invalid_credentials'
            ? 'Usuario o contraseña incorrectos.'
            : code === 'blocked'
              ? 'Tu cuenta está bloqueada.'
              : (err.message ?? 'Ocurrió un error. Intentá nuevamente.');
        Alert.alert('Error', msg);
      } else {
        Alert.alert('Error', 'No pude conectar con el servidor.');
      }
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => nav.goBack();

  const onForgotPassword = () => {
    const prefill = email.trim().toLowerCase();
    nav.navigate('ForgotPassword', prefill ? { email: prefill } : undefined);
  };

  return (
    <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <KeyboardAvoidingView
          style={{ flex: 1, paddingHorizontal: 20, paddingTop: 8 }}
          behavior={Platform.select({ ios: 'padding', android: undefined })}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
        >
          {/* Header */}
          <View style={{ paddingTop: 6, paddingBottom: 8 }}>
            <Pressable
              onPress={goBack}
              style={({ pressed }) => [
                { paddingVertical: 6, paddingRight: 16, paddingLeft: 2 },
                pressed && { opacity: 0.75 },
              ]}
            >
              <Text style={{ color: '#E9FEFF', fontSize: 30, lineHeight: 30 }}>‹</Text>
            </Pressable>

            <Text style={{ color: '#fff', fontSize: 26, fontWeight: '800', marginTop: 8 }}>
              Iniciar sesión
            </Text>
            <Text style={{ color: 'rgba(233,254,255,0.92)', marginTop: 4 }}>
              Accedé con tu cuenta
            </Text>
          </View>

          {/* Card */}
          <View
            style={{
              backgroundColor: 'rgba(255,255,255,0.1)',
              borderRadius: 18,
              padding: 16,
              gap: 12,
            }}
          >
            <LabeledInput
              label="E-mail"
              placeholder="tu@correo.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />

            {/* ✅ Password con ojito */}
            <LabeledPasswordInput
              label="Contraseña"
              placeholder="Mínimo 8 caracteres"
              value={password}
              onChangeText={setPassword}
              autoComplete="password"
              secureTextEntry={!showPass}
              onToggleVisibility={() => setShowPass((v) => !v)}
              isVisible={showPass}
            />

            <Pressable
              onPress={onSubmit}
              disabled={!emailOk || !passOk || loading}
              style={({ pressed }) => [
                styles.primaryBtn,
                (!emailOk || !passOk || loading) && styles.btnDisabled,
                pressed && { opacity: 0.95 },
              ]}
            >
              <Text style={styles.primaryText}>{loading ? 'Ingresando...' : 'Ingresar'}</Text>
            </Pressable>

            <Pressable
              onPress={onForgotPassword}
              style={({ pressed }) => [styles.forgotWrap, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.forgotText}>¿Olvidaste tu contraseña?</Text>
            </Pressable>
          </View>

          <View style={{ height: Math.max(16, insets.bottom + 6) }} />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

function LabeledInput({
  label,
  style,
  ...rest
}: React.ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Text style={{ color: 'rgba(255,255,255,0.9)', fontWeight: '700' }}>{label}</Text>
      ) : null}

      <TextInput
        {...rest}
        style={[
          {
            height: 48,
            borderRadius: 14,
            paddingHorizontal: 14,
            color: '#fff',
            backgroundColor: 'rgba(255,255,255,0.12)',
          },
          style,
        ]}
        placeholderTextColor="rgba(255,255,255,0.7)"
      />
    </View>
  );
}

/**
 * ✅ Input de password con botón "ojito"
 * - Sin librerías
 * - Mantiene el look del input original
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
    <View style={{ gap: 6 }}>
      {label ? (
        <Text style={{ color: 'rgba(255,255,255,0.9)', fontWeight: '700' }}>{label}</Text>
      ) : null}

      <View style={[pwdStyles.wrap, style]}>
        <TextInput {...rest} style={pwdStyles.input} placeholderTextColor="rgba(255,255,255,0.7)" />

        <Pressable
          onPress={onToggleVisibility}
          hitSlop={10}
          style={({ pressed }) => [pwdStyles.eyeBtn, pressed && { opacity: 0.75 }]}
        >
          <Text style={pwdStyles.eyeText}>{isVisible ? '🙈' : '👁️'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

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
    paddingRight: 10, // espacio para que no quede pegado al ojo
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

const styles = StyleSheet.create({
  primaryBtn: {
    height: 48,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  primaryText: { color: '#0B6B76', fontWeight: '800', letterSpacing: 0.5, fontSize: 16 },

  forgotWrap: {
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 2,
  },
  forgotText: {
    color: '#E9FEFF',
    fontWeight: '800',
  },
});
