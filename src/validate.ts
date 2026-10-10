import type { Era, Template, SocialClass, ResolvedEra } from "./schema";
import type { Issue } from "./load";

const SHARE_TOLERANCE = 0.001;
const POPULATION_TOLERANCE = 0.01;

function dupes(ids: string[]): string[] {
  const seen = new Set<string>(), out = new Set<string>();
  for (const id of ids) (seen.has(id) ? out : seen).add(id);
  return [...out];
}

function checkClasses(classes: SocialClass[], file: string, at: string, issues: Issue[]) {
  const sum = classes.reduce((s, c) => s + c.share, 0);
  if (Math.abs(sum - 1) > SHARE_TOLERANCE) issues.push({ file, path: at, message: `class share sum ${+sum.toFixed(6)} != 1` });
  for (const d of dupes(classes.map((c) => c.id))) issues.push({ file, path: at, message: `duplicate class id "${d}"` });
}

export function checkDataset(eras: Era[], templates: Template[]): Issue[] {
  const issues: Issue[] = [];
  const tplIds = new Set(templates.map((t) => t.id));
  for (const d of dupes(templates.map((t) => t.id))) issues.push({ path: "templates", message: `duplicate template id "${d}"` });
  for (const t of templates) checkClasses(t.classes, `templates/${t.id}.json`, "classes", issues);
  for (const d of dupes(eras.map((e) => e.id))) issues.push({ path: "eras", message: `duplicate era id "${d}"` });

  for (const era of eras) {
    const file = `${era.id}.json`;
    if ((era.group === "future") !== era.fictional) issues.push({ file, path: "fictional", message: `group "${era.group}" requires fictional=${era.group === "future"}` });
    for (const d of dupes(era.polities.map((p) => p.id))) issues.push({ file, path: "polities", message: `duplicate polity id "${d}"` });
    const pop = era.polities.reduce((s, p) => s + p.population, 0);
    if (Math.abs(pop - era.worldPopulation) / era.worldPopulation > POPULATION_TOLERANCE)
      issues.push({ file, path: "polities", message: `population sum ${+pop.toFixed(3)} differs from worldPopulation ${era.worldPopulation} by more than 1%` });
    era.polities.forEach((p, i) => {
      if (p.classTemplate && !tplIds.has(p.classTemplate)) issues.push({ file, path: `polities.${i}`, message: `unknown template "${p.classTemplate}"` });
      if (p.classes) checkClasses(p.classes, file, `polities.${i}.classes`, issues);
    });
  }
  return issues;
}

export function resolveEras(eras: Era[], templates: Template[]): ResolvedEra[] {
  const byId = new Map(templates.map((t) => [t.id, t]));
  return eras.map((era) => ({
    ...era,
    polities: era.polities.map(({ classTemplate, classes, ...p }) => {
      if (classes) return { ...p, classes };
      const t = byId.get(classTemplate!);
      if (!t) throw new Error(`unknown template "${classTemplate}" in ${era.id}/${p.id}`);
      return { ...p, classes: t.classes };
    }),
  }));
}
