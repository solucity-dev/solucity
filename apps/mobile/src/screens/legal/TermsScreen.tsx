// apps/mobile/src/screens/legal/TermsScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TermsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
          <Pressable onPress={() => navigation.goBack()} style={{ padding: 6, marginLeft: -6 }}>
            <Ionicons name="chevron-back" size={26} color="#E9FEFF" />
          </Pressable>
          <Text style={styles.brand}>Términos y condiciones</Text>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 30 }}>
          <View style={styles.card}>
            <Text style={styles.h1}>Términos y condiciones (borrador)</Text>

            <Text style={styles.h2}>1. Uso de la plataforma</Text>
            <Text style={styles.p}>
              Solucity conecta clientes con especialistas. El usuario se compromete a brindar
              información veraz y a utilizar la app de buena fe.
            </Text>

            <Text style={styles.h2}>2. Responsabilidades</Text>
            <Text style={styles.p}>
              Solucity actúa como intermediario tecnológico. Cada servicio es acordado entre cliente
              y especialista según disponibilidad, condiciones y precios.
            </Text>

            <Text style={styles.h2}>3. Conducta y seguridad</Text>
            <Text style={styles.p}>
              No se permite el uso fraudulento, abuso, acoso o actividades ilegales. Podremos
              suspender cuentas ante incumplimientos.
            </Text>

            <Text style={styles.h2}>4. Pagos y suscripciones</Text>
            <Text style={styles.p}>
              Si se habilitan planes o suscripciones, se informarán condiciones claras dentro de la
              app.
            </Text>

            <Text style={styles.h2}>5. Soporte</Text>
            <Text style={styles.p}>Podés contactarnos desde “Ayuda y soporte”.</Text>

            <Text style={styles.small}>
              Última actualización: {new Date().toLocaleDateString('es-AR')}
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { color: '#E9FEFF', fontWeight: '900', fontSize: 16 },

  card: {
    backgroundColor: 'rgba(0, 35, 40, 0.32)',
    borderRadius: 16,
    padding: 14,
  },
  h1: { color: '#E9FEFF', fontWeight: '900', fontSize: 18, marginBottom: 10 },
  h2: { color: '#E9FEFF', fontWeight: '900', marginTop: 10, marginBottom: 6 },
  p: { color: 'rgba(233,254,255,0.95)', lineHeight: 20 },
  small: { color: 'rgba(233,254,255,0.8)', marginTop: 14, fontWeight: '700' },
});
