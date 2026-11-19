import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sutichung.taiwanstockhunter',
  appName: '泰丞・台股 AI 智慧操盤中樞',
  webDir: 'build',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#080d18',
      showSpinner: false
    }
  }
};

export default config;
