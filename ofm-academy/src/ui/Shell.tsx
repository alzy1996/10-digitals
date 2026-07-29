/**
 * App shell. Sets dir/lang on the document so the whole layout mirrors in
 * Arabic - progress direction, icons and spacing included, not just text
 * (PRD 5.11).
 */

import { useEffect, type ReactNode } from "react";
import { isRtl } from "../content";
import { useUi } from "../state/ui";
import { useT } from "./bits";

export function Shell({ children }: { children: ReactNode }) {
  const { t, lang } = useT();
  const toggleLang = useUi((s) => s.toggleLang);
  const route = useUi((s) => s.route);
  const go = useUi((s) => s.go);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = isRtl(lang) ? "rtl" : "ltr";
  }, [lang]);

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col">
      <header className="sticky top-0 z-10 border-b border-slate-900/5 bg-ofm-bg/90 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-3">
          {route.name !== "home" ? (
            <button className="btn-ghost !px-3 !py-2" onClick={() => go({ name: "home" })}>
              <span aria-hidden>{isRtl(lang) ? "→" : "←"}</span>
              <span className="sr-only">{t.nav.back}</span>
            </button>
          ) : null}

          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold text-sls-ink">{t.app.title}</div>
            <div className="truncate text-xs text-slate-500">{t.app.org}</div>
          </div>

          <button
            className="btn-ghost !px-3 !py-2 text-sm"
            onClick={toggleLang}
            aria-label={t.nav.language}
          >
            {t.nav.language}
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 py-5">{children}</main>

      <footer className="px-4 pb-6 pt-2 text-center text-xs text-slate-400">
        {t.app.tagline}
      </footer>
    </div>
  );
}
