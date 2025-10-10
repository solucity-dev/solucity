module.exports = {
  '*.{js,jsx}': ['eslint --fix', 'prettier --write'],

  // MOBILE: corre eslint/prettier por archivo y el typecheck SIN pasar paths
  'apps/mobile/**/*.{ts,tsx}': [
    'eslint --fix',
    'prettier --write',
    () => 'pnpm --filter @solucity/mobile typecheck',
  ],

  // BACKEND: idem
  'apps/backend/**/*.ts': [
    'eslint --fix',
    'prettier --write',
    () => 'pnpm --filter @solucity/backend typecheck',
  ],

  '*.{json,md,yml,yaml}': ['prettier --write'],
}
