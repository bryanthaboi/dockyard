import MarkdownIt from "markdown-it";

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

const POLL_MS = 3500;
const LS_UI = "dockyard-ui-v1";

type Tab = "explorer" | "pending" | "create";

type Track = { repo: string; issue: string };

type Detail = {
  date: string;
  repo: string;
  issue: string;
  id: string;
  status: string;
  markdown: string;
};

type Persisted = {
  tab: Tab;
  expanded: string[];
  selectedDate: string | null;
  selectedRepo: string | null;
  selectedIssue: string | null;
};

function loadPersisted(): Persisted {
  try {
    const raw = localStorage.getItem(LS_UI);
    if (!raw) throw new Error("empty");
    const j = JSON.parse(raw) as Partial<Persisted>;
    return {
      tab: j.tab === "pending" || j.tab === "create" ? j.tab : "explorer",
      expanded: Array.isArray(j.expanded) ? j.expanded : [],
      selectedDate: typeof j.selectedDate === "string" ? j.selectedDate : null,
      selectedRepo: typeof j.selectedRepo === "string" ? j.selectedRepo : null,
      selectedIssue: typeof j.selectedIssue === "string" ? j.selectedIssue : null,
    };
  } catch {
    return {
      tab: "explorer",
      expanded: [],
      selectedDate: null,
      selectedRepo: null,
      selectedIssue: null,
    };
  }
}

function savePersisted(p: Persisted): void {
  try {
    localStorage.setItem(LS_UI, JSON.stringify(p));
  } catch {
    /* private mode */
  }
}

function expD(date: string): string {
  return `d:${date}`;
}
function expR(date: string, repo: string): string {
  return `r:${date}|${repo}`;
}
function expI(date: string, repo: string, issue: string): string {
  return `i:${date}|${repo}|${issue}`;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = (err as { error?: string }).error ?? res.statusText;
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

/** Parses `{ tracks: [{ repo, issue }] }` from GET /issues. */
function normalizeTracksPayload(data: unknown): Track[] {
  if (!data || typeof data !== "object") return [];
  const o = data as { tracks?: unknown };
  if (!Array.isArray(o.tracks)) return [];
  const out: Track[] = [];
  for (const t of o.tracks) {
    if (
      t !== null &&
      typeof t === "object" &&
      typeof (t as Track).repo === "string" &&
      typeof (t as Track).issue === "string"
    ) {
      out.push({ repo: (t as Track).repo, issue: (t as Track).issue });
    }
  }
  return out;
}

export function mount(root: HTMLElement): void {
  const persisted = loadPersisted();
  const expanded = new Set(persisted.expanded);

  const state: {
    tab: Tab;
    dates: string[];
    tracksByDate: Record<string, Track[]>;
    selectedDate: string | null;
    selectedRepo: string | null;
    selectedIssue: string | null;
    workOrders: { id: string; status: string }[];
    detail: Detail | null;
    pending: { date: string; repo: string; issue: string; id: string; status: string }[];
    pendingCount: number;
    error: string | null;
  } = {
    tab: persisted.tab,
    dates: [],
    tracksByDate: {},
    selectedDate: persisted.selectedDate,
    selectedRepo: persisted.selectedRepo,
    selectedIssue: persisted.selectedIssue,
    workOrders: [],
    detail: null,
    pending: [],
    pendingCount: 0,
    error: null,
  };

  function persistNow(): void {
    savePersisted({
      tab: state.tab,
      expanded: [...expanded],
      selectedDate: state.selectedDate,
      selectedRepo: state.selectedRepo,
      selectedIssue: state.selectedIssue,
    });
  }

  function toggleExp(key: string): void {
    if (expanded.has(key)) expanded.delete(key);
    else expanded.add(key);
    persistNow();
  }

  async function loadDates(): Promise<void> {
    const data = await fetchJson<{ dates: string[] }>("/dates");
    state.dates = data.dates;
  }

  /**
   * Loads issue tracks for a date. Always sets `tracksByDate[date]` to an array (never `undefined`)
   * so the sidebar never stays stuck on "Loading…".
   */
  async function loadTracks(date: string, force = false): Promise<void> {
    if (!force && state.tracksByDate[date] !== undefined) return;
    try {
      const res = await fetch(`/issues?date=${encodeURIComponent(date)}`);
      const text = await res.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        throw new Error(
          `GET /issues returned non-JSON (HTTP ${res.status}). Rebuild and restart Dockyard (pnpm run build), then restart the server.`,
        );
      }
      if (!res.ok) {
        const msg =
          typeof parsed === "object" &&
          parsed !== null &&
          "error" in parsed &&
          typeof (parsed as { error: unknown }).error === "string"
            ? (parsed as { error: string }).error
            : res.statusText;
        throw new Error(msg);
      }
      const tracks = normalizeTracksPayload(parsed);
      state.tracksByDate[date] = tracks;
      state.error = null;
    } catch (e) {
      state.tracksByDate[date] = [];
      state.error = e instanceof Error ? e.message : String(e);
    }
  }

  async function refreshPendingCount(): Promise<void> {
    const data = await fetchJson<{ pending: typeof state.pending }>("/work-orders/pending");
    state.pending = data.pending;
    state.pendingCount = data.pending.length;
  }

  async function loadWorkOrderList(date: string, repo: string, issue: string): Promise<void> {
    const q = new URLSearchParams({ date, issue, repo });
    const data = await fetchJson<{ workOrders: { id: string; status: string }[] }>(
      `/work-orders?${q}`,
    );
    state.workOrders = data.workOrders;
  }

  async function loadDetail(date: string, repo: string, issue: string, id: string): Promise<void> {
    const path = `/work-orders/${encodeURIComponent(date)}/${encodeURIComponent(repo)}/${encodeURIComponent(issue)}/${encodeURIComponent(id)}`;
    const data = await fetchJson<Detail>(path);
    state.detail = data;
  }

  async function loadPending(): Promise<void> {
    const data = await fetchJson<{ pending: typeof state.pending }>("/work-orders/pending");
    state.pending = data.pending;
    state.pendingCount = data.pending.length;
  }

  async function markComplete(): Promise<void> {
    if (!state.detail) return;
    const { date, repo, issue, id } = state.detail;
    const path = `/work-orders/${encodeURIComponent(date)}/${encodeURIComponent(repo)}/${encodeURIComponent(issue)}/${encodeURIComponent(id)}/complete`;
    await fetchJson(path, { method: "PATCH" });
    await loadDetail(date, repo, issue, id);
    if (state.selectedDate && state.selectedRepo != null && state.selectedIssue != null) {
      await loadWorkOrderList(state.selectedDate, state.selectedRepo, state.selectedIssue);
    }
    await refreshPendingCount();
    if (state.tab === "pending") await loadPending();
  }

  async function createWorkOrder(form: { date: string; repo: string; issue: string; content: string }): Promise<void> {
    await fetchJson("/work-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: form.date,
        repo: form.repo || undefined,
        issue: form.issue,
        content: form.content,
      }),
    });
  }

  function copyDetail(): void {
    if (!state.detail) return;
    void navigator.clipboard.writeText(state.detail.markdown);
  }

  function groupByRepo(tracks: Track[]): [string, string[]][] {
    const m = new Map<string, string[]>();
    for (const t of tracks) {
      if (!m.has(t.repo)) m.set(t.repo, []);
      m.get(t.repo)!.push(t.issue);
    }
    for (const issues of m.values()) issues.sort();
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }

  function renderSidebarExplorer(): string {
    if (state.dates.length === 0) {
      return '<div class="tree-empty">No work orders yet — use <strong>New order</strong>.</div>';
    }
    return state.dates
      .map((d) => {
        const openD = expanded.has(expD(d));
        const tracks = state.tracksByDate[d];
        const repoGroups = tracks ? groupByRepo(tracks) : [];
        const repoHtml = openD
          ? tracks === undefined
            ? '<span class="muted" style="padding:0.35rem 0.5rem;font-size:0.8rem">Loading…</span>'
            : repoGroups
                .map(([repo, issues]) => {
                  const openR = expanded.has(expR(d, repo));
                  const issueHtml = openR
                    ? issues
                        .map((issue) => {
                          const openI = expanded.has(expI(d, repo, issue));
                          const wos =
                            openI &&
                            state.selectedDate === d &&
                            state.selectedRepo === repo &&
                            state.selectedIssue === issue
                              ? state.workOrders
                                  .map((w) => {
                                    const active =
                                      state.detail?.id === w.id &&
                                      state.detail?.issue === issue &&
                                      state.detail?.repo === repo &&
                                      state.detail?.date === d;
                                    const b = w.status === "pending" ? "badge-pending" : "badge-done";
                                    return `<a href="#" class="wo-link${active ? " active" : ""}" data-dy="wo" data-date="${esc(d)}" data-repo="${esc(repo)}" data-issue="${esc(issue)}" data-woid="${esc(w.id)}"><span class="badge ${b}">${w.status === "pending" ? "Open" : "Done"}</span>${esc(w.id)}</a>`;
                                  })
                                  .join("")
                              : "";
                          return `
                        <div class="issue-row">
                          <button type="button" class="issue-toggle${openI ? " active" : ""}" data-dy="issue" data-date="${esc(d)}" data-repo="${esc(repo)}" data-issue="${esc(issue)}">${esc(issue)}</button>
                          ${openI ? `<div class="wo-list">${wos || '<span class="muted" style="padding:0.25rem 0.5rem;font-size:0.8rem">No work orders</span>'}</div>` : ""}
                        </div>`;
                        })
                        .join("")
                    : "";
                  return `
                <div class="repo-block">
                  <button type="button" class="repo-toggle${openR ? " active" : ""}" data-dy="repo" data-date="${esc(d)}" data-repo="${esc(repo)}">${esc(repo)}</button>
                  ${openR ? `<div class="issue-tree">${issueHtml || '<span class="muted" style="padding:0.35rem 0.5rem;font-size:0.8rem">No issues</span>'}</div>` : ""}
                </div>`;
                })
                .join("")
          : "";
        return `
        <div class="date-block">
          <button type="button" class="date-toggle${openD ? " active" : ""}" data-dy="date" data-date="${esc(d)}">
            <span>${formatDateLabel(d)}</span>
            <span class="chev">▸</span>
          </button>
          ${openD ? `<div class="repo-tree">${repoHtml || '<span class="muted" style="padding:0.35rem 0.5rem;font-size:0.8rem">No repos / issues</span>'}</div>` : ""}
        </div>`;
      })
      .join("");
  }

  function renderReader(): string {
    if (!state.detail) {
      return `
        <div class="reader-empty">
          <div class="icon">📋</div>
          <h3>Select a work order</h3>
          <p>Choose a day, repo, issue track, then a work order to read the full markdown here.</p>
        </div>`;
    }
    const { date, repo, issue, id, status, markdown } = state.detail;
    return `
        <div class="reader-head">
          <div class="breadcrumb">
            <span>${esc(date)}</span>
            <span class="sep">/</span>
            <span>${esc(repo)}</span>
            <span class="sep">/</span>
            <span>${esc(issue)}</span>
            <span class="sep">/</span>
            <strong>${esc(id)}</strong>
            <span class="sep">·</span>
            <span class="badge ${status === "pending" ? "badge-pending" : "badge-done"}">${esc(status)}</span>
          </div>
          <div class="reader-actions">
            <button type="button" class="btn" data-dy="refresh-detail">Refresh</button>
            <button type="button" class="btn" data-dy="copy">Copy markdown</button>
            ${
              status === "pending"
                ? `<button type="button" class="btn btn-primary" data-dy="complete">Mark complete</button>`
                : ""
            }
          </div>
        </div>
        <div class="md-scroll">
          <article class="prose">${md.render(markdown)}</article>
        </div>`;
  }

  function renderMain(): void {
    const main = document.getElementById("dy-main");
    if (!main) return;

    const errHtml = state.error
      ? `<div class="alert-error" role="alert">${esc(state.error)}</div>`
      : "";

    const tabs = `
      <nav class="tabs" aria-label="Views">
        <button type="button" class="${state.tab === "explorer" ? "active" : ""}" data-dy="tab" data-tab="explorer">Browse</button>
        <button type="button" class="${state.tab === "pending" ? "active" : ""}" data-dy="tab" data-tab="pending">Queue</button>
        <button type="button" class="${state.tab === "create" ? "active" : ""}" data-dy="tab" data-tab="create">New order</button>
      </nav>`;

    const pendingStat =
      state.pendingCount > 0
        ? `<span class="stat-pill" title="Open work orders across all days"><strong>${state.pendingCount}</strong> open</span>`
        : `<span class="stat-pill">${state.dates.length} day${state.dates.length === 1 ? "" : "s"}</span>`;

    const header = document.getElementById("dy-header");
    if (header) {
      header.innerHTML = `
        <div class="brand">
          <img class="brand-img" src="/logo.jpg" alt="" width="40" height="40" onerror="this.onerror=null;this.src='/favicon.svg'" />
          <div class="brand-text">
            <h1>Dockyard</h1>
            <p>Work orders your agents write — visualized</p>
          </div>
        </div>
        <div class="header-meta">
          ${pendingStat}
          ${tabs}
        </div>`;
    }

    let body = "";
    if (state.tab === "explorer") {
      body = `
        <div class="explorer">
          <aside class="sidebar" id="dy-sidebar" aria-label="Work order tree">
            <h2 class="sidebar-title">Days → repos → issues</h2>
            ${renderSidebarExplorer()}
          </aside>
          <div class="reader-panel" id="dy-reader">${renderReader()}</div>
        </div>`;
    } else if (state.tab === "pending") {
      const cards = state.pending
        .map(
          (p) => `
        <a href="#" class="pending-card" data-dy="pending-card" data-date="${esc(p.date)}" data-repo="${esc(p.repo)}" data-issue="${esc(p.issue)}" data-woid="${esc(p.id)}">
          <div class="meta">${esc(p.date)} · ${esc(p.repo)} · ${esc(p.issue)}</div>
          <div class="id">${esc(p.id)}</div>
        </a>`,
        )
        .join("");
      body = `
        <div class="panel-wide">
          <h2>All open work orders</h2>
          <p class="muted" style="margin:-0.5rem 0 1rem">Sorted by date, repo, issue; click a card to open in Browse.</p>
          <div class="pending-grid">${cards || '<p class="muted">Nothing pending. You’re clear.</p>'}</div>
        </div>`;
    } else {
      const today = new Date().toISOString().slice(0, 10);
      body = `
        <div class="form-panel">
          <h2>Create work order</h2>
          <form id="create-form">
            <div class="form-row">
              <label for="c-date">Date</label>
              <input id="c-date" name="date" type="text" required value="${esc(today)}" placeholder="YYYY-MM-DD" autocomplete="off" />
            </div>
            <div class="form-row">
              <label for="c-repo">Repo</label>
              <input id="c-repo" name="repo" type="text" value="default" placeholder="e.g. my-app (folder under date)" autocomplete="off" />
            </div>
            <div class="form-row">
              <label for="c-issue">Issue / track</label>
              <input id="c-issue" name="issue" type="text" required placeholder="e.g. auth-refactor" autocomplete="off" />
            </div>
            <div class="form-row">
              <label for="c-content">Body (from ## Objective …)</label>
              <textarea id="c-content" name="content" required placeholder="## Objective&#10;..."></textarea>
            </div>
            <button type="submit" class="btn btn-primary">Create</button>
          </form>
        </div>`;
    }

    main.innerHTML = `${errHtml}${body}`;
    wireForms();
  }

  function formatDateLabel(iso: string): string {
    try {
      const [y, m, d] = iso.split("-").map(Number);
      const dt = new Date(y!, m! - 1, d!);
      return dt.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  }

  function esc(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function wireForms(): void {
    const form = document.getElementById("create-form");
    form?.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const fd = new FormData(form as HTMLFormElement);
      const date = String(fd.get("date") ?? "");
      const repo = String(fd.get("repo") ?? "").trim() || "default";
      const issue = String(fd.get("issue") ?? "");
      const content = String(fd.get("content") ?? "");
      try {
        await createWorkOrder({ date, repo, issue, content });
        (form as HTMLFormElement).reset();
        const r = (form as HTMLFormElement).elements.namedItem("repo") as HTMLInputElement;
        if (r) r.value = "default";
        state.error = null;
        await loadDates();
        await refreshPendingCount();
        state.tab = "explorer";
        expanded.add(expD(date));
        expanded.add(expR(date, repo));
        const slug = issue.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
        const iss = slug || issue;
        expanded.add(expI(date, repo, iss));
        state.selectedDate = date;
        state.selectedRepo = repo;
        state.selectedIssue = iss;
        persistNow();
        await loadTracks(date, true);
        await loadWorkOrderList(date, repo, iss);
      } catch (e) {
        state.error = e instanceof Error ? e.message : String(e);
      }
      renderMain();
    });

    document.querySelector("[data-dy=refresh-detail]")?.addEventListener("click", async () => {
      if (!state.detail) return;
      const { date, repo, issue, id } = state.detail;
      await loadDetail(date, repo, issue, id);
      renderMain();
    });

    document.querySelector("[data-dy=copy]")?.addEventListener("click", () => copyDetail());

    document.querySelector("[data-dy=complete]")?.addEventListener("click", async () => {
      try {
        await markComplete();
        state.error = null;
      } catch (e) {
        state.error = e instanceof Error ? e.message : String(e);
      }
      renderMain();
    });
  }

  root.innerHTML = `
    <div id="dy-app">
      <header class="app-header" id="dy-header"></header>
      <main id="dy-main"></main>
      <footer class="app-footer">
        <a href="https://boisclub.games" target="_blank" rel="noopener noreferrer">by bryanthaboi</a>
      </footer>
    </div>`;

  root.querySelector("#dy-app")!.addEventListener("click", (ev) => {
    const t = (ev.target as HTMLElement).closest("[data-dy]") as HTMLElement | null;
    if (!t) return;
    const kind = t.dataset.dy;
    if (kind === "tab") {
      const tab = t.dataset.tab as Tab;
      state.tab = tab;
      persistNow();
      void (async () => {
        if (tab === "pending") await loadPending();
        renderMain();
      })();
      return;
    }
    if (kind === "date") {
      ev.preventDefault();
      const d = t.dataset.date!;
      const opening = !expanded.has(expD(d));
      toggleExp(expD(d));
      state.selectedDate = d;
      persistNow();
      if (opening) delete state.tracksByDate[d];
      renderMain();
      void (async () => {
        await loadTracks(d, true);
        renderMain();
      })();
      return;
    }
    if (kind === "repo") {
      ev.preventDefault();
      const d = t.dataset.date!;
      const r = t.dataset.repo!;
      toggleExp(expR(d, r));
      state.selectedDate = d;
      state.selectedRepo = r;
      persistNow();
      renderMain();
      return;
    }
    if (kind === "issue") {
      ev.preventDefault();
      const d = t.dataset.date!;
      const r = t.dataset.repo!;
      const i = t.dataset.issue!;
      const k = expI(d, r, i);
      const wasOpen = expanded.has(k);
      toggleExp(k);
      state.selectedDate = d;
      state.selectedRepo = r;
      state.selectedIssue = i;
      persistNow();
      if (!wasOpen && expanded.has(k)) state.workOrders = [];
      renderMain();
      void (async () => {
        try {
          if (!wasOpen && expanded.has(k)) await loadWorkOrderList(d, r, i);
        } catch (e) {
          state.error = e instanceof Error ? e.message : String(e);
        }
        renderMain();
      })();
      return;
    }
    if (kind === "wo") {
      ev.preventDefault();
      const d = t.dataset.date!;
      const r = t.dataset.repo!;
      const i = t.dataset.issue!;
      const id = t.dataset.woid!;
      void (async () => {
        try {
          await loadDetail(d, r, i, id);
          state.error = null;
        } catch (e) {
          state.error = e instanceof Error ? e.message : String(e);
        }
        renderMain();
      })();
      return;
    }
    if (kind === "pending-card") {
      ev.preventDefault();
      const d = t.dataset.date!;
      const r = t.dataset.repo!;
      const i = t.dataset.issue!;
      const id = t.dataset.woid!;
      state.tab = "explorer";
      expanded.add(expD(d));
      expanded.add(expR(d, r));
      expanded.add(expI(d, r, i));
      state.selectedDate = d;
      state.selectedRepo = r;
      state.selectedIssue = i;
      persistNow();
      void (async () => {
        try {
          await loadTracks(d, true);
          await loadWorkOrderList(d, r, i);
          await loadDetail(d, r, i, id);
          state.error = null;
        } catch (e) {
          state.error = e instanceof Error ? e.message : String(e);
        }
        renderMain();
      })();
    }
  });

  async function pollTick(): Promise<void> {
    try {
      await loadDates();
      await refreshPendingCount();
      if (state.tab === "explorer") {
        for (const d of state.dates) {
          if (expanded.has(expD(d))) await loadTracks(d, true);
        }
        if (state.selectedDate && state.selectedRepo != null && state.selectedIssue != null) {
          try {
            await loadWorkOrderList(state.selectedDate, state.selectedRepo, state.selectedIssue);
          } catch {
            /* keep list stale */
          }
        }
        if (state.detail) {
          const { date, repo, issue, id } = state.detail;
          try {
            await loadDetail(date, repo, issue, id);
          } catch {
            /* keep reader stale */
          }
        }
      }
      if (state.tab === "pending") await loadPending();
      renderMain();
    } catch (e) {
      state.error = e instanceof Error ? e.message : String(e);
      renderMain();
    }
  }

  void (async () => {
    try {
      await loadDates();
      await refreshPendingCount();
      if (state.selectedDate) await loadTracks(state.selectedDate, true);
      if (state.selectedDate && state.selectedRepo != null && state.selectedIssue != null) {
        try {
          await loadWorkOrderList(state.selectedDate, state.selectedRepo, state.selectedIssue);
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      state.error = e instanceof Error ? e.message : String(e);
    }
    renderMain();
    setInterval(() => void pollTick(), POLL_MS);
  })();
}
