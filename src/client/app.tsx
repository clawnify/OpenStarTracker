// The shell: which screen is showing, and the one piece of state they share,
// the sync. Screens refetch whenever `version` moves, which is after a sync
// finishes, after a settings change, and after the dashboard chat edits data.

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowsClockwise } from "@phosphor-icons/react";
import { AppNav, reportLocation, useHostChanges, useHostNavigate, type AppNavItem } from "@clawnify/app/client";
import { api, type Status } from "./api";
import { routeFromPath, pathFor, type Route } from "./routing";
import { primaryClass, Banner } from "./ui";
import { OverviewScreen } from "./overview";
import { ReposScreen } from "./repos";
import { RepoScreen } from "./repo";
import { TrafficScreen } from "./traffic";
import { SettingsScreen, FirstRun } from "./settings";

export interface SyncState {
  running: boolean;
  done: number;
  total: number;
  error: string | null;
}

export function App() {
  const [route, setRoute] = useState<Route>(() => routeFromPath(window.location.pathname, window.location.search));
  const [status, setStatus] = useState<Status | null>(null);
  const [version, setVersion] = useState(0);
  const [sync, setSync] = useState<SyncState>({ running: false, done: 0, total: 0, error: null });
  const [error, setError] = useState("");
  const running = useRef(false);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await api.status());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus, version]);

  const go = useCallback((next: Route) => {
    const path = pathFor(next);
    if (path !== window.location.pathname + window.location.search) window.history.pushState(null, "", path);
    setRoute(next);
    reportLocation(path);
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const onPop = () => setRoute(routeFromPath(window.location.pathname, window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // The dashboard chat can open any page, and refreshes us after it writes.
  useHostNavigate((path) => {
    const url = new URL(path, window.location.origin);
    go(routeFromPath(url.pathname, url.search));
  });
  useHostChanges(() => setVersion((v) => v + 1));

  /**
   * Read GitHub now: call the bounded sync step until nothing is left. The
   * count is real (repos read of repos to read), so a long first sync reads as
   * progress rather than a hang.
   */
  const refresh = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setSync({ running: true, done: 0, total: 0, error: null });
    let done = 0;
    try {
      for (let guard = 0; guard < 200; guard++) {
        const step = await api.syncStep();
        if (step.status === "in-progress") {
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        done += step.processed;
        setSync({ running: true, done, total: done + step.remaining, error: null });
        if (step.status === "failed" || (step.remaining > 0 && step.processed === 0)) {
          setSync({ running: false, done, total: done + step.remaining, error: step.errors[0] ?? "The sync stopped." });
          return;
        }
        if (step.remaining === 0) break;
      }
      setSync({ running: false, done, total: done, error: null });
    } catch (e) {
      setSync({ running: false, done, total: done, error: (e as Error).message });
    } finally {
      running.current = false;
      setVersion((v) => v + 1);
    }
  }, []);

  const nav: AppNavItem[] = [
    { id: "overview", label: "Overview", href: "/", home: true },
    { id: "repos", label: "Repositories", href: "/repos", icon: "star", color: "amber", count: status?.tracked || undefined },
    { id: "traffic", label: "Traffic", href: "/traffic", icon: "activity", color: "green" },
    { id: "settings", label: "Settings", href: "/settings", icon: "settings" },
  ];
  const active = route.view === "repo" ? "repos" : route.view;
  const configured = Boolean(status?.settings);

  const refreshButton = (
    <button type="button" className={primaryClass} onClick={() => void refresh()} disabled={sync.running || !configured}>
      <ArrowsClockwise size={16} className={sync.running ? "animate-spin motion-reduce:animate-none" : ""} aria-hidden />
      {sync.running ? (sync.total ? `Reading ${sync.done} of ${sync.total}` : "Reading GitHub…") : "Refresh"}
    </button>
  );

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <AppNav
        title="OpenStarTracker"
        icon="star"
        groups={[{ items: nav }]}
        active={active}
        onNavigate={(item) => go(routeFromPath(item.href ?? "/", ""))}
      />
      <main className="min-w-0 flex-1">
        {error && (
          <div className="px-6 pt-6">
            <Banner tone="danger">{error}</Banner>
          </div>
        )}
        {sync.error && (
          <div className="px-6 pt-6">
            <Banner tone="warning">{sync.error}</Banner>
          </div>
        )}
        {status === null ? (
          <div className="grid gap-4 p-6">
            <div className="skeleton h-7 w-48" />
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-24" />
              ))}
            </div>
            <div className="skeleton h-64" />
          </div>
        ) : !configured ? (
          <FirstRun
            token={status.token}
            onSaved={() => {
              setVersion((v) => v + 1);
              void refresh();
            }}
          />
        ) : route.view === "overview" ? (
          <OverviewScreen status={status} version={version} sync={sync} refreshButton={refreshButton} onGo={go} />
        ) : route.view === "repos" ? (
          <ReposScreen version={version} sort={route.sort} refreshButton={refreshButton} onGo={go} />
        ) : route.view === "repo" ? (
          <RepoScreen fullName={route.fullName} version={version} onGo={go} onChanged={() => setVersion((v) => v + 1)} />
        ) : route.view === "traffic" ? (
          <TrafficScreen status={status} version={version} refreshButton={refreshButton} onGo={go} />
        ) : (
          <SettingsScreen status={status} sync={sync} refreshButton={refreshButton} onSaved={() => setVersion((v) => v + 1)} onGo={go} />
        )}
      </main>
    </div>
  );
}
