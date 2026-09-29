// Which account to track, GitHub access, and the sync's health. Also the
// first-run screen, which is the account question alone.

import { useState, type ReactNode } from "react";
import { CheckCircle, WarningCircle, Circle } from "@phosphor-icons/react";
import { api, type Status } from "./api";
import type { SyncState } from "./app";
import { relative } from "./format";
import type { Route } from "./routing";
import { Badge, Banner, Card, inputClass, primaryClass, Toolbar } from "./ui";

export function FirstRun({ token, onSaved }: { token: boolean; onSaved: () => void }) {
  const [owner, setOwner] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.saveSettings({ owner });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <form onSubmit={(e) => void save(e)} className="card w-full max-w-md p-6">
        <p className="text-xs text-muted">Step 1 of 1</p>
        <h1 className="mt-1 text-[1.375rem] leading-tight font-semibold tracking-[-0.01em]">Which GitHub account?</h1>
        <p className="mt-1.5 text-sm text-muted">
          A user or an organisation. Every public repo it owns is tracked from today, and each repo's star history is
          rebuilt as far back as GitHub allows.
        </p>
        <label className="mt-5 block">
          <span className="text-[0.8125rem] font-medium">GitHub login or profile link</span>
          <input
            className={`${inputClass} mt-1.5`}
            placeholder="vercel or https://github.com/vercel"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            autoFocus
            required
          />
        </label>
        {error && (
          <div className="mt-3">
            <Banner tone="danger">{error}</Banner>
          </div>
        )}
        {!token && (
          <p className="mt-3 text-[0.8125rem] text-muted">
            No GitHub token is set yet. GitHub may refuse to answer without one, and it never shows views or clones
            without one. Settings explains how to add it.
          </p>
        )}
        <button type="submit" className={`${primaryClass} mt-5 w-full`} disabled={busy || !owner.trim()}>
          {busy ? "Checking…" : "Start tracking"}
        </button>
      </form>
    </div>
  );
}

export function SettingsScreen({
  status,
  sync,
  refreshButton,
  onSaved,
}: {
  status: Status;
  sync: SyncState;
  refreshButton: ReactNode;
  onSaved: () => void;
  onGo: (r: Route) => void;
}) {
  const s = status.settings!;
  const [owner, setOwner] = useState(s.owner);
  const [forks, setForks] = useState(s.include_forks);
  const [archived, setArchived] = useState(s.include_archived);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const dirty = owner.trim() !== s.owner || forks !== s.include_forks || archived !== s.include_archived;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await api.saveSettings({ owner, include_forks: forks, include_archived: archived });
      setSaved(true);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const access = {
    no_token: { tone: "warning", label: "No token", icon: <WarningCircle size={16} aria-hidden /> },
    denied: { tone: "danger", label: "Cannot read traffic", icon: <WarningCircle size={16} aria-hidden /> },
    partial: { tone: "warning", label: "Some repos only", icon: <WarningCircle size={16} aria-hidden /> },
    ok: { tone: "success", label: "Reading traffic", icon: <CheckCircle size={16} aria-hidden /> },
    unknown: { tone: "info", label: "Not tried yet", icon: <Circle size={16} aria-hidden /> },
  } as const;
  const a = access[status.traffic];

  return (
    <>
      <Toolbar title="Settings" />
      <div className="mx-auto grid max-w-3xl gap-4 p-6">
        <Card title="What to track" hint="One GitHub user or organisation. Only its public repos are read.">
          <form onSubmit={(e) => void save(e)} className="grid gap-4">
            <label className="block">
              <span className="text-[0.8125rem] font-medium">GitHub account</span>
              <input className={`${inputClass} mt-1.5 max-w-sm`} value={owner} onChange={(e) => setOwner(e.target.value)} required />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={forks} onChange={(e) => setForks(e.target.checked)} className="size-4 accent-[var(--primary)]" />
              Include forks
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} className="size-4 accent-[var(--primary)]" />
              Include archived repos
            </label>
            {error && <Banner tone="danger">{error}</Banner>}
            <div className="flex items-center gap-3">
              <button type="submit" className={primaryClass} disabled={busy || !dirty}>
                {busy ? "Saving…" : "Save"}
              </button>
              {saved && !dirty && <span className="text-sm text-muted">Saved. Refresh to read the new list.</span>}
            </div>
          </form>
        </Card>

        <Card
          title="GitHub access"
          hint="Stars and forks are public. Views, clones and referrers are only shown to someone who can push to the repo."
          action={
            <Badge tone={a.tone}>
              <span className="inline-flex items-center gap-1">
                {a.icon}
                {a.label}
              </span>
            </Badge>
          }
        >
          <ol className="grid list-decimal gap-2 pl-5 text-sm text-muted">
            <li>
              On GitHub,{" "}
              <a className="text-link underline decoration-border underline-offset-2" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">
                create a fine-grained token
              </a>{" "}
              with <span className="text-foreground">{s.owner}</span> as the resource owner, access to all its public repositories, and{" "}
              <span className="text-foreground">Administration: read</span> under repository permissions. Nothing else is needed. An
              organisation may have to approve it.
            </li>
            <li>
              {status.scheduled ? (
                <>
                  In Clawnify, open <span className="text-foreground">Settings → Environment Variables</span> and add it as{" "}
                  <code className="rounded-xs bg-sunken px-1">GITHUB_TOKEN</code>. The app picks it up without a rebuild.
                </>
              ) : (
                <>
                  Set it as the <code className="rounded-xs bg-sunken px-1">GITHUB_TOKEN</code> secret of this Worker (
                  <code className="rounded-xs bg-sunken px-1">.dev.vars</code> locally).
                </>
              )}
            </li>
            <li>Press Refresh. Traffic appears for every repo the token can push to.</li>
          </ol>
        </Card>

        <Card title="Updates" hint={status.scheduled ? "Read from GitHub once a day, at 03:00 UTC, and whenever you press Refresh." : "No scheduler outside Clawnify: press Refresh to read GitHub."} action={refreshButton}>
          {status.next_sync_at && <p className="mb-3 text-sm text-muted">Next update {relative(status.next_sync_at)}.</p>}
          {sync.running && <p className="mb-3 text-sm text-muted">Reading GitHub now…</p>}
          {status.runs.length === 0 ? (
            <p className="text-sm text-muted">No updates yet.</p>
          ) : (
            <table className="w-full text-[0.8125rem]">
              <thead>
                <tr className="border-b border-rule text-left text-muted">
                  <th className="h-8 font-medium">When</th>
                  <th className="h-8 font-medium">Started by</th>
                  <th className="h-8 font-medium">Result</th>
                  <th className="h-8 text-right font-medium">Repos</th>
                  <th className="h-8 text-right font-medium">GitHub calls</th>
                </tr>
              </thead>
              <tbody>
                {status.runs.map((r) => (
                  <tr key={r.id} className="border-b border-rule align-top">
                    <td className="py-1.5">{relative(r.started_at)}</td>
                    <td className="py-1.5">{r.trigger === "schedule" ? "Schedule" : "Refresh"}</td>
                    <td className="py-1.5">
                      <Badge tone={r.status === "ok" ? "success" : r.status === "running" ? "info" : r.status === "partial" ? "warning" : "danger"}>
                        {r.status === "ok" ? "Done" : r.status === "running" ? "Running" : r.status === "partial" ? "Partly done" : "Failed"}
                      </Badge>
                      {r.error && <div className="mt-1 text-muted">{r.error}</div>}
                    </td>
                    <td className="tnum py-1.5 text-right">{r.repos}</td>
                    <td className="tnum py-1.5 text-right">{r.api_calls}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}
