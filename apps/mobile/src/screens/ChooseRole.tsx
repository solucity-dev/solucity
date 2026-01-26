// apps/mobile/src/screens/ChooseRole.tsx
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { BackHandler, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import Logo from '../assets/logo.png';

type Props = {
  onBack: () => void;
  onPickClient: () => void;
  onPickPro: () => void;
};

export default function ChooseRole({ onBack, onPickClient, onPickPro }: Props) {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  const headerHeight = Math.max(84, insets.top + 84);

  return (
    <LinearGradient colors={['#015A69', '#16A4AE']} style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={[styles.header, { height: headerHeight }]}>
          <Pressable
            onPress={onBack}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.75 }]}
            accessibilityRole="button"
            accessibilityLabel="Volver"
            hitSlop={8}
          >
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>

          {/* Logo centrado */}
          <View style={styles.headerCenter}>
            <Image source={Logo} resizeMode="contain" style={styles.logo} />
          </View>
        </View>

        {/* Contenido */}
        <View style={styles.content}>
          <Text style={styles.title}>Crear una cuenta</Text>
          <Text style={styles.subtitle}>Elegí cómo querés usar Solucity</Text>

          <View style={styles.cards}>
            <Pressable
              onPress={onPickClient}
              accessibilityRole="button"
              accessibilityLabel="Crear cuenta como cliente"
              hitSlop={8}
              style={({ pressed }) => [styles.card, pressed && { transform: [{ scale: 0.99 }] }]}
            >
              <View style={styles.cardIconBubble}>
                <Text style={styles.cardIcon}>👤</Text>
              </View>
              <View style={styles.cardTexts}>
                <Text style={styles.cardTitle}>Necesito un especialista</Text>
                <Text style={styles.cardBody}>Pedí ayuda para tu hogar o negocio.</Text>
              </View>
            </Pressable>

            <Pressable
              onPress={onPickPro}
              accessibilityRole="button"
              accessibilityLabel="Crear cuenta como especialista"
              hitSlop={8}
              style={({ pressed }) => [styles.card, pressed && { transform: [{ scale: 0.99 }] }]}
            >
              <View style={styles.cardIconBubble}>
                <Text style={styles.cardIcon}>🛠️</Text>
              </View>
              <View style={styles.cardTexts}>
                <Text style={styles.cardTitle}>Soy especialista y quiero trabajar</Text>
                <Text style={styles.cardBody}>Recibí pedidos y hacé crecer tu negocio.</Text>
              </View>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },

  header: { justifyContent: 'center' },
  backBtn: {
    position: 'absolute',
    left: 4,
    top: 0,
    bottom: 0,
    paddingHorizontal: 16,
    justifyContent: 'center',
    height: '100%',
  },
  backIcon: { color: '#E9FEFF', fontSize: 32, lineHeight: 32, marginTop: 2 },

  headerCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  logo: { width: 72, height: 72 },

  content: { flex: 1, paddingHorizontal: 20, paddingTop: 12 },
  title: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 0.2,
    marginTop: 12,
    textAlign: 'center',
  },
  subtitle: { color: 'rgba(233,254,255,0.92)', fontSize: 15.5, marginTop: 8, textAlign: 'center' },

  cards: { marginTop: 24, gap: 14 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.92)',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  cardIconBubble: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(1,90,105,0.09)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  cardIcon: { fontSize: 22 },
  cardTexts: { flex: 1 },
  cardTitle: { color: '#0B4550', fontSize: 16.5, fontWeight: '800', marginBottom: 2 },
  cardBody: { color: '#2b5f66', fontSize: 14.5 },
});
