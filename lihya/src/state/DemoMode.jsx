import { useContext, useEffect } from 'react';
import { demoMode } from '../lib/appMode.js';
import { PREF_KEYS } from '../config/app.js';
import { signOutAndClear } from '../services/auth.js';
import { DemoContext } from '../components/kit.js';

// Demo mode (src/lib/appMode.js): the whole app knows through DemoContext, so the UI kit
// can show the Demo pill and hide the sync badge without importing a service, and screens
// can swap "Sign out" for "Reset demo". Outside demo mode the context stays null and
// nothing here renders or changes anything.

const DEMO = Object.freeze({
  /** Empties this browser's demo and reloads the start screen (auth.signOutAndClear). */
  reset: () => signOutAndClear({ to: '/' }),
});

/**
 * Reset demo in another tab moves this browser to a new demo database and deletes the old
 * one under this tab, whose screens would then say the shop could not open. Load this
 * page again on the new database instead (a shop link of the old demo then says so).
 */
function ResetInOtherTab() {
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === PREF_KEYS.demoGeneration && event.newValue !== event.oldValue) window.location.reload();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  return null;
}

export function DemoProvider({ children }) {
  if (!demoMode) return children;
  return (
    <DemoContext.Provider value={DEMO}>
      <ResetInOtherTab />
      {children}
    </DemoContext.Provider>
  );
}

/** { reset } in demo mode, null otherwise. */
export function useDemo() {
  return useContext(DemoContext);
}

export default DemoProvider;
