export interface AssignableDesigner {
  id: string;
  name: string;
}

/** Fewest upcoming leads first; ties by name so the result is stable. Placeholder until each designer has a calendar. */
export function pickDesigner(designers: AssignableDesigner[], loads: Map<string, number>): AssignableDesigner | null {
  if (designers.length === 0) return null;
  return [...designers].sort((a, b) => (loads.get(a.id) ?? 0) - (loads.get(b.id) ?? 0) || a.name.localeCompare(b.name))[0]!;
}
