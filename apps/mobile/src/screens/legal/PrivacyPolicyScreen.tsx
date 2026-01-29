// apps/mobile/src/screens/legal/PrivacyPolicyScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export default function PrivacyPolicyScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const lastUpdated = new Date().toLocaleDateString('es-AR');

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
            <Text style={styles.h1}>Política de privacidad</Text>

            <Text style={styles.p}>
              Esta Política de Privacidad describe cómo <Text style={styles.bold}>Solucity</Text>{' '}
              recopila, usa, comparte y protege tu información cuando usás nuestra aplicación.
            </Text>

            <Text style={styles.note}>
              Importante: Solucity <Text style={styles.bold}>no utiliza micrófono</Text> ni realiza
              videollamadas desde la app.
            </Text>

            <Text style={styles.h2}>1. Quiénes somos (responsable del tratamiento)</Text>
            <Text style={styles.p}>
              Solucity es una plataforma que conecta clientes con especialistas de distintos rubros.
              Para consultas de privacidad podés escribir a:{' '}
              <Text style={styles.bold}>solucitydev@gmail.com</Text>.
            </Text>

            <Text style={styles.h2}>2. Qué datos recopilamos</Text>
            <Text style={styles.p}>
              Dependiendo de tu rol (cliente o especialista) y de lo que elijas hacer dentro de la
              app, podemos recopilar:
            </Text>

            <Text style={styles.li}>
              • Datos de cuenta: nombre, email, identificadores de acceso (OTP / sesión).
            </Text>
            <Text style={styles.li}>
              • Datos de perfil: foto de perfil, rubro/categorías, descripción, zona, etc.
            </Text>
            <Text style={styles.li}>
              • Verificación de identidad: imágenes del DNI (frente/dorso), selfie y/o fotos
              asociadas a validación.
            </Text>
            <Text style={styles.li}>
              • Documentación del especialista (según rubro): certificado de antecedentes / buena
              conducta, matrícula, título u otras credenciales. Puede ser en{' '}
              <Text style={styles.bold}>imagen</Text> o <Text style={styles.bold}>PDF</Text>.
            </Text>
            <Text style={styles.li}>
              • Ubicación: ubicación aproximada o precisa (según permisos) para mostrar
              especialistas cercanos y mejorar resultados.
            </Text>
            <Text style={styles.li}>
              • Datos de uso: pantallas visitadas, interacciones, eventos técnicos (p. ej. errores)
              para mejorar la app.
            </Text>
            <Text style={styles.li}>
              • Notificaciones: token de dispositivo y eventos necesarios para enviar notificaciones
              (si las activás).
            </Text>

            <Text style={styles.h2}>3. Para qué usamos tus datos</Text>
            <Text style={styles.p}>Usamos la información para:</Text>
            <Text style={styles.li}>• Crear y administrar tu cuenta.</Text>
            <Text style={styles.li}>
              • Conectar clientes con especialistas y gestionar solicitudes/órdenes.
            </Text>
            <Text style={styles.li}>
              • Verificar identidad y/o documentación cuando corresponde (p. ej. DNI, antecedentes,
              matrícula/título).
            </Text>
            <Text style={styles.li}>
              • Mostrar resultados relevantes según tu ubicación (especialistas cerca).
            </Text>
            <Text style={styles.li}>• Brindar soporte y comunicaciones de servicio.</Text>
            <Text style={styles.li}>• Prevenir fraude, abuso y mejorar la seguridad.</Text>
            <Text style={styles.li}>
              • Mejorar rendimiento, estabilidad y experiencia de usuario.
            </Text>

            <Text style={styles.h2}>4. Base legal / consentimiento</Text>
            <Text style={styles.p}>
              Tratamos tus datos para prestar el servicio (ejecución del contrato), por interés
              legítimo (seguridad y mejoras) y, cuando corresponde, con tu consentimiento (por
              ejemplo, permisos de ubicación, cámara y notificaciones).
            </Text>

            <Text style={styles.h2}>5. Permisos del dispositivo</Text>
            <Text style={styles.p}>Solucity puede solicitar los siguientes permisos:</Text>
            <Text style={styles.li}>
              • <Text style={styles.bold}>Cámara</Text>: subir foto de perfil y documentación
              (DNI/selfie/credenciales).
            </Text>
            <Text style={styles.li}>
              • <Text style={styles.bold}>Ubicación</Text>: mostrar especialistas cercanos y
              resultados por proximidad.
            </Text>
            <Text style={styles.li}>
              • <Text style={styles.bold}>Notificaciones</Text>: avisos relevantes (por ejemplo,
              estados, novedades o acciones).
            </Text>
            <Text style={styles.p}>
              Podés revocar permisos desde la configuración del dispositivo. Algunas funciones
              podrían dejar de estar disponibles si los desactivás.
            </Text>

            <Text style={styles.h2}>6. Con quién compartimos información</Text>
            <Text style={styles.p}>No vendemos tu información. Podemos compartirla:</Text>
            <Text style={styles.li}>
              • Entre <Text style={styles.bold}>cliente y especialista</Text> cuando es necesario
              para prestar el servicio (por ejemplo, datos vinculados a una orden o contacto dentro
              del flujo).
            </Text>
            <Text style={styles.li}>
              • Con <Text style={styles.bold}>proveedores</Text> que nos ayudan a operar (hosting,
              base de datos, envío de emails/OTP, notificaciones, almacenamiento de archivos), bajo
              obligaciones de confidencialidad.
            </Text>
            <Text style={styles.li}>
              • Por <Text style={styles.bold}>obligación legal</Text> o requerimiento de autoridad
              competente.
            </Text>

            <Text style={styles.h2}>7. Conservación de datos</Text>
            <Text style={styles.p}>
              Conservamos tus datos mientras tu cuenta esté activa o sea necesario para prestar el
              servicio, cumplir obligaciones legales, resolver disputas y hacer cumplir nuestros
              acuerdos. Podemos eliminar o anonimizar datos cuando ya no sean necesarios.
            </Text>

            <Text style={styles.h2}>8. Seguridad</Text>
            <Text style={styles.p}>
              Aplicamos medidas razonables de seguridad (controles de acceso, cifrado en tránsito
              cuando corresponde, monitoreo y prácticas de desarrollo seguro). Ningún sistema es
              100% seguro, pero trabajamos para minimizar riesgos.
            </Text>

            <Text style={styles.h2}>9. Tus derechos y opciones</Text>
            <Text style={styles.p}>
              Podés solicitar acceso, actualización o eliminación de tus datos, y hacer consultas
              relacionadas a privacidad escribiendo a{' '}
              <Text style={styles.bold}>solucitydev@gmail.com</Text>.
            </Text>

            <Text style={styles.h2}>10. Menores de edad</Text>
            <Text style={styles.p}>
              Solucity no está destinada a menores de 18 años. Si creés que un menor nos brindó
              datos, contactanos para revisarlo.
            </Text>

            <Text style={styles.h2}>11. Cambios a esta política</Text>
            <Text style={styles.p}>
              Podemos actualizar esta política para reflejar mejoras o cambios legales/técnicos.
              Publicaremos la versión actualizada indicando la fecha de última actualización.
            </Text>

            <Text style={styles.h2}>12. Contacto</Text>
            <Text style={styles.p}>
              Consultas de privacidad: <Text style={styles.bold}>solucitydev@gmail.com</Text>.
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
