import { createElement, forwardRef, lazy } from 'react'

/**
 * A screen component loaded on demand (its own chunk, v0.5: keeps the first screen inside its load budget). Once
 * `preload()` has resolved it renders synchronously (no Suspense flash: the sheet mounts in the same commit as its
 * screen, so the App's layout and camera effects see it, as before code-splitting); before that it suspends like
 * React.lazy.
 * @param {() => Promise<Record<string, any>>} load dynamic import of the module
 * @param {string} exportName the component's named export
 */
export function lazyScreen(load, exportName) {
  let Comp = null
  let pending = null
  const preload = () =>
    (pending ??= load().then(
      (m) => {
        Comp = m[exportName]
      },
      (e) => {
        // a failed download (offline, a deploy in between) is tried again on the next open
        pending = null
        throw e
      },
    ))
  const Lazy = lazy(() => preload().then(() => ({ default: Comp })))
  const Screen = forwardRef(function LazyScreen(props, ref) {
    return createElement(Comp ?? Lazy, { ...props, ref })
  })
  Screen.preload = preload
  return Screen
}
