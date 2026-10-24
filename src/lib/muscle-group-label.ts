type Translate = (key: string, vars?: Record<string, string | number | undefined>) => string;

/** "UPPER_BACK" → "Upper Back" — fallback when no translation exists. */
export function titleCaseEnum(value: string): string {
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Localized muscle-group name (`muscleMap.<GROUP>`), title-cased fallback. */
export function muscleGroupLabel(t: Translate, group: string): string {
  const key = `muscleMap.${group}`;
  const label = t(key);
  return label === key ? titleCaseEnum(group) : label;
}

/** Localized equipment name (`equipment.<TYPE>`), title-cased fallback. */
export function equipmentLabel(t: Translate, equipment: string): string {
  const key = `equipment.${equipment}`;
  const label = t(key);
  return label === key ? titleCaseEnum(equipment) : label;
}
