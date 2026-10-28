// Cloudflare Workers AI (FLUX.2 [klein] 4B) through Sam's own Worker. Staff only, capped, no storage.
import { auth, getAppCheckToken } from '../../../lib/firebase.js';

async function headers() {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw Object.assign(new Error('auth'), { code: 'auth' });
  const h = { Authorization: `Bearer ${await user.getIdToken()}` };
  const ac = await getAppCheckToken();
  if (ac) h['X-Firebase-AppCheck'] = ac;
  return h;
}

function readQuota(res) {
  const used = Number(res.headers.get('X-Khusla-Used'));
  const cap = Number(res.headers.get('X-Khusla-Cap'));
  return Number.isFinite(used) && Number.isFinite(cap)
    ? { used, cap, accountUsed: Number(res.headers.get('X-Khusla-Account-Used')), resetsAt: res.headers.get('X-Khusla-Resets-At') }
    : null;
}

export function cloudflareFlux(workerUrl) {
  const base = workerUrl.replace(/\/$/, '');
  return {
    id: 'cloudflareFlux',
    available: () => true,
    async quota(salonId) {
      const res = await fetch(`${base}/quota?salonId=${encodeURIComponent(salonId)}`, { headers: await headers(), cache: 'no-store' });
      if (!res.ok) return null;
      return res.json();
    },
    /**
     * @param {{salonId:string, sourceJpeg:Blob, guideJpeg:Blob, seed?:number, style?:{name:string, desc:string}}} p
     */
    async render({ salonId, sourceJpeg, guideJpeg, seed, style }) {
      const form = new FormData();
      form.append('salonId', salonId);
      if (Number.isInteger(seed)) form.append('seed', String(seed));
      form.append('source', sourceJpeg, 'source.jpg');
      form.append('guide', guideJpeg, 'guide.jpg');
      if (style?.name) {
        form.append('styleName', style.name.slice(0, 120));
        if (style.desc) form.append('styleDesc', style.desc.slice(0, 120));
      }
      let res;
      try {
        res = await fetch(`${base}/render`, { method: 'POST', headers: await headers(), body: form, cache: 'no-store' });
      } catch {
        throw Object.assign(new Error('network'), { code: 'network' });
      }
      if (res.status === 429) {
        const body = await res.json().catch(() => ({}));
        throw Object.assign(new Error('cap'), { code: 'cap', resetsAt: body.resetsAt });
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw Object.assign(new Error(body.error || 'model'), { code: body.error || 'model', status: res.status });
      }
      const blob = await res.blob();
      return { blob, quota: readQuota(res) };
    },
  };
}
