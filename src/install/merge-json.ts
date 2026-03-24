import { readFileSync, writeFileSync } from "node:fs";

function isEnoent(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT";
}

export function readJsonFile(path: string): Record<string, unknown> {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    if (isEnoent(e)) return {};
    throw e;
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Dockyard install: invalid JSON (refusing to modify): ${path}`);
  }
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  throw new Error(`Dockyard install: JSON root must be an object: ${path}`);
}

export function writeJsonFile(path: string, data: Record<string, unknown>): void {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}
