import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.microsolution.kwaiter3',
  appName: 'K-Waiter 3',
  webDir: 'dist',
  bundledWebRuntime: false,
  ios: {
    backgroundColor: '#f3f7f4',
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
  },
};

export default config;
