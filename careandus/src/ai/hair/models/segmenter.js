// MediaPipe Image Segmenter, selfie_multiclass_256x256.
// Classes: 0 background, 1 hair, 2 body-skin, 3 face-skin, 4 clothes, 5 others.
import { MODELS } from './cdn.js';
import { fileset, segmenterDelegate, vision } from './vision.js';

const instances = {};
let forceCpu = false;

async function create(mode) {
  const v = await vision();
  const fs = await fileset();
  return v.ImageSegmenter.createFromOptions(fs, {
    baseOptions: { modelAssetPath: MODELS.multiclass, delegate: forceCpu ? 'CPU' : segmenterDelegate() },
    runningMode: mode,
    outputCategoryMask: true,
    outputConfidenceMasks: true,
  });
}

export async function getSegmenter(mode = 'IMAGE') {
  if (!instances[mode]) instances[mode] = create(mode);
  return instances[mode];
}

/** After a failed class self-test: rebuild every segmenter on the CPU delegate. */
export async function fallbackToCpu() {
  forceCpu = true;
  for (const k of Object.keys(instances)) {
    try {
      (await instances[k]).close();
    } catch {
      // already closed
    }
    delete instances[k];
  }
}

export function usingCpu() {
  return forceCpu;
}

function copyResult(res) {
  const cat = res.categoryMask;
  const out = {
    width: cat.width,
    height: cat.height,
    labels: Uint8Array.from(cat.getAsUint8Array()),
    hairConf: res.confidenceMasks?.[1] ? Float32Array.from(res.confidenceMasks[1].getAsFloat32Array()) : null,
  };
  cat.close();
  res.confidenceMasks?.forEach((m) => m.close());
  return out;
}

export async function segmentImage(image) {
  const s = await getSegmenter('IMAGE');
  return copyResult(s.segment(image));
}

export async function segmentVideo(video, ts) {
  const s = await getSegmenter('VIDEO');
  return copyResult(s.segmentForVideo(video, ts));
}
