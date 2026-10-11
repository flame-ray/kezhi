import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { parseWidgetTarget, type WidgetTarget } from './widgetNavigation';

// Read + acknowledge avoids losing a cold-start tap during storage hydration or
// React StrictMode's mount/cleanup cycle. No background polling.
export function useWidgetNavigation(enabled: boolean, onTarget: (target: WidgetTarget) => void) {
  const latest = useRef(onTarget); latest.current = onTarget;
  const handled = useRef('');
  useEffect(() => {
    if (!enabled) return;
    let alive = true, pending = false, again = false;
    const read = async () => {
      if (pending) { again = true; return; }
      pending = true;
      try {
        const result = await invoke<{pending:unknown}>('read_widget_navigation');
        if (!alive) return;
        const target = parseWidgetTarget(result.pending);
        if (target) {
          if (target.token !== handled.current) { latest.current(target); handled.current = target.token; }
          await invoke('acknowledge_widget_navigation', {content:target.token});
        }
      } catch { /* A resume or a new tap can safely retry the unacknowledged target. */ }
      finally { pending = false; if(alive && again) { again = false; void read(); } }
    };
    const resume = () => { if(document.visibilityState === 'visible') void read(); };
    window.addEventListener('kezhi-widget-open', resume);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    void read();
    return () => { alive = false; window.removeEventListener('kezhi-widget-open', resume); window.removeEventListener('focus', resume); document.removeEventListener('visibilitychange', resume); };
  }, [enabled]);
}
