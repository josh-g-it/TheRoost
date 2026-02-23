import { useState, useEffect } from "react";
import { updaterApi } from "../services/tauri";

let cachedVersion: string | null = null;

export function useAppVersion(): string {
  const [version, setVersion] = useState(cachedVersion ?? "...");

  useEffect(() => {
    if (cachedVersion) {
      setVersion(cachedVersion);
      return;
    }
    updaterApi.getAppVersion().then((v) => {
      cachedVersion = v;
      setVersion(v);
    });
  }, []);

  return version;
}
