import { useCallback, useEffect, useState } from "react";
import { getJapaneseDbStatus, reloadJapaneseDictionary, type JapaneseDbStatus } from "../../electron";

export function useJapaneseDb() {
  const [status, setStatus] = useState<JapaneseDbStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await getJapaneseDbStatus());
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const reload = useCallback(async () => {
    setReloading(true);
    try {
      setStatus(await reloadJapaneseDictionary());
    } catch {
      await refresh();
    } finally {
      setReloading(false);
    }
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, loading, reloading, refresh, reload };
}
