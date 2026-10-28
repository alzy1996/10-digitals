import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useT } from './lib/i18n.js';
import { useShop } from './state/shop.jsx';
import { useLive } from './lib/useLive.js';
import { createSignatureStyle, seedStyles, setStyleOrder, updateStyle, watchStyles } from './state/data.js';
import { useApp } from '../../hooks/useApp.jsx';
import OwnerLayout from '../../components/OwnerLayout.jsx';
import { LENGTH_FILTERS, matchesLength } from '../../ai/beard/lib/look.js';
import Button from './ui/Button.jsx';
import ChipRow from './ui/ChipRow.jsx';
import EmptyState from './ui/EmptyState.jsx';
import ErrorState from './ui/ErrorState.jsx';
import ScreenFrame from './ui/ScreenFrame.jsx';
import { useSnackbar } from './ui/snackbar.js';
import SignatureEditor from './manage/SignatureEditor.jsx';
import StyleRow from './manage/StyleRow.jsx';
import { ListSkeleton, LiveRegion } from './manage/ui.jsx';
import { EMPTY, canStepBack, draftFromStyle, sameDraft, styleNames } from './manage/util.js';

const VISIBILITY = ['all', 'shown', 'hidden', 'signature'];
const FOCUS_TTL_MS = 4000;

function matchesVisibility(style, vis) {
  if (vis === 'shown') return style.hidden !== true;
  if (vis === 'hidden') return style.hidden === true;
  if (vis === 'signature') return style.signature === true;
  return true;
}

/** Small count tile for the catalog summary. */
function Count({ label, value, tone }) {
  return (
    <div className="flex min-w-0 flex-col rounded-control border border-line bg-surface px-2.5 py-1.5">
      <span className="truncate text-xs text-ink2">{label}</span>
      <span className={`font-display num text-lg font-semibold leading-tight ${tone || 'text-ink'}`}>
        <bdi>{value}</bdi>
      </span>
    </div>
  );
}

/** S16: beard styles catalog (/owner/beard/styles, owner and manager), inside the shared owner layout. */
export default function S16CatalogManager() {
  const { t, lang } = useT();
  const { shopId, settings } = useShop();
  const { show } = useSnackbar();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const cloneId = searchParams.get('clone');
  const editId = searchParams.get('edit');
  const editorKey = editId ? `edit:${editId}` : cloneId ? `clone:${cloneId}` : null;

  const app = useApp();
  const [attempt, setAttempt] = useState(0);

  // First visit of an owner or manager: write the seed styles once, so a style hidden here
  // stays hidden for customers at home too (they can read published styles only).
  useEffect(() => {
    if (!shopId || !app.isManager) return undefined;
    let done = false;
    const unsub = watchStyles(shopId, (list, meta) => {
      if (done || !meta || meta.fromCache) return;
      done = true;
      if (meta.remoteCount === 0) seedStyles(shopId).catch((err) => console.warn('beard catalog seed failed', err));
    }, { includeHidden: true });
    return () => unsub && unsub();
  }, [shopId, app.isManager]);

  const live = useLive((cb, onError) => watchStyles(shopId, cb, { includeHidden: true }, onError), [shopId, attempt]);
  const styles = live.data || EMPTY;
  const loaded = !live.loading && !live.error && Array.isArray(live.data);

  const [length, setLength] = useState('all');
  const [vis, setVis] = useState('all');
  const [editor, setEditor] = useState(null);
  const [announce, setAnnounce] = useState('');
  const focusRef = useRef(null);
  // Key of an editor whose URL change is still on its way (router updates land in a transition).
  const openingRef = useRef(null);
  // One save per editor: a double tap on Save must not create two styles or go back twice.
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);

  const byId = useMemo(() => new Map(styles.map((s) => [s.id, s])), [styles]);
  const filtered = useMemo(() => styles.filter((s) => matchesLength(s, length) && matchesVisibility(s, vis)), [styles, length, vis]);
  const positions = useMemo(() => new Map(styles.map((s, i) => [s.id, i + 1])), [styles]);
  const counts = useMemo(
    () => ({
      total: styles.length,
      shown: styles.filter((s) => s.hidden !== true).length,
      hidden: styles.filter((s) => s.hidden === true).length,
      signature: styles.filter((s) => s.signature === true).length,
    }),
    [styles],
  );

  const nameOf = useCallback((style) => styleNames(style, lang).primary, [lang]);

  const fail = useCallback(
    (err) => {
      console.error('catalog change failed', err);
      show({ message: t('beard.manage.cat.saveFailed') });
    },
    [show, t],
  );

  // ------------------------------------------------------------ list actions

  const onHidden = useCallback(
    (style, hidden) => {
      try {
        updateStyle(shopId, style, { hidden });
      } catch (err) {
        fail(err);
        return;
      }
      const name = nameOf(style);
      show({
        message: t(hidden ? 'manage.cat.hiddenMsg' : 'manage.cat.shownMsg', { name }),
        actionLabel: t('beard.common.undo'),
        onAction: () => {
          try {
            updateStyle(shopId, { ...style, hidden }, { hidden: !hidden });
          } catch (err) {
            fail(err);
          }
        },
      });
    },
    [shopId, show, t, fail, nameOf],
  );

  const onFit = useCallback(
    (style, localFit) => {
      if (!localFit || Number(style.localFit) === localFit) return;
      try {
        updateStyle(shopId, style, { localFit });
        setAnnounce(t('beard.manage.cat.fitMsg', { name: nameOf(style), n: localFit }));
      } catch (err) {
        fail(err);
      }
    },
    [shopId, t, fail, nameOf],
  );

  const onMove = useCallback(
    (style, dir) => {
      const i = filtered.findIndex((s) => s.id === style.id);
      const other = filtered[i + dir];
      if (i < 0 || !other) return;
      const ids = styles.map((s) => s.id);
      const a = ids.indexOf(style.id);
      const b = ids.indexOf(other.id);
      ids[a] = other.id;
      ids[b] = style.id;
      try {
        setStyleOrder(shopId, ids.map((id) => byId.get(id)).filter(Boolean));
      } catch (err) {
        fail(err);
        return;
      }
      focusRef.current = { id: style.id, selector: `[data-move="${dir < 0 ? 'up' : 'down'}"]`, at: Date.now() };
      setAnnounce(t('beard.manage.cat.moved', { name: nameOf(style), n: b + 1 }));
    },
    [filtered, styles, byId, shopId, fail, t, nameOf],
  );

  const openEditor = useCallback(
    (mode, style) => {
      const draft = draftFromStyle(style, mode);
      focusRef.current = { id: style.id, selector: `[data-action="${mode}"]`, at: Date.now() };
      openingRef.current = `${mode}:${style.id}`;
      setEditor({ key: `${mode}:${style.id}`, mode, styleId: style.id, draft, initial: draft });
      setSearchParams(mode === 'edit' ? { edit: style.id } : { clone: style.id }, { state: { fromList: true } });
    },
    [setSearchParams],
  );
  const onClone = useCallback((style) => openEditor('clone', style), [openEditor]);
  const onEdit = useCallback((style) => openEditor('edit', style), [openEditor]);

  const clearFilters = () => {
    setLength('all');
    setVis('all');
  };

  // Focus the control that was used (after a reorder, or when coming back from the editor).
  useEffect(() => {
    const target = focusRef.current;
    if (editorKey || !target || !loaded) return;
    if (Date.now() - target.at > FOCUS_TTL_MS) {
      focusRef.current = null;
      return;
    }
    const row = document.querySelector(`[data-style-id="${CSS.escape(target.id)}"]`);
    if (!row) return;
    let el = row.querySelector(target.selector);
    if (!el || el.disabled) el = row.querySelector('[data-move]:not([disabled])') || row.querySelector('button:not([disabled])');
    if (!el) return;
    focusRef.current = null;
    el.focus({ preventScroll: true });
    row.scrollIntoView({ block: 'nearest' });
  }, [styles, editorKey, loaded, filtered]);

  // ------------------------------------------------------------ editor state

  const editorStyle = editorKey ? byId.get(editId || cloneId) || null : null;
  const editorReady = Boolean(editor && editor.key === editorKey);

  // Deep link (or reload) into the editor: start a draft from the style once it is loaded.
  useEffect(() => {
    if (!editorKey || editorReady || !editorStyle) return;
    const mode = editId ? 'edit' : 'clone';
    if (mode === 'edit' && editorStyle.signature !== true) return;
    const draft = draftFromStyle(editorStyle, mode);
    setEditor({ key: editorKey, mode, styleId: editorStyle.id, draft, initial: draft });
  }, [editorKey, editorReady, editorStyle, editId]);

  useEffect(() => {
    if (editorKey && openingRef.current === editorKey) openingRef.current = null;
  }, [editorKey]);

  // Leaving the editor (Back, the browser back button) with unsaved edits: offer Undo.
  useEffect(() => {
    if (!editor || editorKey === editor.key || openingRef.current === editor.key) return;
    const left = editor;
    setEditor(null);
    if (sameDraft(left.draft, left.initial)) return;
    show({
      message: t('beard.manage.sig.discarded'),
      actionLabel: t('beard.common.undo'),
      onAction: () => {
        openingRef.current = left.key;
        setEditor(left);
        setSearchParams(left.mode === 'edit' ? { edit: left.styleId } : { clone: left.styleId }, { state: { fromList: true } });
      },
    });
  }, [editorKey, editor, show, t, setSearchParams]);

  const setDraft = useCallback((next) => {
    setEditor((e) => (e ? { ...e, draft: typeof next === 'function' ? next(e.draft) : next } : e));
  }, []);

  // A new editor (or the list) is ready for the next save.
  useEffect(() => {
    savingRef.current = false;
    setSaving(false);
  }, [editorKey]);

  // Back to the list. Opened from the list: step back over the editor's history entry, but
  // only when that entry belongs to this app (a deep-linked or reloaded editor replaces its
  // own URL instead, so Back or Save never leaves the app).
  const closeEditor = useCallback(() => {
    if (canStepBack(location.state, window.history.state)) navigate(-1);
    else setSearchParams({}, { replace: true });
  }, [location.state, navigate, setSearchParams]);

  const saveEditor = (patch) => {
    if (!editor || !editorStyle || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const name = patch.name[lang === 'ar' ? 'ar' : 'en'];
    let id = editorStyle.id;
    try {
      if (editor.mode === 'edit') updateStyle(shopId, editorStyle, patch);
      else id = createSignatureStyle(shopId, editorStyle, patch);
    } catch (err) {
      savingRef.current = false;
      setSaving(false);
      fail(err);
      return;
    }
    focusRef.current = { id, selector: '[data-action="edit"]', at: Date.now() };
    if (editor.mode === 'clone') {
      setLength('all');
      setVis((v) => (v === 'hidden' ? 'all' : v));
    }
    // Saved: the draft becomes the baseline, so leaving does not offer "Undo discard".
    setEditor((e) => (e ? { ...e, initial: e.draft } : e));
    closeEditor();
    show({ message: t(editor.mode === 'edit' ? 'manage.sig.updated' : 'manage.sig.created', { name }) });
  };

  // ------------------------------------------------------------ editor view

  if (editorKey) {
    let body = null;
    if (live.error) body = <ErrorState message={t('beard.manage.cat.error')} onRetry={() => setAttempt((n) => n + 1)} />;
    else if (!loaded) body = <ListSkeleton label={t('beard.manage.cat.loading')} rows={3} />;
    else if (!editorStyle) {
      body = (
        <EmptyState
          icon="catalog"
          title={t('beard.manage.sig.notFound.title')}
          message={t('beard.manage.sig.notFound.body')}
          actionLabel={t('beard.manage.sig.backToList')}
          actionIcon="arrow-left"
          onAction={closeEditor}
        />
      );
    } else if (editId && editorStyle.signature !== true) {
      body = (
        <EmptyState
          icon="lock"
          title={t('beard.manage.sig.notSignature.title')}
          message={t('beard.manage.sig.notSignature.body')}
          action={
            <Button variant="secondary" icon="copy" className="mt-2" onClick={() => setSearchParams({ clone: editorStyle.id }, { replace: true, state: location.state })}>
              {t('beard.manage.cat.clone')}
            </Button>
          }
        />
      );
    }
    if (body || !editorReady) {
      return (
        <ScreenFrame title={editId ? t('beard.manage.sig.editTitle') : t('beard.manage.sig.newTitle')} wide onBack={closeEditor}>
          <div className="relative">{body || <ListSkeleton label={t('beard.manage.cat.loading')} rows={3} />}</div>
        </ScreenFrame>
      );
    }
    return (
      <SignatureEditor
          mode={editor.mode}
          base={editorStyle}
          draft={editor.draft}
          setDraft={setDraft}
          onSave={saveEditor}
          onCancel={closeEditor}
          saving={saving}
          guardChart={settings && settings.guardChart ? settings.guardChart : undefined}
        t={t}
        lang={lang}
      />
    );
  }

  // ------------------------------------------------------------ list view

  const lengthOptions = [{ value: 'all', label: t('beard.catalog.length.all') }, ...LENGTH_FILTERS.map((f) => ({ value: f.id, label: t(f.labelKey) }))];
  const visOptions = VISIBILITY.map((v) => ({ value: v, label: t(`beard.manage.cat.vis.${v}`) }));
  const filtering = length !== 'all' || vis !== 'all';

  let content;
  if (live.error) {
    content = <ErrorState message={t('beard.manage.cat.error')} onRetry={() => setAttempt((n) => n + 1)} />;
  } else if (!loaded) {
    content = <ListSkeleton label={t('beard.manage.cat.loading')} rows={4} className="md:grid md:grid-cols-2 md:[&>p]:col-span-2" rowClassName="h-64" />;
  } else if (!styles.length) {
    content = <EmptyState icon="catalog" title={t('beard.manage.cat.empty.title')} message={t('beard.manage.cat.empty.body')} />;
  } else if (!filtered.length) {
    content = (
      <EmptyState
        icon="filter"
        title={t('beard.manage.cat.noMatch.title')}
        message={t('beard.manage.cat.noMatch.body')}
        actionLabel={t('beard.manage.cat.noMatch.action')}
        onAction={clearFilters}
      />
    );
  } else {
    content = (
      <ul className="grid gap-3 md:grid-cols-2" aria-label={t('beard.manage.cat.listLabel')}>
        {filtered.map((style, i) => (
          <StyleRow
            key={style.id}
            style={style}
            position={positions.get(style.id)}
            lang={lang}
            t={t}
            canUp={i > 0}
            canDown={i < filtered.length - 1}
            onHidden={onHidden}
            onFit={onFit}
            onMove={onMove}
            onClone={onClone}
            onEdit={onEdit}
            baseName={style.signature && style.baseId && byId.get(style.baseId) ? nameOf(byId.get(style.baseId)) : null}
          />
        ))}
      </ul>
    );
  }

  return (
    <OwnerLayout title={t('beard.nav.styles')}>
        {/* relative: keeps sr-only text inside the frame's scroller (it must not grow the page). */}
        <div className="relative flex flex-col gap-4">
          <LiveRegion message={announce} />
          <p className="max-w-2xl text-ink2">{t('beard.manage.cat.intro')}</p>
          {loaded && styles.length ? (
            <div className="grid max-w-xl grid-cols-4 gap-2">
              <Count label={t('beard.manage.cat.count.total')} value={counts.total} />
              <Count label={t('beard.manage.cat.count.shown')} value={counts.shown} tone="text-ok" />
              <Count label={t('beard.manage.cat.count.hidden')} value={counts.hidden} tone={counts.hidden ? 'text-warn' : 'text-ink2'} />
              <Count label={t('beard.manage.cat.count.signature')} value={counts.signature} tone="text-plum" />
            </div>
          ) : null}
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:gap-x-8">
            <ChipRow label={t('beard.manage.cat.filter.length')} options={lengthOptions} value={length} onChange={setLength} wrap={false} className="min-w-0 lg:[&>div]:mx-0 lg:[&>div]:flex-wrap lg:[&>div]:px-0" />
            <ChipRow label={t('beard.manage.cat.filter.visibility')} options={visOptions} value={vis} onChange={setVis} wrap={false} className="min-w-0 lg:[&>div]:mx-0 lg:[&>div]:flex-wrap lg:[&>div]:px-0" />
          </div>
          {loaded && filtering && filtered.length ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-ink2">
              <span>{t('beard.manage.cat.showing', { n: filtered.length, total: styles.length })}</span>
              <Button variant="ghost" size="sm" icon="close" onClick={clearFilters}>
                {t('beard.manage.cat.noMatch.action')}
              </Button>
            </div>
          ) : null}
          {loaded && filtering && filtered.length > 1 ? <p className="text-sm text-ink2">{t('beard.manage.cat.moveFiltered')}</p> : null}
          {content}
        </div>
    </OwnerLayout>
  );
}
