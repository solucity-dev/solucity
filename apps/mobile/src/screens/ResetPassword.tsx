// apps/mobile/src/screens/ResetPassword.tsx
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { passwordVerify } from '../api/password';
import { useAuth } from '../auth/AuthProvider';

export default function ResetPassword({ route, navigation }: any) {
  const email = route?.params?.email as string;
  const { login } = useAuth();

  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const onConfirm = async () => {
    const c = code.trim();
    if (c.length < 4) return Alert.alert('Error', 'Ingresá el código (OTP)');
    if (newPassword.trim().length < 8) {
      return Alert.alert('Error', 'La contraseña debe tener al menos 8 caracteres');
    }

    try {
      setLoading(true);

      const data = await passwordVerify(email, c, newPassword.trim());

      if (!data?.token) {
        Alert.alert('Error', 'El servidor no devolvió token.');
        return;
      }

      await login(data.token);
      Alert.alert('Listo', 'Contraseña actualizada.');

      // RootNavigator debería llevarte solo a Main si detecta token
      // navigation.reset({ index: 0, routes: [{ name: 'Main' }] }); // opcional si lo necesitás
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'No se pudo actualizar.';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1 }}>
      <SafeAreaView style={styles.safe}>
        <Text style={styles.title}>Ingresar código</Text>
        <Text style={styles.sub}>Te enviamos un código a: {email}</Text>

        <Text style={styles.label}>Código</Text>
        <TextInput
          style={styles.input}
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          placeholder="Ej: 123456"
          placeholderTextColor="rgba(255,255,255,0.6)"
        />

        <Text style={styles.label}>Nueva contraseña</Text>

        <View style={styles.passWrap}>
          <TextInput
            style={[styles.input, styles.passInput]}
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry={!showPassword}
            placeholder="Mínimo 8 caracteres"
            placeholderTextColor="rgba(255,255,255,0.6)"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TouchableOpacity
            onPress={() => setShowPassword((v) => !v)}
            style={styles.eyeBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            <Ionicons
              name={showPassword ? 'eye-off' : 'eye'}
              size={22}
              color="rgba(255,255,255,0.9)"
            />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.btn} onPress={onConfirm} disabled={loading}>
          <Text style={styles.btnT}>{loading ? 'Confirmando...' : 'Confirmar'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 14 }}>
          <Text style={styles.link}>Volver</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 20, paddingTop: 24 },
  title: { color: '#fff', fontSize: 26, fontWeight: '900' },
  sub: { color: 'rgba(255,255,255,0.85)', marginTop: 6, marginBottom: 18 },
  label: { color: '#E9FEFF', fontWeight: '700', marginBottom: 6 },

  input: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingHorizontal: 12,
    color: '#fff',
    minHeight: 46,
    marginBottom: 14,
  },

  passWrap: {
    position: 'relative',
    justifyContent: 'center',
  },

  passInput: {
    marginBottom: 14,
    paddingRight: 44, // espacio para el icono
  },

  eyeBtn: {
    position: 'absolute',
    right: 12,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },

  btn: {
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnT: { fontWeight: '900', color: '#0B6B76' },
  link: { color: '#E9FEFF', fontWeight: '800', textAlign: 'center' },
});
