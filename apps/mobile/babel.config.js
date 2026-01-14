// apps/mobile/babel.config.js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
          alias: {
            '@': './src',
            '@api': './src/api',
            '@hooks': './src/hooks',
            '@types': './src/types',
            '@screens': './src/screens',
            '@components': './src/components',
            '@assets': './src/assets',
            '@lib': './src/lib',
          },
        },
      ],
      // (opcional) si usás reanimated:
      // 'react-native-reanimated/plugin',
    ],
  };
};
