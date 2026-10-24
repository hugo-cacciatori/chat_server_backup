import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { BackupDescriptor } from "./types/backup";

export function App() {
  const [backups, setBackups] = useState<BackupDescriptor[]>([]);
  const [status, setStatus] = useState<string>("Initializing backup discovery…");

  useEffect(() => {
    invoke<BackupDescriptor[]>("list_discovered_backups")
      .then((items) => {
        setBackups(items);
        setStatus(`Discovered ${items.length} backup snapshot(s).`);
      })
      .catch(() => {
        setStatus("Ready (Tauri v2 core loaded).");
      });
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-slate-950 text-slate-100 p-8">
      <div className="max-w-lg w-full rounded-xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <h1 className="text-lg font-semibold tracking-tight text-white">ChatServerBackup</h1>
          <span className="rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-xs font-medium text-indigo-300">
            v0.2.0
          </span>
        </div>
        <p className="mt-4 text-sm text-slate-300">{status}</p>
        {backups.length > 0 && (
          <ul className="mt-4 space-y-2">
            {backups.map((b) => (
              <li
                key={b.json_path}
                className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs"
              >
                <span className="font-medium text-slate-200">{b.display_label}</span>
                <span
                  className={
                    b.is_edited
                      ? "text-amber-400 font-medium"
                      : "text-emerald-400 font-medium"
                  }
                >
                  {b.is_edited ? "Edited Snapshot" : "Original (Immutable)"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
