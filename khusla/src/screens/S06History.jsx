import { useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import Button from '../components/Button.jsx';
import { ChipRow } from '../components/Chip.jsx';
import Icon from '../components/Icon.jsx';
import { useT } from '../lib/i18n/useT.js';
import { useSession } from '../hooks/useSession.jsx';

export default function S06History() {
  const { t } = useT();
  const session = useSession();
  const navigate = useNavigate();
  const h = session.history;
  const set = (k, v) => {
    const history = { ...session.history, [k]: v };
    session.patch({ history, profile: session.profile ? { ...session.profile, history } : session.profile });
  };
  const yesNo = [
    { value: true, label: t('common.yes') },
    { value: false, label: t('common.no') },
  ];
  return (
    <main className="screen mx-auto max-w-[720px]">
      <TopBar title={t('history.title')} step={t('flow.step', { n: 3, total: 7 })} />
      <p className="mb-5 text-sm text-ink2">{t('history.lead')}</p>
      <section className="card mb-5 p-5">
        <ChipRow
          label={t('history.henna')}
          value={h.henna}
          onChange={(v) => set('henna', v)}
          options={['none', 'pure', 'compound', 'unsure'].map((v) => ({ value: v, label: t(`henna.${v}`) }))}
        />
        {h.henna === 'unsure' || h.henna === 'compound' ? (
          <p className="-mt-3 mb-5 flex items-center gap-2 text-sm text-warn">
            <Icon name="alert" size={18} />
            {t('history.metallicFlag')}
          </p>
        ) : null}
        <ChipRow
          label={t('history.color')}
          value={h.recentColor}
          onChange={(v) => set('recentColor', v)}
          options={['none', 'darker', 'lighter', 'unsure'].map((v) => ({ value: v, label: t(`recent.${v}`) }))}
        />
        <ChipRow label={t('history.bleach')} value={h.bleach} onChange={(v) => set('bleach', v)} options={yesNo} />
        <ChipRow label={t('history.chemical')} value={h.chemical} onChange={(v) => set('chemical', v)} options={yesNo} />
        <ChipRow label={t('history.reaction')} value={session.patchRequired} onChange={(v) => session.patch({ patchRequired: v })} options={yesNo} />
        <p className="flex items-start gap-2 text-xs text-ink2">
          <Icon name="lock" size={16} className="mt-0.5" />
          {t('history.reactionNote')}
        </p>
      </section>
      <Button icon="check" onClick={() => navigate('/goals')}>
        {t('common.next')}
      </Button>
    </main>
  );
}
