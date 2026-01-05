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
  const nav = useNavigation();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

        // No navegamos manual: RootNavigator detecta token y dibuja Main
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
            <LabeledInput
              label="Contraseña"
              placeholder="Mínimo 8 caracteres"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
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
});
