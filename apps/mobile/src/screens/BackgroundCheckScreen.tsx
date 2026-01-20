import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Button, Text, View } from 'react-native';

import { api } from '../lib/api'; // ajustá si tu path es distinto

type BackgroundCheck = {
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewedAt?: string | null;
  rejectionReason?: string | null;
  fileUrl?: string | null;
};

export default function BackgroundCheckScreen() {
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [backgroundCheck, setBackgroundCheck] = useState<BackgroundCheck | null>(null);

  /** 1️⃣ Cargar estado actual */
  async function loadStatus() {
    try {
      setLoading(true);
      const res = await api.get('/specialists/me');

      const profile = res.data?.profile;
      setBackgroundCheck(profile?.backgroundCheck ?? null);
    } catch {
      Alert.alert('Error', 'No se pudo cargar el estado');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  /** 2️⃣ Subir archivo */
  async function handleUpload() {
    try {
      const pick = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        multiple: false,
      });

      if (pick.canceled) return;

      setUploading(true);

      const file = pick.assets[0];
      const form = new FormData();

      form.append('file', {
        uri: file.uri,
        name: file.name ?? 'background-check',
        type: file.mimeType ?? 'application/octet-stream',
      } as any);

      // 2.a subir archivo
      const uploadRes = await api.post('/specialists/background-check/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const url = uploadRes.data?.url;
      if (!url) throw new Error('upload_failed');

      // 2.b guardar antecedente
      await api.post('/specialists/background-check', { fileUrl: url });

      Alert.alert('Listo', 'Antecedente enviado para revisión');
      await loadStatus();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.error ?? 'Error al subir archivo');
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: '600', marginBottom: 16 }}>Antecedente penal</Text>

      {!backgroundCheck && (
        <Text style={{ marginBottom: 12 }}>Todavía no subiste tu antecedente penal.</Text>
      )}

      {backgroundCheck && (
        <View style={{ marginBottom: 16 }}>
          <Text>Estado: {backgroundCheck.status}</Text>

          {backgroundCheck.status === 'REJECTED' && (
            <Text style={{ color: 'red', marginTop: 8 }}>
              Motivo: {backgroundCheck.rejectionReason ?? 'No especificado'}
            </Text>
          )}
        </View>
      )}

      <Button
        title={uploading ? 'Subiendo...' : 'Subir antecedente'}
        onPress={handleUpload}
        disabled={uploading}
      />
    </View>
  );
}
