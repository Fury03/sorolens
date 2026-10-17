"use client";

import { useCallback, useEffect, useState } from "react";

type SearchParamsUpdater = (params: URLSearchParams) => void;

export function useUrlSearchParams() {
  const [params, setParams] = useState(() => new URLSearchParams());

  useEffect(() => {
    const syncFromLocation = () =>
      setParams(new URLSearchParams(window.location.search));
    window.addEventListener("popstate", syncFromLocation);
    syncFromLocation();
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, []);

  const update = useCallback(
    (updater: SearchParamsUpdater, replace = false) => {
      const next = new URLSearchParams(window.location.search);
      updater(next);
      const query = next.toString();
      const url = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
      window.history[replace ? "replaceState" : "pushState"]({}, "", url);
      setParams(next);
    },
    []
  );

  return [params, update] as const;
}
