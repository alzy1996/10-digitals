// Offscreen thumbnail renderer for Look cards and Compare (memory only, wiped with the session).
import { createRenderer } from '../ai/index.js';
import { lookCrop } from './useStage.js';

let shared = null;

function getRenderer(data) {
  if (!shared || shared.key !== data.version) {
    shared?.renderer.dispose();
    const canvas = document.createElement('canvas');
    const renderer = createRenderer(canvas);
    renderer.setSource(data.display.data, data.display.width, data.display.height);
    renderer.setAuxAll(data.aux);
    shared = { key: data.version, renderer, canvas };
  }
  return shared;
}

export function disposeThumbs() {
  shared?.renderer.dispose();
  shared = null;
}

/** Render one look and return a JPEG data URL of the 4:5 crop (width px). */
export function renderThumb(data, params, width = 480, overlay) {
  const { renderer, canvas } = getRenderer(data);
  renderer.draw(params);
  const crop = lookCrop(data.renderData);
  const out = document.createElement('canvas');
  out.width = width;
  out.height = Math.round(width * 1.25);
  const ctx = out.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, crop.x, crop.y, crop.w, crop.h, 0, 0, out.width, out.height);
  if (overlay) overlay(ctx, crop, out.width / crop.w);
  return out.toDataURL('image/jpeg', 0.86);
}

/** Full-size render to a 2D canvas (Agreement, AI guide). */
export function renderFull(data, params) {
  const { renderer, canvas } = getRenderer(data);
  renderer.draw(params);
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  out.getContext('2d').drawImage(canvas, 0, 0);
  return out;
}
