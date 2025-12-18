// apps/mobile/src/screens/SpecialistSettings.tsx
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useState } from 'react'
import {
  Alert,
  Image, // 👈 de react-native (correcto)
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../auth/AuthProvider'

export default function SpecialistSettings() {
  const insets = useSafeAreaInsets()
  const { signOut } = useAuth()

  // Campos de ejemplo (puedes conectarlos a tu API si quieres guardado instantáneo)
  const [fullname, setFullname] = useState('')
  const [email, setEmail] = useState('')
  const [pushEnabled, setPushEnabled] = useState(true)

  const onSaveBasic = async () => {
    try {
      // Aquí podrías llamar a tu endpoint de ajustes de cuenta
      // await api.patch('/me', { fullname, email })
      Alert.alert('Guardado', 'Tus datos se actualizaron.')
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.error ?? 'No se pudo guardar.')
    }
  }

  const onChangePassword = async () => {
    Alert.alert('Próximamente', 'Cambiar contraseña en el siguiente sprint.')
  }

  const onLogout = async () => {
    await signOut()
  }

  return (
    <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1 }}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* Header con logo + campana, igual línea visual que ClientHome */}
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <View style={styles.brandRow}>
            <Image
              source={require('../assets/logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.brand}>solucity</Text>
          </View>

          <View style={{ position: 'absolute', right: 18, top: insets.top + 12 }}>
            <Ionicons name="notifications-outline" size={28} color="#E9FEFF" />
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Ajustes de cuenta</Text>

          {/* Datos básicos */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Datos</Text>

            <Text style={styles.label}>Nombre y apellido</Text>
            <TextInput
              style={styles.input}
              placeholder="Tu nombre completo"
              placeholderTextColor="rgba(233,254,255,0.7)"
              value={fullname}
              onChangeText={setFullname}
            />

            <Text style={styles.label}>Correo</Text>
            <TextInput
              style={styles.input}
              placeholder="tunombre@correo.com"
              placeholderTextColor="rgba(233,254,255,0.7)"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />

            <View style={styles.row}>
              <Text style={styles.rowT}>Notificaciones push</Text>
              <Switch
                thumbColor="#0B6B76"
                trackColor={{ false: 'rgba(233,254,255,0.3)', true: '#E9FEFF' }}
                value={pushEnabled}
                onValueChange={setPushEnabled}
              />
            </View>

            <View style={[styles.btn, { marginTop: 8 }]}>
              <Text onPress={onSaveBasic} style={[styles.btnT, { color: '#0B6B76' }]}>
                Guardar cambios
              </Text>
            </View>
          </View>

          {/* Seguridad */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Seguridad</Text>
            <View style={styles.row}>
              <Text style={styles.rowT}>Cambiar contraseña</Text>
              <Ionicons
                name="chevron-forward"
                size={22}
                color="#E9FEFF"
                onPress={onChangePassword}
              />
            </View>
          </View>

          {/* Sesión */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sesión</Text>
            <View style={[styles.btn, { backgroundColor: '#ff3b30' }]}>
              <Text onPress={onLogout} style={[styles.btnT, { color: '#fff' }]}>
                Cerrar sesión
              </Text>
            </View>
          </View>

          <View style={{ height: 80 }} />
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },

  // Header
  header: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  brandRow: {            // 👈 faltaba
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logo: {                // 👈 faltaba
    width: 30,
    height: 30,
  },
  brand: {
    color: '#E9FEFF',
    fontWeight: '900',
    fontSize: 26,
    letterSpacing: 0.5,
  },

  // Contenido
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 120 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800', marginBottom: 16 },

  // Tarjetas
  card: {
    backgroundColor: 'rgba(0, 35, 40, 0.32)',
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
  },
  cardTitle: {
    fontWeight: '800',
    color: '#E9FEFF',
    marginBottom: 8,
    fontSize: 16,
  },

  // Campos
  label: { color: '#E9FEFF', fontWeight: '700', marginBottom: 6 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 12,
    paddingHorizontal: 12,
    color: '#fff',
    minHeight: 46,
    marginBottom: 10,
  },

  // Filas
  row: {
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowT: { color: '#E9FEFF', fontWeight: '700', fontSize: 15 },

  // Botón
  btn: {
    height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnT: { fontWeight: '900' },
})


