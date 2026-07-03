import { COPY } from "../generatedCopy";

type CopyVars = Record<string, string | number>;

function getByPath(obj: unknown, dotPath: string): unknown {
  return dotPath.split(".").reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined || typeof acc !== "object") {
      return undefined;
    }
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

export function getCopy(path: string): string {
  const value = getByPath(COPY, path);
  if (typeof value !== "string") {
    throw new Error("Missing copy key: " + path);
  }
  return value;
}

export function formatCopy(path: string, vars: CopyVars): string {
  let text = getCopy(path);
  for (const [key, value] of Object.entries(vars)) {
    text = text.replace(new RegExp("\\{" + key + "\\}", "g"), String(value));
  }
  return text;
}

export function getPresetLabel(presetKey: string): string {
  const label = COPY.presets[presetKey as keyof typeof COPY.presets];
  if (typeof label !== "string") {
    throw new Error("Missing preset label: " + presetKey);
  }
  return label;
}

export function pluralizeRu(
  n: number,
  one: string,
  few: string,
  many: string
): string {
  const abs = Math.abs(n);
  const mod100 = abs % 100;
  const mod10 = abs % 10;

  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

export function pluralizeVariantWord(count: number): string {
  const forms = COPY.plugin.plural.variant;
  return pluralizeRu(count, forms.one, forms.few, forms.many);
}

export { COPY };
