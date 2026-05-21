'use client';

import { useEffect, useRef } from 'react';

/**
 * Subscribe a page's data-loading callback to two refresh triggers:
 *
 * 1. The `lunch-data-changed` custom event — fired by `writeStore()` in
 *    client-db every time any localStorage entry is updated. Picks up
 *    deletes/edits performed on another page in the same SPA, in case
 *    the router keeps the current page's component instance alive (so
 *    its initial mount-time fetch doesn't run again).
 *
 * 2. `visibilitychange` going visible — fired when the user backgrounds
 *    the PWA and comes back. Covers the "left the app open since
 *    yesterday" case where in-memory state has drifted from reality
 *    (e.g. retention cleanup ran on another device, or the user
 *    edited orders on another phone via the JSON backup flow).
 *
 * The callback is read through a ref so callers don't have to memoize
 * it — the listener registration stays stable across renders.
 */
export function useDataRefresh(cb: () => void) {
  const cbRef = useRef(cb);
  cbRef.current = cb;

  useEffect(() => {
    const fire = () => cbRef.current();
    const onVisible = () => {
      if (document.visibilityState === 'visible') cbRef.current();
    };
    window.addEventListener('lunch-data-changed', fire);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('lunch-data-changed', fire);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}
