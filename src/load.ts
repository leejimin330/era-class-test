import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { EraSchema, TemplateSchema, ConfigSchema, type Era, type Template, type Config } from "./schema";

export type Issue = { file?: string; path: string; message: string };

function readJson(file: string, issues: Issue[]): unknown | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    issues.push({ file: path.basename(file), path: "", message: `invalid JSON: ${(e as Error).message}` });
    return undefined;
  }
}

function parseWith<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, raw: unknown, file: string, issues: Issue[]): T | undefined {
  const r = schema.safeParse(raw);
  if (r.success) return r.data;
  for (const e of r.error.issues) issues.push({ file: path.basename(file), path: e.path.join("."), message: e.message });
  return undefined;
}

function jsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => path.join(dir, f));
}

export function loadDataDir(dir: string) {
  const issues: Issue[] = [];
  const eras: Era[] = [];
  const templates: Template[] = [];

  for (const file of jsonFiles(path.join(dir, "eras"))) {
    const raw = readJson(file, issues);
    if (raw === undefined) continue;
    const era = parseWith(EraSchema, raw, file, issues);
    if (!era) continue;
    const expected = path.basename(file, ".json");
    if (era.id !== expected) issues.push({ file: path.basename(file), path: "id", message: `id "${era.id}" does not match file name "${expected}"` });
    eras.push(era);
  }
  for (const file of jsonFiles(path.join(dir, "templates"))) {
    const raw = readJson(file, issues);
    const t = raw === undefined ? undefined : parseWith(TemplateSchema, raw, file, issues);
    if (t) templates.push(t);
  }

  const cfgFile = path.join(dir, "config.json");
  let config: Config | null = null;
  if (!fs.existsSync(cfgFile)) issues.push({ file: "config.json", path: "", message: "missing config.json" });
  else {
    const raw = readJson(cfgFile, issues);
    config = (raw !== undefined && parseWith(ConfigSchema, raw, cfgFile, issues)) || null;
  }

  const verFile = path.join(dir, "version.json");
  const verRaw = fs.existsSync(verFile) ? (readJson(verFile, issues) as { version?: unknown } | undefined) : undefined;
  const version = typeof verRaw?.version === "string" ? verRaw.version : null;

  return { eras, templates, config, version, issues };
}
