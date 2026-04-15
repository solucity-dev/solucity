// apps/mobile/src/screens/Welcome.tsx
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import AppLogo from '../components/AppLogo';

type Props = {
  onCreateAccount: () => void;
  onLogin: () => void;
  onExplore: () => void;
  onOpenTerms: () => void;
  onOpenPrivacy: () => void;
};

export default function Welcome({
  onCreateAccount,
  onLogin,
  onExplore,
  onOpenTerms,
  onOpenPrivacy,
}: Props) {
  const insets = useSafeAreaInsets();
  const bottomLift = Math.max(32, insets.bottom + 18);

  return (
    <LinearGradient colors={['#015A69', '#16A4AE']} style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <AppLogo resizeMode="contain" style={styles.logo} />

          <Text style={styles.brand}>Solucity</Text>

          <Text style={styles.subtitle}>
            Conectamos personas con especialistas de confianza para resolver lo que necesites,
            rápido y seguro.
          </Text>
        </View>

        <View style={[styles.footer, { marginBottom: bottomLift }]}>
          <Pressable
            onPress={onExplore}
            style={({ pressed }) => [styles.exploreBtn, pressed && { opacity: 0.95 }]}
            accessibilityRole="button"
            accessibilityLabel="Explorar servicios"
          >
            <Text style={styles.exploreText}>Explorar servicios</Text>
          </Pressable>

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

          <Text style={styles.legalText}>
            Al continuar, aceptás nuestros{' '}
            <Text
              style={styles.legalLink}
              onPress={onOpenTerms}
              accessibilityRole="link"
              accessibilityLabel="Términos y condiciones"
            >
              Términos y Condiciones
            </Text>{' '}
            y la{' '}
            <Text
              style={styles.legalLink}
              onPress={onOpenPrivacy}
              accessibilityRole="link"
              accessibilityLabel="Política de privacidad"
            >
              Política de Privacidad
            </Text>
            .
          </Text>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
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
    paddingTop: 8,
    gap: 12,
  },

  exploreBtn: {
    height: 48,
    borderRadius: 18,
    backgroundColor: '#E9FEFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  exploreText: {
    color: '#0B6B76',
    fontWeight: '900',
    letterSpacing: 0.4,
    fontSize: 16,
  },

  primaryBtn: {
    height: 48,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  primaryText: {
    color: '#fff',
    fontWeight: '800',
    letterSpacing: 0.5,
    fontSize: 16,
  },

  secondaryBtn: {
    height: 48,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  secondaryText: {
    color: '#fff',
    fontWeight: '700',
    letterSpacing: 0.3,
    fontSize: 15,
  },

  legalText: {
    alignSelf: 'center',
    paddingVertical: 6,
    marginTop: 2,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.92)',
    lineHeight: 18,
  },
  legalLink: {
    color: 'rgba(255,255,255,0.98)',
    fontWeight: '900',
    textDecorationLine: 'underline',
  },
});
