const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Extends app.json. A release APK refuses plain http by default, so a test
 * build that talks to a local API (http://192.168.x.x:3001/api) would only
 * ever show "Pas de connexion". Cleartext is allowed only when the API URL
 * the build is made with is http; an https API keeps Android's default.
 */
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3001/api';

const withCleartextTraffic = (config) =>
  withAndroidManifest(config, (mod) => {
    mod.modResults.manifest.application[0].$['android:usesCleartextTraffic'] = 'true';
    return mod;
  });

module.exports = ({ config }) =>
  API_URL.startsWith('http://') ? withCleartextTraffic(config) : config;
