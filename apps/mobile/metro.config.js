/* eslint-env node */
/* eslint-disable @typescript-eslint/no-var-requires */

const path = require('path');

const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname; // apps/mobile
const workspaceRoot = path.resolve(projectRoot, '../..'); // repo root

const config = getDefaultConfig(projectRoot);

// ✅ IMPORTANTE: no pisar defaults, solo agregar el workspaceRoot
config.watchFolders = [...(config.watchFolders ?? []), workspaceRoot];

// ✅ Mantener priorización del node_modules del proyecto
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// ✅ Expo doctor espera false. Mejor no tocarlo; lo dejamos explícito en false.
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
