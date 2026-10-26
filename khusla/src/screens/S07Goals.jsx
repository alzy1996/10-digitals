import { useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import Button from '../components/Button.jsx';
import { ChipRow } from '../components/Chip.jsx';
import { useT } from '../lib/i18n/useT.js';
import { useSession } from '../hooks/useSession.jsx';

export default function S07Goals() {
  const { t } = useT();
  const session = useSession();
  const navigate = useNavigate();
  const g = session.goals;
  const set = (k, v) => session.patch({ goals: { ...session.goals, [k]: v } });
  return (
    <main className="screen mx-auto max-w-[720px]">
      <TopBar title={t('goals.title')} step={t('flow.step', { n: 4, total: 7 })} />
      <section className="card mb-5 p-5">
        <ChipRow label={t('goals.change')} value={g.change} onChange={(v) => set('change', v)} options={['cut', 'color', 'both', 'style'].map((v) => ({ value: v, label: t(`goals.change.${v}`) }))} />
        <ChipRow label={t('goals.upkeep')} value={g.upkeep} onChange={(v) => set('upkeep', v)} options={['low', 'medium', 'high'].map((v) => ({ value: v, label: t(`upkeep.${v}`) }))} />
        <ChipRow
          label={t('goals.tieBack')}
          value={g.tieBack}
          onChange={(v) => set('tieBack', v)}
          options={[
            { value: true, label: t('common.yes') },
            { value: false, label: t('common.no') },
          ]}
        />
        <ChipRow
          label={t('goals.visible')}
          value={g.visibleZone}
          onChange={(v) => set('visibleZone', v)}
          options={[
            { value: 'all', label: t('goals.visible.all'), icon: 'face' },
            { value: 'front', label: t('goals.visible.front'), icon: 'hijab' },
          ]}
        />
      </section>
      <Button icon="wand" onClick={() => navigate('/looks')}>
        {t('goals.showLooks')}
      </Button>
    </main>
  );
}
