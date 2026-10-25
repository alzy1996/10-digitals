import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useT } from '../lib/i18n/useT.js';
import { useShop } from '../state/ShopContext.jsx';
import { useOnline } from '../hooks/useOnline.js';
import { deleteDemoData, purgeExpiredData, updateSettings, updateShop } from '../services/shops.js';
import { normalizeOmanPhone } from '../lib/format.js';
import { LIMITS } from '../config/app.js';
import BottomAction from '../components/BottomAction.jsx';
import Button from '../components/Button.jsx';
import ChipRow from '../components/ChipRow.jsx';
import Field from '../components/Field.jsx';
import OwnerShell from '../components/OwnerShell.jsx';
import ScreenFrame from '../components/ScreenFrame.jsx';
import Toggle from '../components/Toggle.jsx';
import { useSnackbar } from '../components/Snackbar.jsx';
import GuardChartEditor, { checkDraft, sameChart, toDraft } from './owner/GuardChartEditor.jsx';
import ShopLink from './owner/ShopLink.jsx';
import { Note, Section, SettingRow, Stepper } from './owner/ui.jsx';
import { useDebouncedSetting, useDemoPresence } from './owner/hooks.js';
import { applyTheme, currentTheme, workerUrl } from './owner/util.js';

const RETENTION_OPTIONS = [90, 180, 365, 730];
const GROWTH = { min: 0.1, max: 1, step: 0.1 };
const CAP = { min: 1, max: LIMITS.aiDailyCapAccount, step: 1 };

function shopDetails(shop, settings) {
  return { nameAr: shop?.nameAr || '', name: shop?.name || '', whatsapp: settings?.whatsapp || '' };
}

/** Scroll to #ai / #demo links from the dashboard inside the frame's scroller. */
function useHashScroll() {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return undefined;
    const id = decodeURIComponent(hash.slice(1));
    const timer = setTimeout(() => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 120);
    return () => clearTimeout(timer);
  }, [hash]);
}

/** S19: owner settings (/s/:shopId/owner/settings). */
export default function S19Settings() {
  const { t } = useT();
  const { shopId, shop, settings } = useShop();
  const { show, confirmUndo } = useSnackbar();
  const online = useOnline();
  useHashScroll();

  // Drafts: null = showing the saved values; an object/array = unsaved edits.
  const [details, setDetails] = useState(null);
  const [guards, setGuards] = useState(null);
  const [errors, setErrors] = useState({});
  const [showGuardErrors, setShowGuardErrors] = useState(false);
  const [busy, setBusy] = useState({ purge: false, demo: false });
  const [theme, setTheme] = useState(currentTheme);

  const saved = shopDetails(shop, settings);
  const shown = details || saved;
  const guardDraft = useMemo(() => guards || toDraft(settings.guardChart), [guards, settings.guardChart]);
  const guardCheck = useMemo(() => checkDraft(guardDraft), [guardDraft]);

  const detailsDirty =
    Boolean(details) && (details.nameAr !== saved.nameAr || details.name !== saved.name || details.whatsapp !== saved.whatsapp);
  const guardsDirty = Boolean(guards) && !sameChart(guards, settings.guardChart);
  const dirty = detailsDirty || guardsDirty;

  const demo = useDemoPresence(shopId);
  const worker = workerUrl();

  /** Optimistic, audited settings write; false (and a message) when refused. */
  const save = (patch) => {
    try {
      updateSettings(shopId, patch);
      return true;
    } catch (err) {
      console.error('updateSettings failed', err);
      show({ message: t('owner.set.saveFailed') });
      return false;
    }
  };

  /** Apply at once, offer Undo (PRD 8.5: Undo instead of confirm dialogs). */
  const saveWithUndo = (patch, before, message) => {
    if (!save(patch)) return;
    show({ message, actionLabel: t('common.undo'), onAction: () => save(before) });
  };

  const [growth, setGrowth] = useDebouncedSetting(Number(settings.growthMmPerDay), (v) => save({ growthMmPerDay: v }));
  const [cap, setCap] = useDebouncedSetting(Number(settings.aiDailyCap), (v) => save({ aiDailyCap: v }));

  const editDetails = (key, value) => {
    setDetails((d) => ({ ...(d || saved), [key]: value }));
    setErrors((e) => ({ ...e, [key === 'whatsapp' ? 'whatsapp' : 'name']: null }));
  };

  const discard = () => {
    setDetails(null);
    setGuards(null);
    setErrors({});
    setShowGuardErrors(false);
  };

  const saveAll = () => {
    const errs = {};
    let shopPatch = null;
    const settingsPatch = {};
    const before = { shop: { name: shop?.name || '', nameAr: shop?.nameAr || '' }, settings: {} };

    if (detailsDirty) {
      const ar = details.nameAr.trim();
      const en = details.name.trim();
      if (!ar && !en) errs.name = t('owner.set.shop.nameRequired');
      let phone = '';
      if (details.whatsapp.trim()) {
        phone = normalizeOmanPhone(details.whatsapp);
        if (!phone) errs.whatsapp = t('owner.set.shop.whatsappError');
      }
      // Like "Create your shop": one name fills the other when only one language is given.
      const next = { name: en || ar, nameAr: ar || en };
      if (next.name !== before.shop.name || next.nameAr !== before.shop.nameAr) shopPatch = next;
      if ((phone || '') !== (settings.whatsapp || '')) {
        settingsPatch.whatsapp = phone || '';
        before.settings.whatsapp = settings.whatsapp || '';
      }
    }
    if (guardsDirty) {
      if (!guardCheck.ok) errs.guards = true;
      else {
        settingsPatch.guardChart = guardCheck.chart;
        before.settings.guardChart = settings.guardChart;
      }
    }

    if (Object.keys(errs).length) {
      setErrors(errs);
      setShowGuardErrors(Boolean(errs.guards));
      show({ message: t('owner.set.fixErrors') });
      return;
    }
    try {
      if (shopPatch) updateShop(shopId, shopPatch);
      if (Object.keys(settingsPatch).length) updateSettings(shopId, settingsPatch);
    } catch (err) {
      console.error('settings save failed', err);
      show({ message: t('owner.set.saveFailed') });
      return;
    }
    discard();
    show({
      message: t('owner.set.saved'),
      actionLabel: t('common.undo'),
      onAction: () => {
        try {
          if (shopPatch) updateShop(shopId, before.shop);
          if (Object.keys(before.settings).length) updateSettings(shopId, before.settings);
        } catch (err) {
          console.error('undo failed', err);
          show({ message: t('owner.set.saveFailed') });
        }
      },
    });
  };

  const applyRetentionNow = () => {
    const days = settings.retentionDays;
    confirmUndo({
      message: t('owner.set.retention.applyMsg', { days }),
      actionLabel: t('common.undo'),
      onCommit: async () => {
        setBusy((b) => ({ ...b, purge: true }));
        try {
          let total = 0;
          for (let i = 0; i < 10; i += 1) {
            const r = await purgeExpiredData(shopId);
            total += r.deleted;
            if (!r.more) break;
          }
          show({ message: total ? t('owner.set.retention.applied', { n: total }) : t('owner.set.retention.nothing', { days }) });
        } catch (err) {
          console.error('purge failed', err);
          show({ message: online ? t('owner.set.retention.failed') : t('owner.set.needOnline') });
        } finally {
          setBusy((b) => ({ ...b, purge: false }));
        }
      },
    });
  };

  const removeDemo = () => {
    confirmUndo({
      message: t('owner.set.demo.confirm'),
      actionLabel: t('common.undo'),
      onCommit: async () => {
        setBusy((b) => ({ ...b, demo: true }));
        try {
          const r = await deleteDemoData(shopId);
          show({ message: r.deleted ? t('owner.set.demo.deleted', { n: r.deleted, c: r.consultations, k: r.clients }) : t('owner.set.demo.nothing') });
        } catch (err) {
          console.error('deleteDemoData failed', err);
          show({ message: t('owner.set.demo.failed') });
        } finally {
          setBusy((b) => ({ ...b, demo: false }));
        }
      },
    });
  };

  const fmtGrowth = (v) => t('owner.set.growth.value', { v: Number(v).toFixed(1) });
  const fmtCap = (v) => t('owner.set.ai.capValue', { n: v });

  const retentionOptions = useMemo(() => {
    const list = RETENTION_OPTIONS.includes(settings.retentionDays) ? RETENTION_OPTIONS : [...RETENTION_OPTIONS, settings.retentionDays].sort((a, b) => a - b);
    return list.map((d) => ({ value: d, label: t('owner.set.retention.option', { n: d }) }));
  }, [settings.retentionDays, t]);

  const footer = dirty ? (
    <BottomAction>
      <Button icon="check" onClick={saveAll}>
        {t('owner.set.saveChanges')}
      </Button>
      <Button variant="ghost" onClick={discard}>
        {t('owner.set.discard')}
      </Button>
    </BottomAction>
  ) : null;

  return (
    <OwnerShell>
      <ScreenFrame title={t('ui.owner.settings')} wide footer={footer}>
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-4">
            <Section title={t('owner.set.shop.title')} description={t('owner.set.shop.sub')} icon="home">
              <Field
                label={t('owner.set.shop.nameAr')}
                value={shown.nameAr}
                onChange={(v) => editDetails('nameAr', v)}
                dir="rtl"
                lang="ar"
                maxLength={80}
                autoComplete="organization"
                error={errors.name}
              />
              <Field
                label={t('owner.set.shop.nameEn')}
                value={shown.name}
                onChange={(v) => editDetails('name', v)}
                dir="auto"
                maxLength={80}
                autoComplete="organization"
                hint={t('owner.set.shop.nameHint')}
              />
              <Field
                label={t('owner.set.shop.whatsapp')}
                value={shown.whatsapp}
                onChange={(v) => editDetails('whatsapp', v)}
                type="tel"
                inputMode="tel"
                dir="ltr"
                icon="whatsapp"
                placeholder="+968 9123 4567"
                autoComplete="tel"
                error={errors.whatsapp}
                hint={t('owner.set.shop.whatsappHint')}
              />
            </Section>

            <Section title={t('owner.set.try.title')} description={t('owner.set.try.sub')} icon="qr">
              <Toggle
                checked={settings.tryAtHome === true}
                onChange={(v) =>
                  saveWithUndo({ tryAtHome: v }, { tryAtHome: !v }, v ? t('owner.set.try.onMsg') : t('owner.set.try.offMsg'))
                }
                label={t('owner.set.try.toggle')}
                description={t('owner.set.try.toggleSub')}
              />
              <ShopLink shopId={shopId} shop={shop} enabled={settings.tryAtHome === true} />
            </Section>

            <Section anchor="ai" title={t('owner.set.ai.title')} description={t('owner.set.ai.sub')} icon="cloud">
              <Toggle
                checked={settings.aiPreview === true}
                onChange={(v) =>
                  saveWithUndo({ aiPreview: v }, { aiPreview: !v }, v ? t('owner.set.ai.onMsg') : t('owner.set.ai.offMsg'))
                }
                label={t('owner.set.ai.toggle')}
                description={settings.aiPreview ? t('owner.set.ai.toggleOn') : t('owner.set.ai.toggleOff')}
              />
              {worker ? (
                <Note tone="keep" icon="check">
                  {t('owner.set.ai.workerOk')}
                </Note>
              ) : (
                <Note tone="warn">{t('owner.set.ai.workerMissing')}</Note>
              )}
              <SettingRow label={t('owner.set.ai.cap')} labelId="ai-cap-label" description={t('owner.set.ai.capSub', { max: LIMITS.aiDailyCapAccount })}>
                <Stepper
                  value={cap}
                  min={CAP.min}
                  max={CAP.max}
                  step={CAP.step}
                  onChange={setCap}
                  format={fmtCap}
                  labelledBy="ai-cap-label"
                  decLabel={t('owner.set.ai.capLess')}
                  incLabel={t('owner.set.ai.capMore')}
                />
              </SettingRow>
              <div className="rounded-ctl border border-line bg-surface-2 p-3 text-sm leading-relaxed text-text">
                <p className="font-semibold">{t('owner.set.ai.honestTitle')}</p>
                <ul className="mt-2 flex list-disc flex-col gap-1.5 ps-5 marker:text-brass">
                  <li>{t('owner.set.ai.honest1')}</li>
                  <li>{t('owner.set.ai.honest2')}</li>
                  <li>{t('owner.set.ai.honest3', { cap: LIMITS.aiDailyCapAccount })}</li>
                  <li>{t('owner.set.ai.honest4')}</li>
                </ul>
              </div>
            </Section>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <Section title={t('owner.set.cut.title')} description={t('owner.set.cut.sub')} icon="guard">
              <div className="flex flex-col gap-1">
                <h3 className="text-base font-semibold">{t('owner.set.guards.title')}</h3>
                <p className="text-sm text-text-2">{t('owner.set.guards.sub')}</p>
              </div>
              <GuardChartEditor
                draft={guardDraft}
                onChange={(rows) => {
                  setGuards(rows);
                  setErrors((e) => ({ ...e, guards: null }));
                }}
                rowErrors={showGuardErrors || guardsDirty ? guardCheck.rowErrors : {}}
                general={showGuardErrors || guardsDirty ? guardCheck.general : null}
              />
              <hr className="border-line" />
              <SettingRow label={t('owner.set.growth.title')} labelId="growth-label" description={t('owner.set.growth.sub')}>
                <Stepper
                  value={growth}
                  min={GROWTH.min}
                  max={GROWTH.max}
                  step={GROWTH.step}
                  onChange={setGrowth}
                  format={fmtGrowth}
                  labelledBy="growth-label"
                  decLabel={t('owner.set.growth.less')}
                  incLabel={t('owner.set.growth.more')}
                  valueClassName="min-w-[108px] px-2"
                />
              </SettingRow>
              <Note
                tone="plain"
                icon="catalog"
                action={
                  <Button as={Link} to={`/s/${encodeURIComponent(shopId)}/owner/catalog`} variant="secondary" size="sm" iconEnd="chevron-right">
                    {t('owner.set.cut.openCatalog')}
                  </Button>
                }
              >
                {t('owner.set.cut.localFit')}
              </Note>
            </Section>

            <Section title={t('owner.set.lang.title')} description={t('owner.set.lang.sub')} icon="globe">
              <ChipRow
                label={t('owner.set.lang.label')}
                value={settings.defaultLanguage}
                onChange={(v) =>
                  saveWithUndo(
                    { defaultLanguage: v },
                    { defaultLanguage: settings.defaultLanguage },
                    t('owner.set.lang.changed', { lang: t(`owner.set.lang.${v}`) }),
                  )
                }
                options={[
                  { value: 'ar', label: t('owner.set.lang.ar') },
                  { value: 'en', label: t('owner.set.lang.en') },
                ]}
              />
            </Section>

            <Section title={t('owner.set.data.title')} description={t('owner.set.data.sub')} icon="lock">
              <ChipRow
                label={t('owner.set.retention.label')}
                value={settings.retentionDays}
                onChange={(v) =>
                  saveWithUndo(
                    { retentionDays: v },
                    { retentionDays: settings.retentionDays },
                    t('owner.set.retention.changed', { n: v }),
                  )
                }
                options={retentionOptions}
              />
              <p className="text-sm text-text-2">{t('owner.set.retention.explain', { n: settings.retentionDays })}</p>
              <div>
                <Button variant="secondary" icon="refresh" onClick={applyRetentionNow} loading={busy.purge} disabled={!online}>
                  {t('owner.set.retention.apply')}
                </Button>
                {!online ? <p className="mt-2 text-sm text-warn">{t('owner.set.needOnline')}</p> : null}
              </div>
              <hr className="border-line" />
              <div id="demo" className="flex scroll-mt-4 flex-col gap-3">
                <div>
                  <h3 className="text-base font-semibold">{t('owner.set.demo.title')}</h3>
                  <p className="mt-1 text-sm text-text-2">
                    {demo.loading ? t('common.loading') : demo.present ? t('owner.set.demo.present') : t('owner.set.demo.absent')}
                  </p>
                </div>
                <div>
                  <Button variant="danger" icon="trash" onClick={removeDemo} loading={busy.demo}>
                    {t('owner.set.demo.delete')}
                  </Button>
                </div>
              </div>
            </Section>

            <Section title={t('owner.set.device.title')} description={t('owner.set.device.sub')} icon="phone">
              <ChipRow
                label={t('owner.set.theme.label')}
                value={theme}
                onChange={(v) => setTheme(applyTheme(v))}
                options={[
                  { value: 'dark', label: t('owner.set.theme.dark'), icon: 'moon' },
                  { value: 'light', label: t('owner.set.theme.light'), icon: 'sun' },
                ]}
              />
            </Section>
          </div>
        </div>
      </ScreenFrame>
    </OwnerShell>
  );
}
