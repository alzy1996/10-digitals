// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bandsFromAgeClasses, parseAgeLabel, canLoadAgeModel, AGE_BANDS } from '../../src/ai/models/age.js';
import { isIOS, isMobile, isDesktop, isUnmetered } from '../../src/ai/models/platform.js';
import {
  ORT_WEB_VERSION,
  AGE_MODEL,
  FACE_LANDMARKER,
  SELFIE_MULTICLASS,
  MP_WASM_CDN,
  FIRST_LOAD_MODEL_BYTES,
  ortWasmBase,
} from '../../src/ai/models/cdn.js';

const readJson = (rel) => JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'));

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  ipados: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};

describe('FairFace age classes -> LIHYA bands (PRD 5.7)', () => {
  it('parses the label formats', () => {
    expect(parseAgeLabel('0-2')).toEqual([0, 3]);
    expect(parseAgeLabel('20-29')).toEqual([20, 30]);
    expect(parseAgeLabel('more than 70')).toEqual([70, 90]);
    expect(parseAgeLabel('70+')).toEqual([70, 90]);
    expect(parseAgeLabel('LABEL_x')).toBeNull();
  });

  it('splits a class over the bands it overlaps', () => {
    const { probs, band, confidence } = bandsFromAgeClasses([{ label: '20-29', score: 1 }]);
    expect(probs['18-24']).toBeCloseTo(0.5, 10);
    expect(probs['25-34']).toBeCloseTo(0.5, 10);
    expect(confidence).toBe(0.5);
    expect(AGE_BANDS).toContain(band);
  });

  it('pre-selects a band only at 0.5 or more', () => {
    const sure = bandsFromAgeClasses([
      { label: '40-49', score: 0.3 },
      { label: '50-59', score: 0.1 },
      { label: '60-69', score: 0.6 },
    ]);
    expect(sure.band).toBe('55+');
    expect(sure.confidence).toBeCloseTo(0.65, 2);
    const unsure = bandsFromAgeClasses([
      { label: '30-39', score: 0.2 },
      { label: '40-49', score: 0.7 },
      { label: '50-59', score: 0.1 },
    ]);
    expect(unsure.band).toBeNull();
    expect(unsure.confidence).toBeLessThan(0.5);
  });

  it('folds teen-age mass into the youngest band and sums to 1', () => {
    const res = bandsFromAgeClasses([
      { label: '10-19', score: 0.6 },
      { label: '20-29', score: 0.4 },
    ]);
    expect(res.band).toBe('18-24');
    expect(res.probs['18-24']).toBeCloseTo(0.8, 10);
    const sum = Object.values(res.probs).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it('returns no band for empty output', () => {
    expect(bandsFromAgeClasses([]).band).toBeNull();
    expect(bandsFromAgeClasses(null).band).toBeNull();
  });
});

describe('Wi-Fi only loading', () => {
  it('blocks cellular, data saver and offline', () => {
    expect(canLoadAgeModel({ userAgent: UA.android, onLine: true, connection: { type: 'cellular' } })).toBe(false);
    expect(canLoadAgeModel({ userAgent: UA.android, onLine: true, connection: { type: 'wifi', saveData: true } })).toBe(false);
    expect(canLoadAgeModel({ userAgent: UA.desktop, onLine: false })).toBe(false);
  });

  it('allows Wi-Fi and ethernet', () => {
    expect(canLoadAgeModel({ userAgent: UA.android, onLine: true, connection: { type: 'wifi' } })).toBe(true);
    expect(canLoadAgeModel({ userAgent: UA.desktop, onLine: true, connection: { type: 'ethernet' } })).toBe(true);
  });

  it('treats an unknown link as unmetered on desktop only', () => {
    expect(canLoadAgeModel({ userAgent: UA.desktop, onLine: true })).toBe(true);
    expect(canLoadAgeModel({ userAgent: UA.desktop, onLine: true, connection: { effectiveType: '4g' } })).toBe(true);
    expect(canLoadAgeModel({ userAgent: UA.iphone, onLine: true })).toBe(false);
    expect(canLoadAgeModel({ userAgent: UA.android, onLine: true, connection: { effectiveType: '4g' } })).toBe(false);
  });
});

describe('platform detection', () => {
  it('detects iPhone and iPadOS (desktop user agent with touch)', () => {
    expect(isIOS({ userAgent: UA.iphone })).toBe(true);
    expect(isIOS({ userAgent: UA.ipados, platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true);
    expect(isIOS({ userAgent: UA.ipados, platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false);
    expect(isIOS({ userAgent: UA.android })).toBe(false);
  });

  it('tells phones from desktops', () => {
    expect(isMobile({ userAgent: UA.android })).toBe(true);
    expect(isDesktop({ userAgent: UA.desktop })).toBe(true);
    expect(isDesktop({ userAgent: UA.ipados, platform: 'MacIntel', maxTouchPoints: 5 })).toBe(false);
    expect(isUnmetered({ userAgent: UA.ipados, platform: 'MacIntel', maxTouchPoints: 5, onLine: true })).toBe(false);
  });
});

describe('pinned model and runtime URLs', () => {
  it('pins onnxruntime-web to the version transformers.js was built against', () => {
    const ort = readJson('../../node_modules/onnxruntime-web/package.json');
    const tf = readJson('../../node_modules/@huggingface/transformers/package.json');
    expect(ORT_WEB_VERSION).toBe(ort.version);
    expect(ORT_WEB_VERSION).toBe(tf.dependencies['onnxruntime-web']);
    expect(ortWasmBase()).toBe(`https://cdn.jsdelivr.net/npm/onnxruntime-web@${ort.version}/dist/`);
  });

  it('pins MediaPipe to the installed version and the official model files', () => {
    const mp = readJson('../../node_modules/@mediapipe/tasks-vision/package.json');
    expect(MP_WASM_CDN).toBe(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${mp.version}/wasm`);
    expect(FACE_LANDMARKER.url).toBe(
      'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
    );
    expect(SELFIE_MULTICLASS.url).toBe(
      'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite',
    );
    expect(FIRST_LOAD_MODEL_BYTES).toBe(3758596 + 16371837);
    expect(FIRST_LOAD_MODEL_BYTES).toBeLessThan(30 * 1024 * 1024);
  });

  it('uses the Apache-2.0 FairFace export with q4 weights', () => {
    expect(AGE_MODEL).toMatchObject({ id: 'onnx-community/fairface_age_image_detection-ONNX', dtype: 'q4', license: 'Apache-2.0' });
  });
});
