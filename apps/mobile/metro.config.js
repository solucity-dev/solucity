// apps/mobile/metro.config.js
const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname // apps/mobile
const workspaceRoot = path.resolve(projectRoot, '../..') // solucity/

const config = getDefaultConfig(projectRoot)

// Ver monorepo
config.watchFolders = [workspaceRoot]

// MUY IMPORTANTE: primero node_modules del app móvil, luego el de la raíz.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]

// Evita que Metro suba por el arbol y tome paquetes erróneos
config.resolver.disableHierarchicalLookup = true

module.exports = config
