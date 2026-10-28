// One visit, several services (hair + nails + beard): the lines of the combined
// Agreement Card. Pure, so it is unit-tested. Prices come only from the salon's list.
import BEARD_STYLES from '../data/beard/styles.json';

const STATUS_ORDER = { done: 0, approved: 1, draft: 2, cancelled: 3 };

/**
 * consultations: the visit's consultations (any order).
 * ctx: { t, name, catalog (hair, merged), polishes [{id,name,nameAr,hex}], products [{id,name,nameAr,priceOmr}] }
 * Returns { services: [{ section, status, approved, lines: [string], priceItems: [{label, priceOmr}] }], totalOmr }.
 */
export function visitSummary(consultations, ctx) {
  const { t, name } = ctx;
  const productsById = new Map((ctx.products || []).map((p) => [p.id, p]));
  const polishesById = new Map((ctx.polishes || []).map((p) => [p.id, p]));
  const list = [...(consultations || [])]
    .filter((c) => c.status !== 'cancelled')
    .sort((a, b) => ['hair', 'nails', 'beard'].indexOf(a.section) - ['hair', 'nails', 'beard'].indexOf(b.section) || STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  let total = 0;
  const services = list.map((c) => {
    const p = c.params || {};
    const lines = [];
    if (c.section === 'hair') {
      const cut = ctx.catalog?.cuts?.find((x) => x.id === p.cutId);
      const shade = ctx.catalog?.shades?.find((x) => x.id === p.shadeId);
      if (cut) lines.push(`${t('visit.cut')}: ${name(cut.name)}`);
      if (shade) lines.push(`${t('visit.color')}: ${name(shade.name)}${p.technique && p.technique !== 'global' ? ` · ${p.technique}` : ''}`);
      if (c.agreement?.lengthDryCm) lines.push(`${t('visit.lengthDry')}: ${c.agreement.lengthDryCm} cm`);
    } else if (c.section === 'nails') {
      const paintLabel = (paint) => {
        const pol = paint?.polishId ? polishesById.get(paint.polishId) : null;
        return `${pol ? name({ en: pol.name, ar: pol.nameAr }) : paint?.hex || ''} · ${t(`nails.finish_${paint?.finish}`)}`;
      };
      if (p.base) lines.push(`${t('nails.all_nails')}: ${paintLabel(p.base)}`);
      for (const [finger, paint] of Object.entries(p.perFinger || {})) lines.push(`${t(`nails.finger_${finger}`)}: ${paintLabel(paint)}`);
      if (p.shape) lines.push(`${t('nails.shape')}: ${t(`nails.shape_${p.shape}`)}`);
      if (p.art && p.art !== 'none') lines.push(`${t('nails.art')}: ${t(`nails.art_${p.art}`)}`);
    } else if (c.section === 'beard') {
      const style = BEARD_STYLES.find((s) => s.id === p.styleId);
      if (style) lines.push(`${t('visit.style')}: ${name(style.name)}`);
      const guards = c.cutCard?.guards || {};
      const g = Object.entries(guards).map(([z, v]) => `${z} ${v}`).join(' · ');
      if (g) lines.push(`${t('visit.guards')}: ${g}`);
      if (c.cutCard?.necklineMm != null) lines.push(`${t('visit.neckline')}: ${c.cutCard.necklineMm} mm`);
    }
    const priceItems = (c.agreement?.priceItems || [])
      .map((id) => productsById.get(id))
      .filter(Boolean)
      .map((prod) => ({ label: name({ en: prod.name, ar: prod.nameAr }), priceOmr: Number(prod.priceOmr) || 0 }));
    for (const it of priceItems) total += it.priceOmr;
    return {
      id: c.id,
      section: c.section || 'hair',
      status: c.status,
      approved: Boolean(c.approvals?.customerAt && c.approvals?.stylistAt),
      lines,
      priceItems,
    };
  });
  return { services, totalOmr: Math.round(total * 1000) / 1000 };
}

/** Plain text for "Copy + open WhatsApp": one block per service. */
export function visitText(summary, { t, name, salonName, sectionName, formatOmr }) {
  const out = [salonName, ''];
  for (const s of summary.services) {
    out.push(`${sectionName(s.section)}${s.approved ? ` · ${t('visit.approved')}` : ''}`);
    for (const l of s.lines) out.push(`- ${l}`);
    for (const p of s.priceItems) out.push(`- ${p.label}: ${formatOmr(p.priceOmr)}`);
    out.push('');
  }
  if (summary.totalOmr) out.push(`${t('visit.total')}: ${formatOmr(summary.totalOmr)}`);
  void name;
  return out.join('\n').trim();
}
