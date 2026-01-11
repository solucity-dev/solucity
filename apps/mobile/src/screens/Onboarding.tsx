// apps/mobile/src/screens/Onboarding.tsx
import { Asset } from 'expo-asset';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type FlatListProps,
  type ImageSourcePropType,
  type ViewToken,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import Img1 from '../assets/onboarding-1.png';
import Img2 from '../assets/onboarding-2.png';
import Img3 from '../assets/onboarding-3.png';

type OnboardingProps = { onFinish: () => void };

type Slide = {
  key: string;
  image: ImageSourcePropType;
  h1: string;
  h2?: string;
  body?: string;
  cta: string;
};

const SLIDES: Slide[] = [
  {
    key: 's1',
    image: Img1,
    h1: 'Encontrá especialistas',
    h2: 'en tu zona.',
    body: 'Electricistas, plomeros, carpinteros y más, al alcance de tu mano.',
    cta: 'SIGUIENTE',
  },
  {
    key: 's2',
    image: Img2,
    h1: 'Contactá en minutos.',
    body: 'Chateá con especialistas, acordá precio y horario sin vueltas.',
    cta: 'SIGUIENTE',
  },
  {
    key: 's3',
    image: Img3,
    h1: 'Soluciones seguras.',
    body: 'Especialistas verificados, calificados por otros clientes.',
    cta: 'COMENZAR',
  },
];

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ITEM_LENGTH = SCREEN_WIDTH;
const IMG_WIDTH = SCREEN_WIDTH * 0.7; // 70% del ancho de pantalla

export default function Onboarding({ onFinish }: OnboardingProps) {
  const [index, setIndex] = useState(0);
  const [assetsReady, setAssetsReady] = useState(false);
  const listRef = useRef<FlatList<Slide>>(null);
  const insets = useSafeAreaInsets();

  // ✅ Precarga de assets (evita “tardan en cargar”)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await Promise.all([
          Asset.fromModule(Img1).downloadAsync(),
          Asset.fromModule(Img2).downloadAsync(),
          Asset.fromModule(Img3).downloadAsync(),
        ]);
      } catch (e) {
        // Si falla la precarga, igual dejamos continuar (no bloqueamos onboarding)
        console.log('[onboarding preload] error', e);
      } finally {
        if (mounted) setAssetsReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems[0]?.index != null) setIndex(viewableItems[0].index);
  });

  const viewConfigRef = useRef({ viewAreaCoveragePercentThreshold: 60 });

  const getItemLayout = useCallback<NonNullable<FlatListProps<Slide>['getItemLayout']>>(
    (_: ArrayLike<Slide> | null | undefined, i: number) => ({
      length: ITEM_LENGTH,
      offset: ITEM_LENGTH * i,
      index: i,
    }),
    [],
  );

  const goNext = useCallback(() => {
    if (index < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({ index: index + 1, animated: true });
    } else {
      onFinish();
    }
  }, [index, onFinish]);

  return (
    <LinearGradient colors={['#015A69', '#16A4AE']} style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* ✅ Loader corto mientras se precargan imágenes */}
        {!assetsReady ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator />
            <Text style={styles.loadingText}>Cargando…</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={SLIDES}
            keyExtractor={(it) => it.key}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onViewableItemsChanged={onViewableItemsChanged.current}
            viewabilityConfig={viewConfigRef.current}
            getItemLayout={getItemLayout}
            // ✅ performance: NO renderizar los 3 de golpe
            initialNumToRender={1}
            maxToRenderPerBatch={1}
            windowSize={3}
            updateCellsBatchingPeriod={40}
            removeClippedSubviews
            decelerationRate="fast"
            renderItem={({ item }) => (
              <View style={styles.slide}>
                <View style={styles.slideContent}>
                  <Image
                    source={item.image}
                    resizeMode="contain"
                    style={styles.image}
                    fadeDuration={150} // ✅ Android: suave al aparecer
                    accessible
                    accessibilityRole="image"
                  />
                  <View style={styles.textBox}>
                    <Text style={styles.title}>
                      <Text style={styles.titleBold}>{item.h1}</Text>
                      {item.h2 ? `\n${item.h2}` : ''}
                    </Text>
                    {!!item.body && <Text style={styles.body}>{item.body}</Text>}
                  </View>
                </View>
              </View>
            )}
          />
        )}

        {/* Footer con safe area */}
        <View style={[styles.footer, { paddingBottom: Math.max(14, insets.bottom + 8) }]}>
          <View style={styles.dots}>
            {SLIDES.map((_, i) => (
              <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
            ))}
          </View>

          <Pressable
            onPress={goNext}
            style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }]}
            accessibilityRole="button"
          >
            <Text style={styles.ctaText}>{SLIDES[index].cta}</Text>
          </Pressable>

          <Pressable onPress={onFinish} style={styles.skip} accessibilityRole="button">
            <Text style={styles.skipText}>Omitir</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },

  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: { color: 'rgba(255,255,255,0.9)', fontWeight: '800' },

  slide: {
    width: SCREEN_WIDTH,
    flex: 1,
  },
  slideContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },

  image: {
    width: IMG_WIDTH,
    height: IMG_WIDTH * 0.9,
    alignSelf: 'center',
    marginBottom: 20,
  },

  textBox: { marginTop: 8, alignItems: 'center', paddingHorizontal: 6 },
  title: { color: '#fff', fontSize: 28, lineHeight: 34, textAlign: 'center', fontWeight: '700' },
  titleBold: { fontWeight: '800' },
  body: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 8,
  },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  dots: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 10 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.45)' },
  dotActive: { backgroundColor: '#fff', width: 10, height: 10 },
  cta: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 18,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: '#0B6B76', fontWeight: '800', letterSpacing: 0.5, fontSize: 16 },
  skip: { alignSelf: 'center', marginTop: 6 },
  skipText: { color: 'rgba(255,255,255,0.92)' },
});
