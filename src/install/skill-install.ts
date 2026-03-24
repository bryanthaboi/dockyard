import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { SKILL_INSTALL_TARGETS, type SkillInstallTarget } from "./skill-targets.js";

export type SkillInstallOptions = {
  sourceSkillsDir: string;
  home: string;
  dryRun: boolean;
  force: boolean;
  onlyTargets?: Set<string>;
};

export type SkillInstallResult = {
  target: SkillInstallTarget;
  skillsRoot: string;
  copies: { skill: string; action: "written" | "skipped" | "dry-run" | "would-skip" }[];
};

function listBundledSkillDirs(sourceRoot: string): string[] {
  if (!existsSync(sourceRoot)) return [];
  return readdirSync(sourceRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith(".") && d.name !== "node_modules")
    .map((d) => join(sourceRoot, d.name))
    .filter((p) => existsSync(join(p, "SKILL.md")));
}

function copyOne(skillSrc: string, destParent: string, skillName: string, force: boolean): "written" | "skipped" {
  const dest = join(destParent, skillName);
  if (existsSync(dest)) {
    if (!force) return "skipped";
    rmSync(dest, { recursive: true, force: true });
  }
  mkdirSync(destParent, { recursive: true });
  cpSync(skillSrc, dest, { recursive: true });
  return "written";
}

export function listDetectedSkillRoots(home: string): { target: SkillInstallTarget; skillsRoot: string }[] {
  const out: { target: SkillInstallTarget; skillsRoot: string }[] = [];
  for (const target of SKILL_INSTALL_TARGETS) {
    const root = target.resolveSkillsDir(home);
    if (root) out.push({ target, skillsRoot: root });
  }
  return out;
}

export function installBundledSkills(opts: SkillInstallOptions): SkillInstallResult[] {
  const skillPaths = listBundledSkillDirs(opts.sourceSkillsDir);
  const results: SkillInstallResult[] = [];

  for (const target of SKILL_INSTALL_TARGETS) {
    if (opts.onlyTargets && !opts.onlyTargets.has(target.id)) continue;
    const skillsRoot = target.resolveSkillsDir(opts.home);
    if (!skillsRoot) continue;

    const copies: SkillInstallResult["copies"] = [];

    if (opts.dryRun) {
      for (const src of skillPaths) {
        const skill = basename(src);
        const dest = join(skillsRoot, skill);
        const skip = existsSync(dest) && !opts.force;
        copies.push({ skill, action: skip ? "would-skip" : "dry-run" });
      }
      results.push({ target, skillsRoot, copies });
      continue;
    }

    if (skillPaths.length === 0) {
      results.push({ target, skillsRoot, copies: [] });
      continue;
    }

    for (const src of skillPaths) {
      const skill = basename(src);
      const action = copyOne(src, skillsRoot, skill, opts.force);
      copies.push({ skill, action });
    }
    results.push({ target, skillsRoot, copies });
  }

  return results;
}
