// KPIs for the dashboard and the daily report, computed from consultations of one or more Muscat days.
export function computeKpis(consultations, { includeDemo = true, staff = [] } = {}) {
  const list = consultations.filter((c) => includeDemo || !c.demo);
  const total = list.length;
  const approved = list.filter((c) => c.status === 'approved' || c.status === 'done');
  const decisions = approved.map((c) => c.decisionSeconds || 0).filter((s) => s > 0);
  const ratings = list.map((c) => c.rating).filter((r) => typeof r === 'number' && r > 0);
  const addOns = approved.reduce((s, c) => s + (c.agreement?.addOnCount || 0), 0);
  const notToday = list.reduce((s, c) => s + (c.notTodayShown || 0), 0);
  const ai = list.filter((c) => c.aiPreviewUsed).length;
  const countBy = (key) => {
    const m = {};
    for (const c of approved) {
      const k = key(c);
      if (k) m[k] = (m[k] || 0) + 1;
    }
    return Object.entries(m)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 6);
  };
  const byStylist = {};
  for (const c of list) {
    const s = (byStylist[c.stylistUid] ||= { uid: c.stylistUid, consultations: 0, approvals: 0, decision: [], ratings: [] });
    s.consultations += 1;
    if (c.status === 'approved' || c.status === 'done') {
      s.approvals += 1;
      if (c.decisionSeconds) s.decision.push(c.decisionSeconds);
    }
    if (c.rating) s.ratings.push(c.rating);
  }
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  return {
    consultations: total,
    approvals: approved.length,
    conversion: total ? (approved.length / total) * 100 : 0,
    avgDecision: avg(decisions),
    avgRating: avg(ratings),
    addOns,
    notToday,
    aiRenders: ai,
    topLooks: countBy((c) => (c.params ? `${c.params.cutId || 'keep'}~${c.params.shadeId || 'natural'}` : null)),
    topShades: countBy((c) => c.params?.shadeId || null),
    stylists: Object.values(byStylist).map((s) => ({
      uid: s.uid,
      name: staff.find((m) => m.uid === s.uid)?.name || s.uid?.slice(0, 6) || '—',
      consultations: s.consultations,
      approvals: s.approvals,
      avgDecision: avg(s.decision),
      avgRating: avg(s.ratings),
    })),
  };
}
