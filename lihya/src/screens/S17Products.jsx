import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../lib/i18n/useT.js';
import { useShop } from '../state/ShopContext.jsx';
import { useLive } from '../hooks/useLive.js';
import { addProduct, importProducts, updateProduct, watchProducts } from '../services/products.js';
import { parseProductsCsv } from '../reports/csv.js';
import BottomAction from '../components/BottomAction.jsx';
import Button from '../components/Button.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import OwnerShell from '../components/OwnerShell.jsx';
import ScreenFrame from '../components/ScreenFrame.jsx';
import { useSnackbar } from '../components/Snackbar.jsx';
import ProductForm, { PRODUCT_FORM_ID } from './manage/ProductForm.jsx';
import ProductImport from './manage/ProductImport.jsx';
import ProductRow from './manage/ProductRow.jsx';
import { Card, ListSkeleton } from './manage/ui.jsx';
import { EMPTY, PRODUCT_CATEGORIES, checkProduct, productDraft, productNames, sameDraft } from './manage/util.js';

const FIELD_ERRORS = { name: 'manage.prod.err.name', nameAr: 'manage.prod.err.name', category: 'manage.prod.err.category', priceOmr: 'manage.prod.err.price' };

function isCsv(file) {
  const name = String((file && file.name) || '').toLowerCase();
  const type = String((file && file.type) || '').toLowerCase();
  return name.endsWith('.csv') || type.includes('csv') || (type === 'text/plain' && !name.includes('.'));
}

function snapshot(p) {
  return { name: p.name || '', nameAr: p.nameAr || '', category: p.category, priceOmr: Number(p.priceOmr) || 0, active: p.active !== false };
}

/** S17: products and services (/s/:shopId/owner/products, owner and manager). Prices only come from here. */
export default function S17Products() {
  const { t, lang } = useT();
  const { shopId } = useShop();
  const { show } = useSnackbar();

  const [attempt, setAttempt] = useState(0);
  const live = useLive((cb, onError) => watchProducts(shopId, cb, onError), [shopId, attempt]);
  const products = live.data || EMPTY;
  const loaded = !live.loading && !live.error && Array.isArray(live.data);

  const [form, setForm] = useState(null); // { mode: 'add'|'edit', id, draft, initial, errors }
  const [imp, setImp] = useState(null); // { phase: 'reading'|'parsed'|'error'|'done', ... }
  const formHeadingRef = useRef(null);
  const importHeadingRef = useRef(null);
  const inputRef = useRef(null);
  const focusForm = useRef(false);
  const focusImport = useRef(false);
  const readSeq = useRef(0);
  const scrollTimer = useRef(0);

  // Within a category, by name only: switching an item off must not make its row jump away.
  const groups = useMemo(() => {
    const collator = new Intl.Collator(lang === 'ar' ? 'ar' : 'en');
    const byName = (a, b) => collator.compare(productNames(a, lang).primary, productNames(b, lang).primary) || String(a.id).localeCompare(String(b.id));
    return PRODUCT_CATEGORIES.map((c) => ({ id: c, items: products.filter((p) => p.category === c).sort(byName) })).filter((g) => g.items.length);
  }, [products, lang]);
  const activeCount = useMemo(() => products.filter((p) => p.active !== false).length, [products]);
  const editing = form && form.mode === 'edit' && !products.some((p) => p.id === form.id) ? null : form;

  // Move focus to the form heading (or the import card) once it is on screen.
  useEffect(() => {
    if (focusForm.current && formHeadingRef.current) {
      focusForm.current = false;
      formHeadingRef.current.focus({ preventScroll: true });
      formHeadingRef.current.closest('form')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    if (focusImport.current && importHeadingRef.current) {
      focusImport.current = false;
      const heading = importHeadingRef.current;
      heading.focus({ preventScroll: true });
      // The list above may still grow (an import lands in the live list a moment later).
      clearTimeout(scrollTimer.current);
      scrollTimer.current = setTimeout(() => heading.closest('section')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 250);
    }
  });
  useEffect(() => () => clearTimeout(scrollTimer.current), []);

  /** Close the open form; unsaved edits can be brought back with Undo. */
  const dropForm = useCallback(() => {
    if (!form) return;
    const left = form;
    setForm(null);
    if (sameDraft(left.draft, left.initial)) return;
    show({
      message: t('manage.prod.discarded'),
      actionLabel: t('common.undo'),
      onAction: () => {
        focusForm.current = true;
        setForm(left);
      },
    });
  }, [form, show, t]);

  const openForm = (mode, product) => {
    const id = product ? product.id : null;
    if (form && form.mode === mode && form.id === id) {
      focusForm.current = true;
      setForm((f) => ({ ...f }));
      return;
    }
    if (form) dropForm();
    const draft = productDraft(product);
    focusForm.current = true;
    setForm({ mode, id, draft, initial: draft, errors: {} });
  };

  const changeDraft = (draft) =>
    setForm((f) => {
      if (!f) return f;
      const errors = { ...f.errors };
      if (errors.name && (draft.name.trim() || draft.nameAr.trim())) delete errors.name;
      if (errors.category && draft.category) delete errors.category;
      if (errors.price && draft.price !== f.draft.price) delete errors.price;
      return { ...f, draft, errors };
    });

  const saveForm = () => {
    if (!form) return;
    const { value, errors } = checkProduct(form.draft);
    if (Object.keys(errors).length) {
      setForm((f) => ({ ...f, errors }));
      return;
    }
    const name = productNames(value, lang).primary;
    try {
      if (form.mode === 'add') {
        addProduct(shopId, value);
        setForm(null);
        show({ message: t('manage.prod.added', { name }) });
      } else {
        const before = products.find((p) => p.id === form.id);
        updateProduct(shopId, form.id, value);
        setForm(null);
        show({
          message: t('manage.prod.updated', { name }),
          actionLabel: before ? t('common.undo') : undefined,
          onAction: before
            ? () => {
                try {
                  updateProduct(shopId, before.id, snapshot(before));
                } catch (err) {
                  console.error('undo product edit failed', err);
                  show({ message: t('manage.prod.err.generic') });
                }
              }
            : undefined,
        });
      }
    } catch (err) {
      if (err && err.code === 'invalid-argument' && Array.isArray(err.fields)) {
        const mapped = {};
        for (const f of err.fields) {
          const key = f === 'priceOmr' ? 'price' : f === 'nameAr' ? 'name' : f;
          mapped[key] = FIELD_ERRORS[f] || 'manage.prod.err.generic';
        }
        setForm((f) => ({ ...f, errors: mapped }));
      } else {
        console.error('product save failed', err);
        show({ message: t('manage.prod.err.generic') });
      }
    }
  };

  const onActive = useCallback(
    (product, on) => {
      const name = productNames(product, lang).primary;
      try {
        updateProduct(shopId, product.id, { active: on });
      } catch (err) {
        console.error('product toggle failed', err);
        show({ message: t('manage.prod.err.generic') });
        return;
      }
      show({
        message: t(on ? 'manage.prod.activated' : 'manage.prod.deactivated', { name }),
        actionLabel: t('common.undo'),
        onAction: () => {
          try {
            updateProduct(shopId, product.id, { active: !on });
          } catch (err) {
            console.error('undo product toggle failed', err);
          }
        },
      });
    },
    [shopId, show, t, lang],
  );

  // ------------------------------------------------------------ CSV import

  const pickFile = async (file) => {
    dropForm();
    const seq = ++readSeq.current;
    focusImport.current = true;
    if (!isCsv(file)) {
      setImp({ phase: 'error', messageKey: 'manage.imp.notCsv' });
      return;
    }
    setImp({ phase: 'reading', file: file.name });
    try {
      const text = await file.text();
      if (seq !== readSeq.current) return;
      const parsed = parseProductsCsv(text);
      setImp({ phase: 'parsed', file: file.name, parsed, filter: 'all', garbled: text.includes('�') });
    } catch (err) {
      console.error('CSV read failed', err);
      if (seq === readSeq.current) setImp({ phase: 'error', messageKey: 'manage.imp.readFailed.body' });
    }
  };

  const runImport = () => {
    if (!imp || imp.phase !== 'parsed' || !imp.parsed.rows.length) return;
    try {
      const rows = imp.parsed.rows.map((r) => ({ name: r.name, nameAr: r.nameAr, category: r.category, priceOmr: r.priceOmr, active: r.active }));
      const res = importProducts(shopId, rows);
      focusImport.current = true;
      setImp({ phase: 'done', result: { imported: res.imported, updated: res.updated, skipped: res.skipped + imp.parsed.errors.length } });
    } catch (err) {
      console.error('import failed', err);
      show({ message: t('manage.imp.failed') });
    }
  };

  const resetImport = () => {
    readSeq.current += 1;
    setImp(null);
  };

  // ------------------------------------------------------------ render

  const importReady = imp && imp.phase === 'parsed' ? imp.parsed.rows.length : 0;
  let footer;
  if (editing) {
    footer = (
      <Button type="submit" form={PRODUCT_FORM_ID} icon="check">
        {editing.mode === 'add' ? t('manage.prod.save') : t('manage.prod.saveChanges')}
      </Button>
    );
  } else if (imp && imp.phase === 'parsed' && imp.parsed.total) {
    footer = (
      <Button icon="upload" onClick={runImport} disabled={!importReady}>
        {importReady === 1 ? t('manage.imp.importOne') : importReady ? t('manage.imp.importN', { n: importReady }) : t('manage.imp.none')}
      </Button>
    );
  } else {
    footer = (
      <Button icon="plus" onClick={() => openForm('add', null)} disabled={!loaded}>
        {t('manage.prod.add')}
      </Button>
    );
  }

  const formFor = (mode, product) => (
    <ProductForm
      draft={editing.draft}
      onChange={changeDraft}
      errors={editing.errors}
      onSubmit={saveForm}
      onCancel={dropForm}
      title={mode === 'add' ? t('manage.prod.newTitle') : t('manage.prod.editTitle', { name: productNames(product, lang).primary })}
      headingRef={formHeadingRef}
      headingLevel={mode === 'add' ? 2 : 3}
      t={t}
      lang={lang}
    />
  );

  let list;
  if (live.error) {
    list = <ErrorState message={t('manage.prod.error')} onRetry={() => setAttempt((n) => n + 1)} />;
  } else if (!loaded) {
    list = <ListSkeleton label={t('manage.prod.loading')} rows={3} rowClassName="h-24" />;
  } else if (!products.length) {
    list = editing ? null : (
      <div className="rounded-card border border-dashed border-line">
        <EmptyState
          icon="box"
          title={t('manage.prod.empty.title')}
          message={t('manage.prod.empty.body')}
          action={
            <div className="mt-2 flex w-full max-w-sm flex-col gap-2 text-start">
              <p className="flex items-start gap-2 text-sm text-text">
                <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-brass/60 text-xs text-brass">1</span>
                {t('manage.prod.empty.way1')}
              </p>
              <p className="flex items-start gap-2 text-sm text-text">
                <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-brass/60 text-xs text-brass">2</span>
                {t('manage.prod.empty.way2')}
              </p>
            </div>
          }
        />
      </div>
    );
  } else {
    list = groups.map((g) => (
      <Card
        key={g.id}
        title={t(`manage.prod.group.${g.id}`)}
        level={2}
        actions={<span className="num rounded-full border border-line px-2.5 py-0.5 text-sm text-text-2">{g.items.length}</span>}
        bodyClassName="gap-0 py-0"
      >
        <ul className="divide-y divide-line">
          {g.items.map((p) =>
            editing && editing.mode === 'edit' && editing.id === p.id ? (
              <li key={p.id} className="py-3">
                {formFor('edit', p)}
              </li>
            ) : (
              <ProductRow key={p.id} product={p} onActive={onActive} onEdit={(x) => openForm('edit', x)} t={t} lang={lang} />
            ),
          )}
        </ul>
      </Card>
    ));
  }

  return (
    <OwnerShell>
      <ScreenFrame title={t('ui.owner.products')} wide footer={<BottomAction>{footer}</BottomAction>}>
        <div className="relative grid items-start gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-6">
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-col gap-1">
              <p className="text-text-2">{t('manage.prod.intro')}</p>
              {loaded && products.length ? (
                <p className="num text-sm text-text-2">{t('manage.prod.count', { n: products.length, active: activeCount })}</p>
              ) : null}
            </div>
            {editing && editing.mode === 'add' ? formFor('add', null) : null}
            {list}
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <ProductImport
              state={imp}
              inputRef={inputRef}
              onPick={pickFile}
              onReset={resetImport}
              onFilter={(filter) => setImp((s) => (s ? { ...s, filter } : s))}
              t={t}
              lang={lang}
              headingRef={importHeadingRef}
            />
          </div>
        </div>
      </ScreenFrame>
    </OwnerShell>
  );
}
