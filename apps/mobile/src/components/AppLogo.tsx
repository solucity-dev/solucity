import {
  Image,
  Platform,
  type ImageResizeMode,
  type ImageStyle,
  type StyleProp,
} from 'react-native';

type Props = {
  style?: StyleProp<ImageStyle>;
  resizeMode?: ImageResizeMode;
};

export default function AppLogo({ style, resizeMode = 'contain' }: Props) {
  const source =
    Platform.OS === 'web'
      ? require('../../assets/splash-logo.png')
      : require('../../assets/logo.png');

  return <Image source={source} style={style} resizeMode={resizeMode} />;
}
