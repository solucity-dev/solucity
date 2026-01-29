// apps/mobile/src/screens/legal/TermsScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TermsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const lastUpdated = new Date().toLocaleDateString('es-AR');

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
            <Text style={styles.h1}>Términos y condiciones</Text>

            <Text style={styles.p}>
              Estos Términos regulan el uso de <Text style={styles.bold}>Solucity</Text>, una
              plataforma que conecta clientes con especialistas de distintos rubros. Al usar la app,
              aceptás estos Términos.
            </Text>

            <Text style={styles.note}>
              Solucity <Text style={styles.bold}>no utiliza micrófono</Text> ni realiza
              videollamadas desde la app.
            </Text>

            <Text style={styles.h2}>1. Roles</Text>
            <Text style={styles.li}>
              • <Text style={styles.bold}>Cliente</Text>: solicita servicios.
            </Text>
            <Text style={styles.li}>
              • <Text style={styles.bold}>Especialista</Text>: ofrece servicios según su rubro.
            </Text>

            <Text style={styles.h2}>2. Registro, acceso y veracidad</Text>
            <Text style={styles.p}>
              Debés brindar información veraz y actualizada. Sos responsable de mantener la
              seguridad de tu cuenta y del uso que se haga desde ella.
            </Text>

            <Text style={styles.h2}>3. Verificación de identidad y documentación</Text>
            <Text style={styles.p}>
              Para proteger a la comunidad y prevenir fraude, Solucity puede solicitar verificación
              de identidad y/o documentación, incluyendo:
            </Text>
            <Text style={styles.li}>• DNI (frente/dorso) y/o selfie.</Text>
            <Text style={styles.li}>
              • Certificado de antecedentes / buena conducta y matrícula/título para rubros que lo
              requieran (imagen o PDF).
            </Text>
            <Text style={styles.p}>
              La falta de documentación, documentación inválida o inconsistente puede resultar en
              rechazo, suspensión o limitación de la cuenta.
            </Text>

            <Text style={styles.h2}>4. Qué hace (y qué no hace) Solucity</Text>
            <Text style={styles.p}>
              Solucity actúa como intermediario tecnológico para facilitar el contacto y la gestión
              de solicitudes. El servicio final se acuerda entre cliente y especialista
              (disponibilidad, alcance, condiciones, precio, etc.).
            </Text>

            <Text style={styles.h2}>5. Conducta y uso permitido</Text>
            <Text style={styles.p}>No está permitido:</Text>
            <Text style={styles.li}>
              • Fraude, suplantación de identidad o documentación falsa.
            </Text>
            <Text style={styles.li}>• Acoso, abuso, amenazas o discriminación.</Text>
            <Text style={styles.li}>
              • Actividades ilegales o uso de la plataforma con fines ilícitos.
            </Text>
            <Text style={styles.p}>
              Podemos suspender o cancelar cuentas ante incumplimientos o riesgos para usuarios y la
              plataforma.
            </Text>

            <Text style={styles.h2}>6. Ubicación</Text>
            <Text style={styles.p}>
              La app puede usar tu ubicación (si otorgás permiso) para mostrar especialistas
              cercanos y mejorar resultados. Podés desactivar el permiso desde tu dispositivo,
              aunque algunas funciones pueden verse afectadas.
            </Text>

            <Text style={styles.h2}>7. Pagos, suscripciones y cobros</Text>
            <Text style={styles.p}>
              Si la plataforma habilita pagos dentro de la app, comisiones o suscripciones, se
              informarán condiciones claras antes de confirmar cualquier operación (precios,
              renovación, cancelación y reembolsos si corresponden).
            </Text>

            <Text style={styles.h2}>8. Contenido y materiales subidos</Text>
            <Text style={styles.p}>
              Si subís fotos o documentos (DNI, selfie, antecedentes, matrícula/título), garantizás
              que son auténticos y que tenés derecho a compartirlos. Solucity puede revisar y/o
              solicitar re-subida si la calidad es insuficiente.
            </Text>

            <Text style={styles.h2}>9. Limitación de responsabilidad</Text>
            <Text style={styles.p}>
              En la medida permitida por la ley, Solucity no es responsable por actos u omisiones de
              clientes o especialistas, ni por daños derivados de acuerdos celebrados fuera del
              control de la plataforma. Solucity no garantiza resultados específicos del servicio
              contratado entre partes.
            </Text>

            <Text style={styles.h2}>10. Terminación</Text>
            <Text style={styles.p}>
              Podés dejar de usar la app en cualquier momento. Solucity puede suspender o cancelar
              cuentas si detecta incumplimientos, fraude o riesgos de seguridad.
            </Text>

            <Text style={styles.h2}>11. Cambios</Text>
            <Text style={styles.p}>
              Podemos actualizar estos Términos. Si el cambio es relevante, lo informaremos por
              medios razonables. El uso continuado de la app implica aceptación de la versión
              vigente.
            </Text>

            <Text style={styles.h2}>12. Contacto</Text>
            <Text style={styles.p}>
              Soporte / consultas: <Text style={styles.bold}>solucitydev@gmail.com</Text>.
            </Text>

            <Text style={styles.small}>Última actualización: {lastUpdated}</Text>
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
  h2: { color: '#E9FEFF', fontWeight: '900', marginTop: 12, marginBottom: 6 },
  p: { color: 'rgba(233,254,255,0.95)', lineHeight: 20 },
  li: { color: 'rgba(233,254,255,0.95)', lineHeight: 20, marginTop: 6 },
  note: {
    color: 'rgba(233,254,255,0.95)',
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 6,
    fontWeight: '800',
  },
  bold: { fontWeight: '900', color: '#E9FEFF' },
  small: { color: 'rgba(233,254,255,0.8)', marginTop: 14, fontWeight: '700' },
});
