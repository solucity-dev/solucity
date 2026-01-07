import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { passwordStart } from '../api/password';

export default function ForgotPassword({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const onSend = async () => {
    const e = email.trim().toLowerCase();
    if (!e.includes('@')) return Alert.alert('Error', 'Ingresá un email válido');

    try {
      setLoading(true);
      await passwordStart(e);
      Alert.alert('Listo', 'Te enviamos un código de verificación.');
      navigation.navigate('ResetPassword', { email: e });
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'No se pudo enviar el código.';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1 }}>
      <SafeAreaView style={styles.safe}>
        <Text style={styles.title}>Recuperar contraseña</Text>
        <Text style={styles.sub}>Ingresá tu email y te enviaremos un código.</Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="tunombre@correo.com"
          placeholderTextColor="rgba(255,255,255,0.6)"
        />

        <TouchableOpacity style={styles.btn} onPress={onSend} disabled={loading}>
          <Text style={styles.btnT}>{loading ? 'Enviando...' : 'Enviar código'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 14 }}>
          <Text style={styles.link}>Volver al login</Text>
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
