/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  extends: ['@commitlint/config-conventional'],

  // Opcional: endurecemos tipos/alcances para que todo quede prolijo
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'style',
        'refactor',
        'perf',
        'test',
        'build',
        'ci',
        'chore',
        'revert',
      ],
    ],
    // Limita scopes para tu monorepo (ajústalos si sumás paquetes)
    'scope-enum': [2, 'always', ['backend', 'mobile', 'repo', 'deps', 'release']],
    'subject-case': [2, 'never', ['sentence-case', 'start-case', 'pascal-case', 'upper-case']],
    'subject-empty': [2, 'never'],
    'header-max-length': [2, 'always', 100],
  },
}
