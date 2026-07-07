import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.robeltsefaye.fittrackpro',
  appName: 'FitTrack Pro',
  webDir: 'public',
  server: {
    // Points the native shell at your live Next.js deployment instead of
    // bundling static files — needed because this app has server routes
    // (API endpoints, Prisma, NextAuth) that can't be statically exported.
    url: 'https://fittrack-pro-ashen.vercel.app',
    cleartext: false,
  },
  ios: {
    contentInset: 'automatic',
  },
};

export default config;
