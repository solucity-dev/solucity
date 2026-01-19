// apps/mobile/src/screens/legal/PrivacyPolicyScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export default function PrivacyPolicyScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
          <Pressable onPress={() => navigation.goBack()} style={{ padding: 6, marginLeft: -6 }}>
            <Ionicons name="chevron-back" size={26} color="#E9FEFF" />
          </Pressable>
          <Text style={styles.brand}>Política de privacidad</Text>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 30 }}>
          <View style={styles.card}>
            <Text style={styles.h1}>Política de privacidad (borrador)</Text>
            <Text style={styles.p}>
              Esta política describe cómo Solucity recolecta, usa y protege tus datos. Este texto es
              un borrador inicial y podrá actualizarse antes del lanzamiento final.
            </Text>

            <Text style={styles.h2}>1. Datos que recopilamos</Text>
            <Text style={styles.p}>
              Podemos recopilar datos de cuenta (email, nombre), información de perfil, datos de uso
              (interacciones dentro de la app) y, si lo autorizás, ubicación aproximada para mejorar
              el servicio.
            </Text>

            <Text style={styles.h2}>2. Cómo usamos los datos</Text>
            <Text style={styles.p}>
              Usamos los datos para operar la plataforma, mejorar la experiencia, prevenir fraude,
              brindar soporte y cumplir requisitos legales.
            </Text>

            <Text style={styles.h2}>3. Compartir información</Text>
            <Text style={styles.p}>
              Solo compartimos datos cuando es necesario para prestar el servicio (por ejemplo,
              entre cliente y especialista en una orden) o por obligación legal.
            </Text>

            <Text style={styles.h2}>4. Seguridad</Text>
            <Text style={styles.p}>
              Aplicamos medidas razonables para proteger tus datos. Ningún sistema es 100% seguro,
              pero trabajamos para minimizar riesgos.
            </Text>

            <Text style={styles.h2}>5. Contacto</Text>
            <Text style={styles.p}>
              Si tenés dudas sobre privacidad, podés escribirnos desde “Ayuda y soporte”.
            </Text>

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
