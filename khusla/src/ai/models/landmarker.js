// MediaPipe Face Landmarker: 478 landmarks incl. iris, plus the facial transformation matrix.
import { MODELS } from './cdn.js';
import { fileset, vision } from './vision.js';

const instances = {};

async function create(mode, delegate) {
  const v = await vision();
  const fs = await fileset();
  return v.FaceLandmarker.createFromOptions(fs, {
    baseOptions: { modelAssetPath: MODELS.faceLandmarker, delegate },
    runningMode: mode,
    numFaces: 1,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: true,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

export async function getLandmarker(mode = 'IMAGE') {
  if (!instances[mode]) {
    instances[mode] = create(mode, 'GPU').catch(() => create(mode, 'CPU'));
  }
  return instances[mode];
}

/** Yaw, pitch, roll in degrees from the 4×4 column-major facial transformation matrix. */
export function poseFromMatrix(m) {
  if (!m) return { yaw: 0, pitch: 0, roll: 0 };
  const d = m.data || m;
  // forward axis = third column, up axis = second column
  const fx = d[8];
  const fy = d[9];
  const fz = d[10];
  const yaw = (Math.atan2(fx, fz) * 180) / Math.PI;
  const pitch = (Math.atan2(-fy, Math.hypot(fx, fz)) * 180) / Math.PI;
  const roll = (Math.atan2(d[1], d[5]) * 180) / Math.PI;
  return { yaw, pitch, roll };
}

export async function detectImage(image) {
  const lm = await getLandmarker('IMAGE');
  const res = lm.detect(image);
  if (!res.faceLandmarks?.length) return null;
  return {
    landmarks: res.faceLandmarks[0],
    pose: poseFromMatrix(res.facialTransformationMatrixes?.[0]),
  };
}

export async function detectVideo(video, ts) {
  const lm = await getLandmarker('VIDEO');
  const res = lm.detectForVideo(video, ts);
  if (!res.faceLandmarks?.length) return null;
  return {
    landmarks: res.faceLandmarks[0],
    pose: poseFromMatrix(res.facialTransformationMatrixes?.[0]),
  };
}
