import { access, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { constants as FsConstants } from "node:fs";
import { join } from "node:path";
import { DATE_DIR_REGEX } from "./schemas.js";

export function sanitizeIssueSlug(issue: string): string {
  const s = issue
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!s) throw new Error("Issue slug is empty after sanitization");
  return s;
}

export function sanitizeRepoSlug(repo: string): string {
  const s = repo
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!s) throw new Error("Repo slug is empty after sanitization");
  return s;
}

export function physicalIssueDir(root: string, date: string, repoSlug: string, issueSlug: string): string {
  return join(root, date, repoSlug, issueSlug);
}

export function indexPath(root: string, date: string, repoSlug: string, issueSlug: string): string {
  return join(physicalIssueDir(root, date, repoSlug, issueSlug), "index.json");
}

export function workOrderPath(
  root: string,
  date: string,
  repoSlug: string,
  issueSlug: string,
  woId: string,
): string {
  return join(physicalIssueDir(root, date, repoSlug, issueSlug), `${woId}.md`);
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function atomicWriteFile(filePath: string, data: string): Promise<void> {
  const tmp = `${filePath}.${process.pid}.tmp`;
  await writeFile(tmp, data, "utf8");
  await rename(tmp, filePath);
}

export async function readText(path: string): Promise<string> {
  return readFile(path, "utf8");
}

export async function listDateDirs(root: string): Promise<string[]> {
  let names: string[];
  try {
    names = await readdir(root);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return [];
    throw e;
  }
  return names.filter((n) => DATE_DIR_REGEX.test(n)).sort();
}

export type IssueTrack = { repo: string; issue: string };

/** Discover issue tracks: only `DOCKYARD_ROOT/<date>/<repo>/<issue>/index.json`. */
export async function listTracksForDate(root: string, date: string): Promise<IssueTrack[]> {
  const datePath = join(root, date);
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(datePath, { withFileTypes: true });
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return [];
    throw e;
  }

  const out: IssueTrack[] = [];
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith(".")) continue;
    const base = join(datePath, e.name);
    let subs: import("node:fs").Dirent[];
    try {
      subs = await readdir(base, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const s of subs) {
      if (!s.isDirectory() || s.name.startsWith(".")) continue;
      try {
        await access(join(base, s.name, "index.json"), FsConstants.R_OK);
        out.push({ repo: e.name, issue: s.name });
      } catch {
        /* skip */
      }
    }
  }

  out.sort((a, b) => a.repo.localeCompare(b.repo) || a.issue.localeCompare(b.issue));
  return out;
}
