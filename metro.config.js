const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Watch monorepo root and workspaces
config.watchFolders = [__dirname];

// Resolve node_modules from root and workspace packages
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(__dirname, 'apps/customer/node_modules'),
  path.resolve(__dirname, 'apps/staff/node_modules')
];

// Direct alias for shared monorepo package
config.resolver.extraNodeModules = {
  '@quickcut/shared': path.resolve(__dirname, 'packages/shared')
};

module.exports = config;
