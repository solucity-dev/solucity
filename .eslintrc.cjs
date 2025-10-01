/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'react', 'react-hooks', 'react-native'],
  extends: [
    'universe/native',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
    'prettier',
  ],
  parserOptions: { ecmaVersion: 2021, sourceType: 'module' },
  settings: { react: { version: 'detect' } },
  ignorePatterns: ['node_modules/', 'dist/', 'web-build/', '.expo/'],
}
