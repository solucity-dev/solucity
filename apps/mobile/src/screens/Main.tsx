// apps/mobile/src/screens/Main.tsx
import React, { useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { AuthContext } from '../contexts/AuthContext'
import { api } from '../lib/api'

export default function Main() {
  const { user, logout } = React.useContext(AuthContext)
  const [meJson, setMeJson] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchMe = async () => {
    setLoading(true)
    try {
      const r = await api.get('/auth/me')
      setMeJson(JSON.stringify(r.data, null, 2))
    } catch (e: any) {
      setMeJson(null)
      Alert.alert('Error', e?.message ?? 'Fallo /auth/me')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>¡Bienvenido!</Text>
      <Text style={styles.sub}>Usuario: {user?.email}</Text>

      <Pressable onPress={fetchMe} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.9 }]}>
        <Text style={styles.btnText}>{loading ? 'Cargando…' : 'Probar /auth/me'}</Text>
      </Pressable>

      {meJson ? (
        <View style={styles.box}>
          <Text style={styles.code}>{meJson}</Text>
        </View>
      ) : null}

      <Pressable onPress={logout} style={[styles.btn, { backgroundColor: '#ffdddd' }]}>
        <Text style={[styles.btnText, { color: '#7a1a1a' }]}>Cerrar sesión</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 16 },
  title: { fontSize: 22, fontWeight: '800' },
  sub: { opacity: 0.8 },
  btn: {
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12,
    backgroundColor: '#e6fff9',
  },
  btnText: { fontWeight: '700', color: '#0B6B76' },
  box: { width: '100%', maxWidth: 500, backgroundColor: '#f6f6f6', padding: 12, borderRadius: 12 },
  code: { fontFamily: 'monospace' },
})
