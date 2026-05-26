import type { ActivityAnalysis } from "../model";
import { todayKey } from "../time";

export function mergeAnalysisNote(
  currentNote: string | undefined,
  analysis: ActivityAnalysis,
) {
  const marker = "[Intervals.icu]";
  const nextNote = `${marker} ${analysis.summary} ${analysis.suggestion}`;
  const kept = (currentNote ?? "")
    .split("\n")
    .filter((line) => !line.trim().startsWith(marker))
    .join("\n")
    .trim();
  return kept ? `${kept}\n${nextNote}` : nextNote;
}

export function downloadJson(data: unknown, label?: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `bike-training-backup${label ? `-${label}` : ""}-${todayKey()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function importJson(file: File) {
  return JSON.parse(await file.text());
}
