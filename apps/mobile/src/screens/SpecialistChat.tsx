import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import SpecialistHeader from './_SpecialistHeader';

export default function SpecialistChat() {
  return (
    <LinearGradient colors={['#015A69', '#16A4AE']} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <SpecialistHeader />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Chat</Text>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Conversaciones</Text>
            <Text style={styles.text}>Aquí listaremos conversaciones y mensajes.</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800', marginBottom: 10 },
  card: {
    backgroundColor: 'rgba(233,254,255,0.10)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  cardTitle: { color: '#E9FEFF', fontWeight: '800', marginBottom: 8 },
  text: { color: 'rgba(233,254,255,0.95)' },
});
