import type { Config } from "../config";

/** Simple label for designers: derived from project type and area. */
export function clientSizeLabel(projectType: string | null | undefined, areaSqFt: number | null | undefined, config: Config): string | null {
  switch (projectType) {
    case "single_room":
      return "Single room";
    case "partial_home":
      return "Partial home";
    case "full_home":
      return "Full home";
    case "office":
    case "clinic":
    case "studio": {
      if (areaSqFt == null) return projectType === "office" ? "Office (size unknown)" : `${projectType[0]!.toUpperCase()}${projectType.slice(1)}`;
      return areaSqFt <= config.smallOfficeMaxSqFt ? "Small office" : "Large office";
    }
    default:
      return null;
  }
}
