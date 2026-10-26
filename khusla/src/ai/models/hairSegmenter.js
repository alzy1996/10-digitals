// MediaPipe hair_segmenter: a finer hair confidence used together with the multiclass mask.
import { MODELS } from './cdn.js';
import { fileset, segmenterDelegate, vision } from './vision.js';

const instances = {};

async function create(mode) {
  const v = await vision();
  const fs = await fileset();
  return v.ImageSegmenter.createFromOptions(fs, {
    baseOptions: { modelAssetPath: MODELS.hair, delegate: segmenterDelegate() },
    runningMode: mode,
    outputCategoryMask: false,
    outputConfidenceMasks: true,
  });
}

export async function getHairSegmenter(mode = 'IMAGE') {
  if (!instances[mode]) instances[mode] = create(mode);
  return instances[mode];
}

function pick(res) {
  const masks = res.confidenceMasks || [];
  const m = masks[masks.length > 1 ? 1 : 0];
  const out = m ? { width: m.width, height: m.height, conf: Float32Array.from(m.getAsFloat32Array()) } : null;
  masks.forEach((x) => x.close());
  return out;
}

export async function segmentHair(image) {
  const s = await getHairSegmenter('IMAGE');
  return pick(s.segment(image));
}

export async function segmentHairVideo(video, ts) {
  const s = await getHairSegmenter('VIDEO');
  return pick(s.segmentForVideo(video, ts));
}
