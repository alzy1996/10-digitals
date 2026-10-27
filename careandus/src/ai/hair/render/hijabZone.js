// Hijab visible-zone overlay (PRD 7.8): a soft line drawing of a loosely worn shayla fitted to her
// hairline, temples, jaw and shoulders. Never a photoreal hijab. The shader dims covered hair to 30%.
import { faceGeometry } from './silhouette.js';

export function shaylaPath(rd) {
  const g = faceGeometry(rd);
  const p = rd.pts;
  const hairY = rd.hairlineY ?? p[10][1];
  const inset = g.faceLen * 0.06;
  const front = hairY - inset * 0.4; // the shayla edge sits just behind the hairline
  const lx = g.leftX - g.faceLen * 0.12;
  const rx = g.rightX + g.faceLen * 0.12;
  const outerL = g.midX - g.headW * 0.78;
  const outerR = g.midX + g.headW * 0.78;
  const topOuter = g.topY - g.faceLen * 0.12;
  const sh = g.shoulderY;
  const inner = [
    `M ${lx} ${g.jawY + g.faceLen * 0.1}`,
    `C ${lx - inset} ${g.earY} ${g.leftX} ${front} ${g.midX} ${front}`,
    `C ${g.rightX} ${front} ${rx + inset} ${g.earY} ${rx} ${g.jawY + g.faceLen * 0.1}`,
  ].join(' ');
  const outer = [
    `M ${outerL - g.faceLen * 0.25} ${sh + g.faceLen * 0.35}`,
    `C ${outerL - g.faceLen * 0.1} ${g.chinY} ${outerL} ${topOuter + g.faceLen * 0.2} ${g.midX} ${topOuter}`,
    `C ${outerR} ${topOuter + g.faceLen * 0.2} ${outerR + g.faceLen * 0.1} ${g.chinY} ${outerR + g.faceLen * 0.25} ${sh + g.faceLen * 0.35}`,
  ].join(' ');
  const drape = `M ${lx} ${g.jawY + g.faceLen * 0.1} Q ${g.midX} ${g.chinY + g.faceLen * 0.45} ${rx} ${g.jawY + g.faceLen * 0.1}`;
  return { inner, outer, drape };
}
