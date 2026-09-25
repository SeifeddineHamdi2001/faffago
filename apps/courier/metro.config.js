// Expo detects the pnpm monorepo and watches the workspace (packages/shared).
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
