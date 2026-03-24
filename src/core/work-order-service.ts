import { access, stat } from "node:fs/promises";
import { constants as FsConstants } from "node:fs";
import { indexJsonSchema, type IndexJson, type PendingWorkOrderRef, type WorkOrderMeta } from "./schemas.js";
import { IndexCache } from "./index-cache.js";
import {
  LEGACY_REPO,
  atomicWriteFile,
  ensureDir,
  indexPath,
  listDateDirs,
  listTracksForDate,
  physicalIssueDir,
  readText,
  sanitizeIssueSlug,
  sanitizeRepoSlug,
  workOrderPath,
  type IssueTrack,
} from "./storage.js";

const REQUIRED_SECTIONS = [
  "## Objective",
  "## Agent Instructions",
  "## Anchor Files",
  "## Related Files",
  "## Files to Create",
  "## Constraints (DO NOT TOUCH)",
  "## Deferred Work",
  "## Notes",
] as const;

function woTitleCase(woId: string): string {
  return woId.replace(/^wo-/, "WO-");
}

function validateSections(markdown: string): void {
  for (const h of REQUIRED_SECTIONS) {
    if (!markdown.includes(h)) {
      throw new Error(`Work order content missing required section: ${h}`);
    }
  }
}

/** Keep body from ## Objective onward; validate sections. */
function normalizeMarkdownBody(content: string): string {
  const idx = content.indexOf("## Objective");
  if (idx === -1) {
    throw new Error('Work order content must include "## Objective" section');
  }
  const body = content.slice(idx).trimStart();
  validateSections(body);
  return body;
}

function buildWorkOrderFile(woId: string, date: string, body: string): string {
  const title = woTitleCase(woId);
  return `# Work Order: ${title}
Status: pending
Created: ${date}

${body}
`;
}

function parseWoSequence(woId: string): number {
  const m = /^wo-(\d{3})$/.exec(woId);
  if (!m) return 0;
  return Number.parseInt(m[1]!, 10);
}

function formatWoId(n: number): string {
  return `wo-${String(n).padStart(3, "0")}`;
}

export class WorkOrderService {
  private readonly cache = new IndexCache();

  constructor(private readonly root: string) {}

  cacheKey(date: string, repo: string, slug: string): string {
    return `${date}/${repo}/${slug}`;
  }

  private normalizeRepoParam(repo: string | undefined): string {
    if (repo == null || repo === "") return sanitizeRepoSlug("default");
    if (repo === LEGACY_REPO) return LEGACY_REPO;
    return sanitizeRepoSlug(repo);
  }

  /** Resolve repo folder when caller omits repo (read/update). */
  private async resolveRepoForRead(date: string, issueInput: string, repoInput?: string): Promise<string> {
    const slug = sanitizeIssueSlug(issueInput);
    if (repoInput != null && repoInput !== "") {
      return repoInput === LEGACY_REPO ? LEGACY_REPO : sanitizeRepoSlug(repoInput);
    }
    const tracks = await listTracksForDate(this.root, date);
    const matches = tracks.filter((t) => t.issue === slug);
    if (matches.length === 1) return matches[0]!.repo;
    if (matches.length === 0) {
      const defPath = indexPath(this.root, date, sanitizeRepoSlug("default"), slug);
      try {
        await access(defPath, FsConstants.R_OK);
        return sanitizeRepoSlug("default");
      } catch {
        throw new Error(`No work orders for date ${date} / issue ${slug}`);
      }
    }
    const repos = [...new Set(matches.map((m) => m.repo))].sort().join(", ");
    throw new Error(`Multiple repos have issue "${slug}" on ${date}; pass repo (one of: ${repos})`);
  }

  private async readIndex(date: string, repo: string, slug: string): Promise<IndexJson> {
    const path = indexPath(this.root, date, repo, slug);
    const key = this.cacheKey(date, repo, slug);
    try {
      const st = await stat(path);
      const cached = this.cache.get(key, st.mtimeMs);
      if (cached) return cached;
      const raw = await readText(path);
      const data = indexJsonSchema.parse(JSON.parse(raw));
      const merged: IndexJson = { ...data, repo: data.repo ?? repo };
      this.cache.set(key, st.mtimeMs, merged);
      return merged;
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        throw new Error(`No work orders for date ${date} / repo ${repo} / issue ${slug}`);
      }
      throw e;
    }
  }

  private async writeIndex(date: string, repo: string, slug: string, data: IndexJson): Promise<void> {
    const path = indexPath(this.root, date, repo, slug);
    const key = this.cacheKey(date, repo, slug);
    const validated = indexJsonSchema.parse(data);
    await atomicWriteFile(path, `${JSON.stringify(validated, null, 2)}\n`);
    const st = await stat(path);
    this.cache.set(key, st.mtimeMs, validated);
  }

  private async createEmptyIndex(date: string, repo: string, slug: string, issueLabel: string): Promise<IndexJson> {
    const initial: IndexJson = {
      issue: issueLabel,
      date,
      repo,
      lastWorkOrderNumber: 0,
      workOrders: [],
    };
    await this.writeIndex(date, repo, slug, initial);
    return initial;
  }

  async listTracks(date: string): Promise<IssueTrack[]> {
    return listTracksForDate(this.root, date);
  }

  async getNextWorkOrderNumber(date: string, issue: string, repo?: string): Promise<number> {
    const slug = sanitizeIssueSlug(issue);
    let repoSlug: string;
    if (repo != null && repo !== "") {
      repoSlug = repo === LEGACY_REPO ? LEGACY_REPO : sanitizeRepoSlug(repo);
    } else {
      const tracks = await listTracksForDate(this.root, date);
      const hits = tracks.filter((t) => t.issue === slug);
      if (hits.length === 1) repoSlug = hits[0]!.repo;
      else repoSlug = sanitizeRepoSlug("default");
    }
    const path = indexPath(this.root, date, repoSlug, slug);
    try {
      await access(path, FsConstants.R_OK);
    } catch {
      return 1;
    }
    const index = await this.readIndex(date, repoSlug, slug);
    return index.lastWorkOrderNumber + 1;
  }

  async insertWorkOrder(params: {
    date: string;
    repo?: string;
    issue: string;
    content: string;
  }): Promise<{ id: string; repo: string }> {
    const repoSlug = this.normalizeRepoParam(params.repo);
    const slug = sanitizeIssueSlug(params.issue);
    const dir = physicalIssueDir(this.root, params.date, repoSlug, slug);
    await ensureDir(dir);

    const path = indexPath(this.root, params.date, repoSlug, slug);
    let index: IndexJson;
    try {
      await access(path, FsConstants.R_OK);
      index = await this.readIndex(params.date, repoSlug, slug);
    } catch {
      index = await this.createEmptyIndex(params.date, repoSlug, slug, slug);
    }

    const nextNum = index.lastWorkOrderNumber + 1;
    const id = formatWoId(nextNum);
    const body = normalizeMarkdownBody(params.content);
    const markdown = buildWorkOrderFile(id, params.date, body);

    const filePath = workOrderPath(this.root, params.date, repoSlug, slug, id);
    await atomicWriteFile(filePath, markdown);

    const nextIndex: IndexJson = {
      ...index,
      issue: slug,
      repo: repoSlug,
      date: params.date,
      lastWorkOrderNumber: nextNum,
      workOrders: [...index.workOrders, { id, status: "pending" }],
    };
    await this.writeIndex(params.date, repoSlug, slug, nextIndex);
    return { id, repo: repoSlug };
  }

  async getWorkOrder(params: { date: string; repo?: string; issue: string; woId: string }): Promise<string> {
    const slug = sanitizeIssueSlug(params.issue);
    const repo = await this.resolveRepoForRead(params.date, params.issue, params.repo);
    const path = workOrderPath(this.root, params.date, repo, slug, params.woId);
    return readText(path);
  }

  async getWorkOrderWithMeta(params: {
    date: string;
    repo?: string;
    issue: string;
    woId: string;
  }): Promise<{ markdown: string; status: "pending" | "complete"; repo: string }> {
    const slug = sanitizeIssueSlug(params.issue);
    const repo = await this.resolveRepoForRead(params.date, params.issue, params.repo);
    const index = await this.readIndex(params.date, repo, slug);
    const meta = index.workOrders.find((w) => w.id === params.woId);
    if (!meta) throw new Error(`Unknown work order ${params.woId}`);
    const markdown = await this.getWorkOrder({ ...params, issue: params.issue, repo });
    return { markdown, status: meta.status, repo };
  }

  async listWorkOrders(params: { date: string; repo?: string; issue: string }): Promise<WorkOrderMeta[]> {
    const slug = sanitizeIssueSlug(params.issue);
    const repo = await this.resolveRepoForRead(params.date, params.issue, params.repo);
    const path = indexPath(this.root, params.date, repo, slug);
    try {
      await access(path, FsConstants.R_OK);
    } catch {
      return [];
    }
    const index = await this.readIndex(params.date, repo, slug);
    return index.workOrders.map((w) => ({ id: w.id, status: w.status }));
  }

  async getPendingWorkOrders(params: {
    date?: string;
    repo?: string;
    issue?: string;
  }): Promise<PendingWorkOrderRef[]> {
    const out: PendingWorkOrderRef[] = [];
    const issueFilter = params.issue ? sanitizeIssueSlug(params.issue) : undefined;
    const repoFilter =
      params.repo != null && params.repo !== ""
        ? params.repo === LEGACY_REPO
          ? LEGACY_REPO
          : sanitizeRepoSlug(params.repo)
        : undefined;

    const dates = params.date ? [params.date] : await listDateDirs(this.root);

    for (const date of dates) {
      const tracks = await listTracksForDate(this.root, date);
      for (const { repo, issue } of tracks) {
        if (repoFilter != null && repo !== repoFilter) continue;
        if (issueFilter != null && issue !== issueFilter) continue;
        const path = indexPath(this.root, date, repo, issue);
        try {
          await access(path, FsConstants.R_OK);
        } catch {
          continue;
        }
        const index = await this.readIndex(date, repo, issue);
        for (const w of index.workOrders) {
          if (w.status === "pending") {
            out.push({ id: w.id, status: w.status, date, repo, issue });
          }
        }
      }
    }

    out.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.repo !== b.repo) return a.repo.localeCompare(b.repo);
      if (a.issue !== b.issue) return a.issue.localeCompare(b.issue);
      return parseWoSequence(a.id) - parseWoSequence(b.id);
    });
    return out;
  }

  async markWorkOrderComplete(params: { date: string; repo?: string; issue: string; woId: string }): Promise<void> {
    const slug = sanitizeIssueSlug(params.issue);
    const repo = await this.resolveRepoForRead(params.date, params.issue, params.repo);
    const index = await this.readIndex(params.date, repo, slug);
    const idx = index.workOrders.findIndex((w) => w.id === params.woId);
    if (idx === -1) throw new Error(`Unknown work order ${params.woId}`);
    const next: IndexJson = {
      ...index,
      workOrders: index.workOrders.map((w) =>
        w.id === params.woId ? { ...w, status: "complete" as const } : w,
      ),
    };
    await this.writeIndex(params.date, repo, slug, next);
  }

  async listDates(): Promise<string[]> {
    return listDateDirs(this.root);
  }
}
