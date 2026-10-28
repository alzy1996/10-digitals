// Owner: the clipper guard chart (guard number -> millimetres) the Cut Card uses, and the
// beard growth rate the Studio's growth timeline uses. Both are salon settings. Until the
// salon settings carry `guardChart` and `beardGrowthMmPerDay` (SETTINGS_READY), the screen
// shows the chart in use (LIHYA's default) read-only; the editor and Save switch on with it.
import { useMemo, useState } from 'react';
import OwnerLayout from '../../../components/OwnerLayout.jsx';
import { useApp } from '../../../hooks/useApp.jsx';
import { updateSettings } from '../../../services/salons.js';
import { useT } from '../lib/i18n.js';
import { formatMm } from '../lib/format.js';
import { beardSettings } from '../state/shop.jsx';
import Button from '../ui/Button.jsx';
import { useSnackbar } from '../ui/snackbar.js';
import GuardChartEditor, { checkDraft, sameChart, toDraft } from './GuardChartEditor.jsx';
import { Note, Section, SettingRow, Stepper } from './ui.jsx';

/** Flip to true once firestore.rules / schema.js accept settings.guardChart and settings.beardGrowthMmPerDay. */
export const SETTINGS_READY = true;
const GROWTH = { min: 0.1, max: 1, step: 0.1 };

export default function GuardChartScreen() {
  const { t, lang, pick } = useT();
  const app = useApp();
  const { show } = useSnackbar();
  const settings = useMemo(() => beardSettings(app.settings), [app.settings]);
  const [guards, setGuards] = useState(null);
  const [growth, setGrowth] = useState(null);
  const [tried, setTried] = useState(false);
  const draft = useMemo(() => guards || toDraft(settings.guardChart), [guards, settings.guardChart]);
  const check = useMemo(() => checkDraft(draft), [draft]);
  const growthNow = growth ?? settings.growthMmPerDay;
  const dirty = (guards && !sameChart(guards, settings.guardChart)) || (growth !== null && growth !== settings.growthMmPerDay);
  const fmtGrowth = (v) => t('beard.owner.set.growth.value', { v: Number(v).toFixed(1) });

  const save = () => {
    setTried(true);
    if (!check.ok || !app.salon) return;
    updateSettings(app.salon, { guardChart: check.chart, beardGrowthMmPerDay: growthNow });
    setGuards(null);
    setGrowth(null);
    setTried(false);
    show({ message: t('beard.common.saved') });
  };

  return (
    <OwnerLayout title={t('beard.nav.guards')}>
      <div className="flex max-w-3xl flex-col gap-4">
        <Section title={t('beard.owner.set.guards.title')} description={t('beard.owner.set.guards.sub')} icon="guard">
          {SETTINGS_READY ? (
            <GuardChartEditor
              draft={draft}
              onChange={setGuards}
              rowErrors={tried || dirty ? check.rowErrors : {}}
              general={tried || dirty ? check.general : null}
            />
          ) : (
            <>
              <ul className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface">
                {settings.guardChart.map((g) => (
                  <li key={g.id} className="flex min-h-tap items-center justify-between gap-3 px-4 py-2">
                    <bdi className="font-semibold">{pick(g.label) || g.id}</bdi>
                    <span className="num text-ink2">{formatMm(g.mm, lang)}</span>
                  </li>
                ))}
              </ul>
              <Note tone="info" icon="info">
                {t('beard.owner.guards.readOnly')}
              </Note>
            </>
          )}
          <hr className="border-line" />
          <SettingRow label={t('beard.owner.set.growth.title')} labelId="growth-label" description={t('beard.owner.set.growth.sub')}>
            <Stepper
              value={growthNow}
              min={GROWTH.min}
              max={GROWTH.max}
              step={GROWTH.step}
              onChange={setGrowth}
              format={fmtGrowth}
              labelledBy="growth-label"
              decLabel={t('beard.owner.set.growth.less')}
              incLabel={t('beard.owner.set.growth.more')}
              valueClassName="min-w-[108px] px-2 text-base"
              disabled={!SETTINGS_READY}
            />
          </SettingRow>
        </Section>
        {SETTINGS_READY ? (
          <div className="max-w-sm">
            <Button icon="check" disabled={!dirty} onClick={save}>
              {t('beard.common.save')}
            </Button>
          </div>
        ) : null}
      </div>
    </OwnerLayout>
  );
}
