"use client";

import { usePathname } from "next/navigation";
import { selectDesigner } from "../actions";

/** The designer dropdown. Picking a name submits at once and is remembered in a cookie. */
export function DesignerPicker({ designers, selectedId, locked }: { designers: { id: string; name: string }[]; selectedId: string | null; locked: boolean }) {
  const path = usePathname();
  return (
    <form action={selectDesigner} className="picker">
      <input type="hidden" name="next" value={path.startsWith("/designer/calls/") ? "/designer/leads" : path} />
      <label htmlFor="designer-select" className="label">Designer</label>
      <select id="designer-select" name="designer" defaultValue={selectedId ?? ""} disabled={locked} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
        {!selectedId && <option value="" disabled>Choose a designer</option>}
        {designers.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
      </select>
      <noscript><button>Show</button></noscript>
    </form>
  );
}
