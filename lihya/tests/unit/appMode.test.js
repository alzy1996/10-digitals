import { describe, expect, it } from 'vitest';
import {
  DEMO_FIREBASE_CONFIG,
  DEMO_SHOP,
  DEMO_USER,
  demoAppName,
  hasCompleteConfig,
  parseDemoGeneration,
  resolveMode,
} from '../../src/lib/appMode.js';

// Which backend a build runs against (src/lib/appMode.js). The GitHub Pages build without
// the Firebase secrets must be the demo; adding the secrets must switch the same link to the
// real app; the emulators are never the demo.

describe('resolveMode', () => {
  it('production build without a Firebase config is the demo (the Pages link before the secrets)', () => {
    expect(resolveMode({ prod: true, hasRealConfig: false, usingEmulators: false })).toEqual({
      mode: 'demo',
      demo: true,
      configured: true,
    });
  });

  it('production build with the Firebase config is the real app', () => {
    expect(resolveMode({ prod: true, hasRealConfig: true, usingEmulators: false })).toEqual({
      mode: 'firebase',
      demo: false,
      configured: true,
    });
  });

  it('the emulators are never the demo, whatever the other values', () => {
    for (const prod of [true, false]) {
      for (const hasRealConfig of [true, false]) {
        for (const demoFlag of [true, 'true', false, 'false', null, undefined, '']) {
          const m = resolveMode({ prod, hasRealConfig, usingEmulators: true, demoFlag });
          expect(m).toEqual({ mode: 'emulators', demo: false, configured: true });
        }
      }
    }
  });

  it('VITE_DEMO_MODE=true forces the demo, also with a real config and in development', () => {
    expect(resolveMode({ prod: false, hasRealConfig: false, demoFlag: 'true' }).mode).toBe('demo');
    expect(resolveMode({ prod: false, hasRealConfig: true, demoFlag: 'true' }).mode).toBe('demo');
    expect(resolveMode({ prod: true, hasRealConfig: true, demoFlag: true }).mode).toBe('demo');
  });

  it('VITE_DEMO_MODE=false turns the production fallback off (setup notice)', () => {
    expect(resolveMode({ prod: true, hasRealConfig: false, demoFlag: 'false' })).toEqual({
      mode: 'none',
      demo: false,
      configured: false,
    });
    expect(resolveMode({ prod: true, hasRealConfig: true, demoFlag: 'false' }).mode).toBe('firebase');
  });

  it('a development build without config shows the setup notice, as before', () => {
    expect(resolveMode({ prod: false, hasRealConfig: false, usingEmulators: false })).toEqual({
      mode: 'none',
      demo: false,
      configured: false,
    });
    expect(resolveMode()).toEqual({ mode: 'none', demo: false, configured: false });
  });

  it('only the exact flag values count; an empty secret is "not set"', () => {
    for (const demoFlag of ['', 'TRUE', '1', 'yes', 0, 1]) {
      expect(resolveMode({ prod: false, demoFlag }).mode).toBe('none');
      expect(resolveMode({ prod: true, hasRealConfig: true, demoFlag }).mode).toBe('firebase');
      expect(resolveMode({ prod: true, demoFlag }).mode).toBe('demo');
    }
  });
});

describe('hasCompleteConfig', () => {
  it('needs apiKey, projectId and appId', () => {
    expect(hasCompleteConfig({ apiKey: 'k', projectId: 'p', appId: 'a', authDomain: '' })).toBe(true);
    expect(hasCompleteConfig({ apiKey: 'k', projectId: 'p', appId: '' })).toBe(false);
    expect(hasCompleteConfig({ apiKey: '', projectId: 'p', appId: 'a' })).toBe(false);
    expect(hasCompleteConfig({ apiKey: 'k', projectId: '', appId: 'a' })).toBe(false);
    expect(hasCompleteConfig(null)).toBe(false);
    expect(hasCompleteConfig({})).toBe(false);
  });
});

describe('demo constants', () => {
  it('the demo user is a verified, non-anonymous owner without a token', async () => {
    expect(DEMO_USER).toMatchObject({
      uid: 'demo-owner',
      email: 'demo@lihya.app',
      displayName: 'Demo',
      isAnonymous: false,
      emailVerified: true,
    });
    expect(DEMO_USER.providerData).toEqual([]);
    expect(await DEMO_USER.getIdToken()).toBeNull();
    expect(Object.isFrozen(DEMO_USER)).toBe(true);
  });

  it('the dummy web config and the demo shop', () => {
    expect(DEMO_FIREBASE_CONFIG).toEqual({
      apiKey: 'demo-key',
      authDomain: 'lihya-demo.local',
      projectId: 'lihya-demo',
      appId: '1:0:web:lihya-demo',
    });
    expect(DEMO_SHOP).toEqual({ name: 'LIHYA Demo Barbers', nameAr: 'صالون لحية التجريبي', whatsapp: '' });
  });

  it('demo generations: Reset demo moves to a fresh local database', () => {
    expect(parseDemoGeneration(null)).toBe(1);
    expect(parseDemoGeneration('')).toBe(1);
    expect(parseDemoGeneration('abc')).toBe(1);
    expect(parseDemoGeneration('0')).toBe(1);
    expect(parseDemoGeneration('-4')).toBe(1);
    expect(parseDemoGeneration('3')).toBe(3);
    expect(demoAppName(1)).toBe('lihya-demo-1');
    expect(demoAppName(2)).not.toBe(demoAppName(1));
    expect(demoAppName(0)).toBe('lihya-demo-1');
    expect(demoAppName('x')).toBe('lihya-demo-1');
  });
});
