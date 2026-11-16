export function formatTime(seconds: number, includeTenths = false): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const wholeSeconds = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds % 1) * 10);
  return `${minutes}:${wholeSeconds.toString().padStart(2, "0")}${includeTenths ? `.${tenths}` : ""}`;
}
