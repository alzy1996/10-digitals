import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../lib/i18n/useT.js';
import { useShop } from '../state/ShopContext.jsx';
import { useDemo } from '../state/DemoMode.jsx';
import { useSession } from '../hooks/useSession.js';
import { useLive } from '../hooks/useLive.js';
import { useOnline } from '../hooks/useOnline.js';
import { getLookCode, markLookCodeUsed } from '../services/lookCodes.js';
import { watchStyles } from '../services/styles.js';
import { checkLookParams, getStyle, lookSummary } from '../lib/look.js';
import { formatMuscat, toDate } from '../lib/time.js';
import { LIMITS } from '../config/app.js';
import BottomAction from '../components/BottomAction.jsx';
import Button from '../components/Button.jsx';
import CodeBoxes from '../components/CodeBoxes.jsx';
import Icon from '../components/Icon.jsx';
import ScreenFrame from '../components/ScreenFrame.jsx';
import Skeleton from '../components/Skeleton.jsx';
import ZoneDiagram from '../components/ZoneDiagram.jsx';

function dateText(value, lang) {
  if (!value) return null;
  const d = toDate(value);
  return Number.isNaN(d.getTime()) ? null : formatMuscat(d, lang, { dateStyle: 'medium' });
}

function Note({ tone = 'warn', icon = 'warning', title, children }) {
  const box = { warn: 'border-warn/50 bg-warn/10', info: 'border-info/50 bg-info/10', cut: 'border-cut/50 bg-cut/10' };
  const ink = { warn: 'text-warn', info: 'text-info', cut: 'text-cut' };
  return (
    <div className={`flex items-start gap-3 rounded-ctl border p-3 ${box[tone] || box.warn}`}>
      <Icon name={icon} size={20} className={`mt-0.5 shrink-0 ${ink[tone] || ink.warn}`} />
      <div className="min-w-0 flex-1 text-sm text-text">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children}
      </div>
    </div>
  );
}

function LookingUp() {
  const { t } = useT();
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <p className="text-text">{t('entry.code.looking')}</p>
      <div className="flex gap-4">
        <div className="flex flex-1 flex-col gap-3">
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <Skeleton rounded="card" className="h-[120px] w-[96px] shrink-0" />
      </div>
    </div>
  );
}

/**
 * The look stored under a code, as the Studio may use it: complete and clamped
 * (lengths 0..200 mm, offsets, grey, fade; unknown keys such as a picture dropped),
 * with the code's style. Anyone with the Try-at-home link can write a code, so it is
 * never used as stored: a code whose look still names unknown options (lines,
 * finish, color, mustache, preset, style id) is refused (`errors` not empty).
 */
function checkLookCode(doc) {
  const out = checkLookParams(doc && doc.params, doc && doc.styleId);
  if (doc && doc.invalid === true && !out.errors.length) out.errors.push('catalog.err.style');
  return out;
}

/** The look behind the code: style name in both languages, summary, zone diagram, dates. */
function FoundLook({ doc, params, style, guardChart }) {
  const { t, lang, pick } = useT();
  const name = style ? pick(style.name) : t('entry.code.savedLook');
  const other = style && style.name && typeof style.name === 'object' ? style.name[lang === 'ar' ? 'en' : 'ar'] || null : null;
  // lookSummary starts with the style name (or the raw id when the style is gone): the heading shows it.
  const parts = lookSummary(params, lang, style || null).split(' · ');
  const lead = style ? pick(style.name) : params.styleId || doc.styleId || '';
  if (parts.length && parts[0] === lead) parts.shift();
  const summary = parts.join(' · ');
  const created = dateText(doc.createdAt, lang);
  const until = dateText(doc.expiresAt, lang);
  const usedOn = dateText(doc.usedAt, lang);

  return (
    <section aria-labelledby="found-look" className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-keep">
        <Icon name="check" size={18} />
        {t('entry.code.found')}
      </p>
      <div className="flex items-start gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 id="found-look" className="font-display text-2xl leading-tight">
            <bdi>{name}</bdi>
          </h2>
          {other && other !== name ? (
            <p className="text-sm text-text-2">
              <bdi>{other}</bdi>
            </p>
          ) : null}
          {summary ? <p className="mt-2 text-text">{summary}</p> : null}
          <div className="num mt-2 flex flex-col text-sm text-text-2">
            {created ? <span>{t('entry.code.created', { date: created })}</span> : null}
            {until ? <span>{t('entry.code.validUntil', { date: until })}</span> : null}
          </div>
        </div>
        <ZoneDiagram params={params} view="front" size={104} guardChart={guardChart} showLabels={false} className="shrink-0" />
      </div>
      {doc.used ? (
        <Note tone="warn" icon="clock" title={usedOn ? t('entry.code.used', { date: usedOn }) : null}>
          <p>{t('entry.code.usedNote')}</p>
        </Note>
      ) : null}
      {!style ? (
        <Note tone="info" icon="info">
          <p>{t('entry.code.missingStyle')}</p>
        </Note>
      ) : null}
      <p className="flex items-start gap-2 border-t border-line pt-3 text-sm text-text-2">
        <Icon name="camera" size={18} className="mt-0.5 shrink-0" />
        <span>{t('entry.code.nextStep')}</span>
      </p>
    </section>
  );
}

/**
 * S14: Look Code entry (/s/:shopId/look-code). The customer made the look at home;
 * the barber types the code, takes fresh photos, and the Studio opens with that look
 * (PRD 8.2 step 5). Lookup needs internet; everything else works offline.
 */
export default function S14LookCodeEntry() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const online = useOnline();
  const { shopId, settings } = useShop();
  const demo = useDemo();
  const { client, consultationId, approved, wipe, setLookCode, setActiveParams, setClient, path } = useSession();
  const [code, setCode] = useState('');
  const [result, setResult] = useState({ status: 'idle', code: '', doc: null });
  const seqRef = useRef(0);
  const leavingRef = useRef(false);

  const shopStyles = useLive((cb, onError) => watchStyles(shopId, cb, { includeHidden: true }, onError), [shopId]);

  const lookup = useCallback(
    (value) => {
      seqRef.current += 1;
      const seq = seqRef.current;
      // Demo mode reads this browser's codes: no internet needed.
      if (!demo && typeof navigator !== 'undefined' && navigator.onLine === false) {
        setResult({ status: 'offline', code: value, doc: null });
        return;
      }
      setResult({ status: 'loading', code: value, doc: null });
      getLookCode(shopId, value).then(
        (doc) => {
          if (seq !== seqRef.current) return;
          if (!doc) setResult({ status: 'notFound', code: value, doc: null });
          else if (doc.expired) setResult({ status: 'expired', code: value, doc });
          else if (checkLookCode(doc).errors.length) setResult({ status: 'invalid', code: value, doc });
          else setResult({ status: 'found', code: value, doc });
        },
        (err) => {
          if (seq !== seqRef.current) return;
          console.warn('Look Code lookup failed', err);
          const offline = err?.code === 'unavailable' || navigator.onLine === false;
          setResult({ status: offline ? 'offline' : 'error', code: value, doc: null });
        },
      );
    },
    [shopId, demo],
  );

  const onCodeChange = (next) => {
    setCode(next);
    if (next.length === LIMITS.lookCodeLength) {
      lookup(next);
    } else {
      seqRef.current += 1;
      setResult({ status: 'idle', code: next, doc: null });
    }
  };

  // Back online with a complete code that could not be looked up: look it up now.
  useEffect(() => {
    if (online && result.status === 'offline' && result.code.length === LIMITS.lookCodeLength) lookup(result.code);
  }, [online, result.status, result.code, lookup]);

  // A client picked for this visit is kept; one left over from a finished or saved
  // consultation is not (the look then starts as a walk-in).
  const chosenClient =
    client && client.id && !consultationId && !approved
      ? { id: client.id, displayName: client.displayName || null, walkIn: false }
      : null;

  const doc = result.doc;
  const checked = doc ? checkLookCode(doc) : null;
  const styleId = checked ? checked.params.styleId : null;
  const shopStyle =
    styleId && Array.isArray(shopStyles.data) ? shopStyles.data.find((s) => s.id === styleId) || null : null;
  const style = shopStyle || (styleId ? getStyle(styleId) : null);

  const clear = () => onCodeChange('');

  const loadLook = () => {
    if (!doc || !checked || leavingRef.current) return;
    // Only a valid look reaches the Studio and the Cut Card.
    if (checked.errors.length) {
      setResult({ status: 'invalid', code: result.code, doc });
      return;
    }
    leavingRef.current = true;
    const { params } = checked;
    const pending = wipe('lookCode');
    setLookCode({ code: doc.code, styleId: params.styleId, params });
    setActiveParams(params);
    setClient(chosenClient || { id: null, displayName: null, walkIn: true });
    try {
      markLookCodeUsed(shopId, doc.code);
    } catch (err) {
      console.warn('markLookCodeUsed failed', err);
    }
    navigate(path('capture'));
    Promise.resolve(pending).catch((err) => console.warn('session wipe did not finish', err));
  };

  const startFresh = () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    const pending = wipe('newCustomer');
    setClient(chosenClient || { id: null, displayName: null, walkIn: true });
    navigate(path('capture'));
    Promise.resolve(pending).catch((err) => console.warn('session wipe did not finish', err));
  };

  const status = result.status;
  const complete = code.length === LIMITS.lookCodeLength;
  const showKeypad = status !== 'found' && status !== 'expired' && status !== 'invalid' && status !== 'loading';
  let codeError = null;
  if (status === 'notFound') codeError = t('entry.code.notFound');
  else if (status === 'error') codeError = t('entry.code.error');

  let footer;
  if (status === 'found') {
    footer = (
      <Button icon="camera" onClick={loadLook}>
        {doc && doc.used ? t('entry.code.loadAnyway') : t('entry.code.load')}
      </Button>
    );
  } else if (status === 'expired' || status === 'invalid') {
    footer = (
      <BottomAction>
        <Button variant="secondary" icon="keypad" full onClick={clear}>
          {t('entry.code.another')}
        </Button>
        <Button variant="ghost" icon="camera" full onClick={startFresh}>
          {t('entry.code.newCustomer')}
        </Button>
      </BottomAction>
    );
  } else {
    footer = (
      <Button
        icon="search"
        loading={status === 'loading'}
        disabled={!complete || status === 'loading'}
        onClick={() => lookup(code)}
      >
        {t('entry.code.lookUp')}
      </Button>
    );
  }

  const expiredOn = status === 'expired' ? dateText(doc && doc.expiresAt, lang) : null;

  return (
    <ScreenFrame title={t('entry.code.title')} back={path('')} footer={footer}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1 text-center">
          <p className="text-text">{t('entry.code.lead')}</p>
          {chosenClient && chosenClient.displayName ? (
            <p className="text-sm text-text-2">{t('entry.code.forClient', { name: `\u2068${chosenClient.displayName}\u2069` })}</p>
          ) : null}
        </div>

        {demo && status === 'notFound' ? (
          <Note tone="info" icon="info">
            <p>{t('demo.sheet.links')}</p>
          </Note>
        ) : null}

        {(!online && !demo) || status === 'offline' ? (
          <Note tone="warn" icon="wifi-off" title={t('entry.code.offline')}>
            <p>{t('entry.code.offlineHelp')}</p>
          </Note>
        ) : null}

        <CodeBoxes
          value={code}
          onChange={onCodeChange}
          autoFocus
          keypad={showKeypad}
          label={t('ui.code.label')}
          error={codeError}
        />

        {status === 'loading' ? <LookingUp /> : null}

        {status === 'found' && doc ? (
          <>
            <FoundLook doc={doc} params={checked.params} style={style} guardChart={settings.guardChart} />
            <Button variant="ghost" icon="keypad" className="self-center" onClick={clear}>
              {t('entry.code.another')}
            </Button>
          </>
        ) : null}

        {status === 'invalid' ? (
          <Note tone="cut" icon="warning" title={t('entry.code.invalidTitle')}>
            <p className="mt-1 text-text-2">{t('entry.code.invalidHelp')}</p>
          </Note>
        ) : null}

        {status === 'expired' ? (
          <Note tone="cut" icon="clock" title={t('entry.code.expiredTitle')}>
            {expiredOn ? <p className="num">{t('entry.code.expired', { date: expiredOn })}</p> : null}
            <p className="mt-1 text-text-2">{t('entry.code.expiredHelp')}</p>
          </Note>
        ) : null}
      </div>
    </ScreenFrame>
  );
}
