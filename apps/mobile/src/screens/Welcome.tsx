// apps/mobile/src/screens/Welcome.tsx
import { LinearGradient } from 'expo-linear-gradient'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

import Logo from '../assets/logo.png'

type Props = {
  onCreateAccount: () => void
  onLogin: () => void
  onOpenTerms: () => void
}

export default function Welcome({ onCreateAccount, onLogin, onOpenTerms }: Props) {
  const insets = useSafeAreaInsets()
  // levantamos el footer para que no quede pegado al borde
  const bottomLift = Math.max(32, insets.bottom + 18)

  return (
    <LinearGradient colors={['#015A69', '#16A4AE']} style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* Centro: logo + textos */}
        <View style={styles.content}>
          <Image source={Logo} resizeMode="contain" style={styles.logo} />
          <Text style={styles.brand}>Solucity</Text>

          <Text style={styles.subtitle}>
            Conectamos personas con especialistas de confianza para resolver lo que necesites,
            rápido y seguro.
          </Text>
        </View>

        {/* Footer: acciones */}
        <View style={[styles.footer, { marginBottom: bottomLift }]}>
          <Pressable
            onPress={onCreateAccount}
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.95 }]}
            accessibilityRole="button"
            accessibilityLabel="Crear una cuenta"
          >
            <Text style={styles.primaryText}>Crear una cuenta</Text>
          </Pressable>

          <Pressable
            onPress={onLogin}
            style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.9 }]}
            accessibilityRole="button"
            accessibilityLabel="Ya tengo una cuenta"
          >
            <Text style={styles.secondaryText}>Ya tengo una cuenta</Text>
          </Pressable>

          <Pressable
            onPress={onOpenTerms}
            style={styles.termsBtn}
            accessibilityRole="link"
            accessibilityLabel="Términos y condiciones"
          >
            <Text style={styles.termsText}>Términos y condiciones</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },

  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 8,
  },
  logo: { width: 128, height: 128, marginBottom: 4 },
  brand: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 8,
  },

  footer: {
    paddingHorizontal: 24,
    gap: 12,
  },
  primaryBtn: {
    height: 48,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    // una leve sombra sutil (Android/iOS)
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  primaryText: {
    color: '#0B6B76',
    fontWeight: '800',
    letterSpacing: 0.5,
    fontSize: 16,
  },
  secondaryBtn: {
    height: 48,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    color: '#fff',
    fontWeight: '700',
    letterSpacing: 0.3,
    fontSize: 15,
  },
  termsBtn: { alignSelf: 'center', paddingVertical: 6, marginTop: 2 },
  termsText: { color: 'rgba(255,255,255,0.92)', textDecorationLine: 'underline' },
})
