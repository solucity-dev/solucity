// lint-staged.config.cjs

function norm(p) {
  return String(p).replace(/\\/g, '/');
}

function isExcluded(file) {
  const f = norm(file);
  return (
    f.endsWith('/apps/mobile/metro.config.js') ||
    f.endsWith('/apps/mobile/babel.config.js') ||
    f.endsWith('/apps/mobile/test-env.cjs')
  );
}

function quote(files) {
  return files.map((f) => `"${f}"`).join(' ');
}

module.exports = {
  '*.{js,jsx}': (files) => {
    const filtered = files.filter((f) => !isExcluded(f));

    // ✅ Si no queda ninguno, NO hacemos nada (evita prettier sin archivos)
    if (filtered.length === 0) return ['node -e "process.exit(0)"'];

    return [`eslint --fix ${quote(filtered)}`, `prettier --write ${quote(filtered)}`];
  },

  'apps/mobile/**/*.{ts,tsx}': [
    'eslint --fix',
    'prettier --write',
    () => 'pnpm --filter @solucity/mobile typecheck',
  ],

  'apps/backend/**/*.ts': [
    'eslint --fix',
    'prettier --write',
    () => 'pnpm --filter @solucity/backend typecheck',
  ],

  '*.{json,md,yml,yaml}': ['prettier --write'],
};
