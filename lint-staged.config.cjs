// lint-staged.config.cjs
module.exports = {
  '*.{js,jsx}': ['eslint --fix', 'prettier --write'],
  '*.{ts,tsx}': [
    'eslint --fix',
    'prettier --write',
    // Ejecuta tsc por proyecto (usando tsconfig), sin pasar archivos
    () => 'tsc -p tsconfig.json --noEmit --pretty false',
  ],
  '*.{json,md,yml,yaml}': ['prettier --write'],
}
