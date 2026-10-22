const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Find the project and monorepo workspace roots
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files in the monorepo (packages/shared, etc.)
config.watchFolders = [monorepoRoot];

// 2. Let Metro know where to resolve packages in monorepo
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules')
];

// 3. Resolve @quickcut/shared directly
config.resolver.extraNodeModules = {
  '@quickcut/shared': path.resolve(monorepoRoot, 'packages/shared')
};

module.exports = config;
