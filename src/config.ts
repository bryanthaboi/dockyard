import { homedir } from "node:os";
import { join } from "node:path";

export function resolveDockyardRoot(): string {
  return process.env.DOCKYARD_ROOT ?? join(homedir(), ".dockyard");
}

export function resolvePort(): number {
  const p = process.env.DOCKYARD_PORT ?? "36969";
  const n = Number.parseInt(p, 10);
  if (Number.isNaN(n) || n < 1 || n > 65535) return 36969;
  return n;
}
