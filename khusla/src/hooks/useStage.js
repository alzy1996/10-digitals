// Shared helpers to get the current photo + render inputs (original or Quick-shortened).
import { useSession } from './useSession.jsx';

export function useStageData() {
  const session = useSession();
  const a = session.heavy.analysis;
  if (!a) return null;
  const s = session.heavy.shortened;
  return {
    profile: session.profile || a.profile,
    renderData: a.renderData,
    aux: s ? { ...a.aux, aux1: s.aux1 } : a.aux,
    display: s ? { ...a.display, data: s.data } : a.display,
    shortened: Boolean(s),
    version: session.heavyVersion,
  };
}

/** 4:5 crop around her head and shoulders, in image pixels. */
export function lookCrop(rd) {
  const p = rd.pts;
  const faceLen = p[152][1] - (rd.hairlineY ?? p[10][1]);
  let h = Math.min(rd.height, faceLen * 3.4);
  let w = h * 0.8;
  if (w > rd.width) {
    w = rd.width;
    h = w / 0.8;
  }
  const x = Math.max(0, Math.min(rd.width - w, p[10][0] - w / 2));
  const y = Math.max(0, Math.min(rd.height - h, (rd.topY || p[10][1] - faceLen * 0.3) - faceLen * 0.25));
  return { x, y, w, h };
}
