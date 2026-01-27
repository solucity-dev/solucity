/* eslint-env node */
/* eslint-disable @typescript-eslint/no-var-requires */

const path = require('path');

const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname; // apps/mobile
const workspaceRoot = path.resolve(projectRoot, '../..'); // solucity/

const config = getDefaultConfig(projectRoot);

// Ver monorepo
config.watchFolders = [workspaceRoot];

// MUY IMPORTANTE: primero node_modules del app móvil, luego el de la raíz.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Evita que Metro suba por el arbol y tome paquetes erróneos
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
