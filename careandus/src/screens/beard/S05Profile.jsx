// S05 Face profile (PRD 5.4-5.8, 8.1 step 3): face shape, Monk Skin Tone, undertone and
// age-band chips that change with one tap, the Grow-ability ring and the mini patch map.
// Uncertain beard zones ask Dense / Medium / Patchy / None with one tap. Every change is
// an override in the session (setOverride); the measured profile itself never changes.

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ScreenFrame from './ui/ScreenFrame.jsx';
import Button from './ui/Button.jsx';
import BottomAction from './ui/BottomAction.jsx';
import ChipRow from './ui/ChipRow.jsx';
import Chip from './ui/Chip.jsx';
import Ring from './ui/Ring.jsx';
import Icon from './ui/Icon.jsx';
import Skeleton from './ui/Skeleton.jsx';
import EmptyState from './ui/EmptyState.jsx';
import { cx } from './ui/kit.js';
import { useT } from './lib/i18n.js';
import { formatPercent } from './lib/format.js';
import { getColor } from '../../ai/beard/lib/look.js';
import { useSession } from './state/session.js';
import { CONFIRM_BELOW, isFreshlyShaved, itaBand } from '../../ai/beard/index.js';
import PatchMap from './capture/PatchMap.jsx';
import MstScale from './capture/MstScale.jsx';
import { useProfileConsent } from './capture/profileConsent.js';

const SHAPES = Object.freeze(['oval', 'round', 'square', 'oblong', 'heart', 'diamond', 'triangle']);
const UNDERTONES = Object.freeze(['warm', 'cool', 'neutral', 'olive']);
const AGE_BANDS = Object.freeze(['18-24', '25-34', '35-44', '45-54', '55+']);
const ZONES = Object.freeze(['M', 'S', 'C', 'J_L', 'J_R', 'K_L', 'K_R', 'B_L', 'B_R', 'N']);
const FACE_ZONES = Object.freeze(['M', 'S', 'C', 'J_L', 'J_R', 'K_L', 'K_R', 'B_L', 'B_R']);
const CONFIRM_LABELS = Object.freeze(['dense', 'medium', 'patchy', 'none']);
/** Below this skin confidence the undertone quiz opens by itself (PRD 5.6 fallback quiz). */
const UNDERTONE_SURE = 0.7;

/** gold + green veins = warm, silver + blue = cool, anything mixed = neutral. */
export function undertoneFromQuiz(jewelry, veins) {
  if (!jewelry || !veins) return null;
  if (jewelry === 'gold' && veins === 'green') return 'warm';
  if (jewelry === 'silver' && veins === 'blue') return 'cool';
  return 'neutral';
}

/** A finite number, or null for null / undefined / '' / NaN (Number(null) would be 0). */
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Shapes by measured share, highest first: [{ shape, pct }]. */
function rankShapes(faceShape) {
  const scores = (faceShape && faceShape.scores) || {};
  return SHAPES.map((shape, i) => ({ shape, pct: Math.round((Number(scores[shape]) || 0) * 100), i })).sort(
    (a, b) => b.pct - a.pct || a.i - b.i,
  );
}

function Section({ title, aside, children, className }) {
  return (
    <section className={cx('flex flex-col gap-3 py-5', className)}>
      {title ? (
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg">{title}</h2>
          {aside ? <span className="text-sm text-ink2">{aside}</span> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** A section heading used as the visible label (and accessible name) of a chip row. */
function ChipHeading({ children }) {
  return <h2 className="text-lg font-semibold text-ink">{children}</h2>;
}

function Rule() {
  return <hr className="rule-clay" />;
}

export default function S05Profile() {
  const { t, lang, pick } = useT();
  const navigate = useNavigate();
  const session = useSession();
  const { mode, profile, effectiveProfile, overrides, setOverride, path, client, lookCode, hydrated } = session;
  const chair = mode === 'chair';
  const [quizOpen, setQuizOpen] = useState(false);
  const [quiz, setQuiz] = useState({ jewelry: null, veins: null });
  const [consent, setConsent] = useProfileConsent(session);

  const p = effectiveProfile;
  const ranked = useMemo(() => rankShapes(profile && profile.faceShape), [profile]);
  const measured = Boolean(profile && profile.faceShape && profile.faceShape.scores);

  // Zones to confirm come from the MEASURED profile, so a row stays after its tap.
  const confirmZones = useMemo(() => {
    if (!profile || !profile.beard || !profile.beard.zones) return [];
    const z = profile.beard.zones;
    const shaved = isFreshlyShaved(profile, null);
    return ZONES.filter((k) => {
      const info = z[k];
      if (!info) return false;
      if (shaved && FACE_ZONES.includes(k)) return true;
      return Number(info.confidence) < CONFIRM_BELOW;
    });
  }, [profile]);

  if (!p) {
    return (
      <ScreenFrame title={t('beard.capture.profile.title')} back={path('')}>
        {!hydrated ? (
          <div role="status" aria-busy="true" className="flex flex-col gap-4">
            <span className="sr-only">{t('beard.common.loading')}</span>
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-3/4" />
            <Skeleton rounded="card" className="h-48 w-full" />
          </div>
        ) : (
          <EmptyState
            icon="face"
            title={t('beard.capture.profile.emptyTitle')}
            message={t('beard.capture.profile.emptyBody')}
            action={
              <Button variant="primary" icon="camera" onClick={() => navigate(path('capture'))} className="mt-2">
                {t('beard.capture.profile.emptyAction')}
              </Button>
            }
          />
        )}
      </ScreenFrame>
    );
  }

  const fs = p.faceShape || {};
  const skin = p.skin || {};
  const beard = p.beard || {};
  const shaved = isFreshlyShaved(p, overrides);
  const growability = shaved ? null : beard.growability;
  const unsure = confirmZones.filter((k) => !(overrides.zones && overrides.zones[k]));
  // Left and right of a pair that both need a check share one row (one tap for both sides).
  const confirmRows = [];
  for (const k of confirmZones) {
    const side = /^([JKB])_([LR])$/.exec(k);
    if (side) {
      const other = `${side[1]}_${side[2] === 'L' ? 'R' : 'L'}`;
      if (confirmZones.includes(other)) {
        if (side[2] === 'L') confirmRows.push({ key: side[1], pair: true, zones: [k, other] });
        continue;
      }
    }
    confirmRows.push({ key: k, pair: false, zones: [k] });
  }

  /* ---- face shape: top two with %, the other shapes in a second row */
  const topTwo = measured ? ranked.slice(0, 2) : [];
  const others = measured ? ranked.slice(2) : ranked;
  const shapeLabel = (r, withPct) => (withPct ? `${t(`beard.face.${r.shape}`)} ${formatPercent(r.pct, lang)}` : t(`beard.face.${r.shape}`));
  const topValue = topTwo.some((r) => r.shape === fs.top) ? fs.top : null;
  const otherValue = others.some((r) => r.shape === fs.top) ? fs.top : null;
  const setShape = (v) => {
    if (!v) return;
    setOverride('faceShape', profile.faceShape && profile.faceShape.top === v ? null : v);
  };

  /* ---- skin */
  const mst = num(skin.mst);
  const band = num(skin.ita) === null ? null : itaBand(num(skin.ita));
  const setMst = (v) => {
    if (!v) return;
    const measuredMst = profile.skin ? profile.skin.mst : null;
    setOverride('mst', v === measuredMst ? null : v);
  };

  /* ---- undertone */
  const lowSkin = !skin.undertone || !((num(skin.confidence) ?? 0) >= UNDERTONE_SURE);
  const showQuiz = quizOpen || (lowSkin && !overrides.undertone);
  const setUndertone = (v) => {
    if (!v) return;
    const measuredTone = profile.skin ? profile.skin.undertone : null;
    setOverride('undertone', v === measuredTone ? null : v);
  };
  const answerQuiz = (key, value) => {
    const next = { ...quiz, [key]: value };
    setQuiz(next);
    // Keep the quiz on screen once used, so its result line stays visible.
    setQuizOpen(true);
    const tone = undertoneFromQuiz(next.jewelry, next.veins);
    if (tone) setOverride('undertone', tone);
  };
  const quizResult = undertoneFromQuiz(quiz.jewelry, quiz.veins);

  /* ---- age band: pre-selected only when the model read it */
  const ageValue = p.ageBand && p.ageBand.band ? p.ageBand.band : null;
  const setAge = (v) => setOverride('ageBand', v || null);

  /* ---- beard colour */
  const color = beard.colorId ? getColor(beard.colorId) : null;

  /* ---- consent (chair, saved client only) */
  const askConsent = chair && client && client.id && !client.walkIn;

  const next = () => {
    if (lookCode) navigate(path('studio'));
    else navigate(chair ? path('questions') : path('styles'));
  };

  return (
    <ScreenFrame
      title={t('beard.capture.profile.title')}
      back={path('capture')}
      footer={
        <BottomAction>
          <Button variant="primary" icon="check" onClick={next}>
            {t('beard.capture.profile.looksRight')}
          </Button>
        </BottomAction>
      }
    >
      <Section className="pt-1">
        {topTwo.length ? (
          <ChipRow
            label={<ChipHeading>{t('beard.capture.profile.faceShape')}</ChipHeading>}
            options={topTwo.map((r) => ({ value: r.shape, label: shapeLabel(r, true), icon: 'face' }))}
            value={topValue}
            onChange={setShape}
          />
        ) : null}
        <ChipRow
          label={topTwo.length ? t('beard.capture.profile.moreShapes') : <ChipHeading>{t('beard.capture.profile.faceShape')}</ChipHeading>}
          options={others.map((r) => ({ value: r.shape, label: shapeLabel(r, false) }))}
          value={otherValue}
          onChange={setShape}
        />
        {fs.measures && fs.measures.hairlineEstimated ? (
          <p className="flex items-center gap-2 text-sm text-ink2">
            <Icon name="info" size={18} />
            {t('beard.ai.hairline.estimated')}
          </p>
        ) : null}
      </Section>

      <Rule />

      <Section title={t('beard.capture.profile.skin')} aside={band ? t(`beard.ai.ita.${band}`) : null}>
        <MstScale label={t('beard.capture.profile.mst')} value={mst} onChange={setMst} />
        <p className="text-xs text-ink2">{t('beard.capture.profile.mstCredit')}</p>
        <ChipRow
          label={t('beard.capture.profile.undertone')}
          options={UNDERTONES.map((u) => ({ value: u, label: t(`beard.undertone.${u}`) }))}
          value={skin.undertone || null}
          onChange={setUndertone}
        />
        {showQuiz ? (
          <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
            <h3 className="text-base">{t('beard.capture.profile.quiz.title')}</h3>
            <ChipRow
              label={t('beard.capture.profile.quiz.jewelry')}
              options={[
                { value: 'gold', label: t('beard.capture.profile.quiz.gold') },
                { value: 'silver', label: t('beard.capture.profile.quiz.silver') },
              ]}
              value={quiz.jewelry}
              onChange={(v) => answerQuiz('jewelry', v)}
            />
            <ChipRow
              label={t('beard.capture.profile.quiz.veins')}
              options={[
                { value: 'green', label: t('beard.capture.profile.quiz.green') },
                { value: 'blue', label: t('beard.capture.profile.quiz.blue') },
              ]}
              value={quiz.veins}
              onChange={(v) => answerQuiz('veins', v)}
            />
            {quizResult ? (
              <p role="status" className="flex items-center gap-2 text-sm text-ok">
                <Icon name="check" size={18} />
                {t('beard.capture.profile.quiz.done', { tone: t(`beard.undertone.${quizResult}`) })}
              </p>
            ) : null}
          </div>
        ) : (
          <div>
            <Button variant="ghost" size="sm" icon="info" onClick={() => setQuizOpen(true)} className="-ms-3">
              {t('beard.capture.profile.quiz.open')}
            </Button>
          </div>
        )}
      </Section>

      <Rule />

      <Section>
        <ChipRow
          label={<ChipHeading>{t('beard.capture.profile.age')}</ChipHeading>}
          options={AGE_BANDS.map((b) => ({ value: b, label: `\u2066${t(`beard.age.${b}`)}\u2069` }))}
          value={ageValue}
          onChange={setAge}
        />
        {ageValue ? null : <p className="text-sm text-ink2">{t('beard.capture.profile.ageAsk')}</p>}
      </Section>

      <Rule />

      <Section title={t('beard.capture.profile.beard')}>
        <div className="flex items-center gap-4">
          <Ring value={growability} size={72} label={t('beard.ui.growability')} />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-ink">{t('beard.ui.growability')}</p>
            <p className="text-sm text-ink2">
              {shaved ? t('beard.capture.profile.growUnknown') : t('beard.capture.profile.growHint')}
            </p>
          </div>
        </div>
        {color || Number(beard.greyRatio) >= 5 ? (
          <div className="flex flex-wrap gap-2">
            {color ? (
              <Chip
                icon={
                  color.hex ? (
                    <span aria-hidden="true" className="h-3.5 w-3.5 rounded-full border border-line" style={{ background: color.hex }} />
                  ) : null
                }
              >
                {t('beard.capture.profile.color', { name: pick(color.name) })}
              </Chip>
            ) : null}
            {Number(beard.greyRatio) >= 5 ? (
              <Chip>{t('beard.ai.grey', { pct: Math.round(Number(beard.greyRatio)) })}</Chip>
            ) : null}
          </div>
        ) : null}
        <PatchMap zones={beard.zones} unsure={unsure} className="py-2" />

        {shaved ? (
          <p role="status" className="flex items-start gap-2 rounded-card border border-warn bg-surface2 p-3 text-sm text-warn">
            <Icon name="warning" size={20} />
            <span>{t('beard.catalog.warn.shaved_confirm')}</span>
          </p>
        ) : null}

        {confirmRows.length ? (
          <div className="flex flex-col">
            <h3 className="text-base">{t('beard.capture.profile.confirmTitle')}</h3>
            <p className="text-sm text-ink2">{t('beard.ai.zone.lowConfidence')}</p>
            <div className="mt-1 flex flex-col divide-y divide-line">
              {confirmRows.map((row) => {
                const vals = row.zones.map((z) => (overrides.zones && overrides.zones[z]) || null);
                const value = vals.every((v) => v === vals[0]) ? vals[0] : null;
                return (
                  <ChipRow
                    key={row.key}
                    className="py-3"
                    label={t('beard.ai.zone.confirm', { zone: row.pair ? t(`beard.capture.profile.pair.${row.key}`) : t(`beard.zone.${row.key}`) })}
                    options={CONFIRM_LABELS.map((v) => ({ value: v, label: t(`beard.ai.zone.${v}`) }))}
                    value={value}
                    onChange={(v) => {
                      for (const z of row.zones) setOverride(`zones.${z}`, v);
                    }}
                    nullable
                  />
                );
              })}
            </div>
          </div>
        ) : null}
      </Section>

      {askConsent ? (
        <>
          <Rule />
          <Section>
            <ChipRow
              label={<ChipHeading>{t('beard.capture.profile.consent')}</ChipHeading>}
              options={[
                { value: true, label: t('beard.common.yes'), icon: 'check' },
                { value: false, label: t('beard.common.no'), icon: 'close' },
              ]}
              value={consent}
              onChange={setConsent}
              nullable
            />
            <p className="text-sm text-ink2">{t('beard.capture.profile.consentHint')}</p>
          </Section>
        </>
      ) : null}
    </ScreenFrame>
  );
}
