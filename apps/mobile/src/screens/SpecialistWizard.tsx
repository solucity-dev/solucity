// apps/mobile/src/screens/SpecialistWizard.tsx
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  /** Cierra el asistente (RootNavigator te lo pasa). Si no viene, no hace nada. */
  onClose?: () => void;
};

export default function SpecialistWizard({ onClose }: Props) {
  const insets = useSafeAreaInsets();

  const handleClose = () => {
    if (onClose) onClose();
  };

  return (
    <LinearGradient colors={['#015A69', '#16A4AE']} style={styles.container}>
      <SafeAreaView
        style={[styles.safe, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.brand}>Solucity</Text>
          <Pressable
            onPress={handleClose}
            hitSlop={8}
            style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.8 }]}
          >
            <Text style={styles.closeText}>Cerrar</Text>
          </Pressable>
        </View>

        {/* Contenido */}
        <View style={styles.body}>
          <Text style={styles.title}>Configurar perfil de especialista</Text>
          <Text style={styles.subtitle}>
            Este es un asistente inicial (placeholder). Acá irán los pasos para completar{'\n'}tu
            perfil profesional, zonas de trabajo y verificación.
          </Text>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Paso 1: Datos básicos</Text>
            <Text style={styles.cardText}>Nombre comercial, descripción corta y rubros.</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Paso 2: Cobertura</Text>
            <Text style={styles.cardText}>Zona, radio y disponibilidad horaria.</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Paso 3: Verificación</Text>
            <Text style={styles.cardText}>Documentación y validación de identidad.</Text>
          </View>

          <Pressable
            onPress={handleClose}
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.95 }]}
          >
            <Text style={styles.primaryText}>Entendido</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { color: '#E9FEFF', fontWeight: '800', fontSize: 18 },
  closeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  closeText: { color: '#E9FEFF', fontWeight: '700' },

  body: { flex: 1, paddingHorizontal: 16, paddingTop: 12, gap: 12 },
  title: { color: '#fff', fontSize: 22, fontWeight: '800' },
  subtitle: { color: 'rgba(233,254,255,0.92)' },

  card: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  cardTitle: { color: '#E9FEFF', fontWeight: '800' },
  cardText: { color: 'rgba(233,254,255,0.92)' },

  primaryBtn: {
    marginTop: 8,
    height: 48,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#0B6B76', fontWeight: '800', letterSpacing: 0.5, fontSize: 16 },
});
