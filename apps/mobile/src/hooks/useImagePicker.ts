//apps/mobile/src/hooks/useImagePicker.ts
import * as ImagePicker from 'expo-image-picker';

export type PickResult = { uri: string; width: number; height: number; size?: number };

export function useImagePicker() {
  const pickFromLibrary = async (): Promise<PickResult | null> => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: false,
      quality: 0.9,
      exif: true,
    });
    if (res.canceled) return null;
    const a = res.assets?.[0];
    return a ? { uri: a.uri, width: a.width ?? 0, height: a.height ?? 0, size: a.fileSize } : null;
  };

  const takePhoto = async (): Promise<PickResult | null> => {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (cam.status !== 'granted') return null;
    const res = await ImagePicker.launchCameraAsync({
      quality: 0.9,
      exif: true,
    });
    if (res.canceled) return null;
    const a = res.assets?.[0];
    return a ? { uri: a.uri, width: a.width ?? 0, height: a.height ?? 0, size: a.fileSize } : null;
  };

  const validateImage = (img: PickResult) => {
    const minW = 1000,
      minH = 700;
    const maxBytes = 8 * 1024 * 1024;
    if (img.width < minW || img.height < minH) return 'La imagen es muy pequeña.';
    if (img.size && img.size > maxBytes) return 'El archivo supera 8MB.';
    return null;
  };

  return { pickFromLibrary, takePhoto, validateImage };
}
