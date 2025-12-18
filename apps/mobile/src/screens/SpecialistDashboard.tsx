import { LinearGradient } from 'expo-linear-gradient'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import SpecialistHeader from './_SpecialistHeader'

export default function SpecialistDashboard() {
  return (
    <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <SpecialistHeader />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Inicio especialista</Text>
          <Text style={styles.subtitle}>Acá vamos a listar próximos turnos, notificaciones y tips.</Text>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Próximamente</Text>
            <Text style={styles.text}>Resumen de agenda, atajos y métricas.</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800' },
  subtitle: { color: 'rgba(233,254,255,0.9)', marginBottom: 16 },
  card: { backgroundColor: 'rgba(233,254,255,0.10)', borderRadius: 16, padding: 14, marginBottom: 14 },
  cardTitle: { color: '#E9FEFF', fontWeight: '800', marginBottom: 8 },
  text: { color: 'rgba(233,254,255,0.95)' },
})
