import type { Task } from "./types";

export const priorityRank = (priority: Task["priority"]) =>
  ({ high: 0, normal: 1, low: 2 })[priority];
export const priorityLabel = (priority: Task["priority"]) =>
  ({ high: "Urgent", normal: "Medium", low: "Low" })[priority];

export function taskVisibleOnView(
  view: string,
  dueDay: string,
  done: boolean,
  today: string,
  selectedDay = "",
) {
  if (view === "today")
    return dueDay === today || (!!dueDay && dueDay < today && !done);
  if (view === "upcoming")
    return selectedDay
      ? dueDay === selectedDay
      : !done && (!dueDay || dueDay >= today);
  return false;
}

// The same tag keeps its color across views, reloads and devices.
function tagHue(tag: string) {
  let hash = 0;
  for (const char of tag.trim().toLowerCase())
    hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  return hash % 360;
}

export function tagColors(tag: string, allTags: string[] = [tag]) {
  const used: number[] = [];
  let hue = tagHue(tag);
  const minimumGap = Math.min(32, 240 / Math.max(1, allTags.length));
  // Spread nearby hashes apart so tags such as "college" and "study" can be
  // distinguished at a glance. Use the full sorted tag set in every view.
  for (const name of [...new Set([...allTags, tag])].sort()) {
    let candidate = tagHue(name);
    for (let attempt = 0; attempt < 360; attempt++) {
      if (
        used.every(
          (other) =>
            Math.min(
              Math.abs(other - candidate),
              360 - Math.abs(other - candidate),
            ) >= minimumGap,
        )
      )
        break;
      candidate = (candidate + 137) % 360;
    }
    used.push(candidate);
    if (name === tag) {
      hue = candidate;
      break;
    }
  }
  return {
    "--tag-color": `hsl(${hue} 58% 34%)`,
    "--tag-bg": `hsl(${hue} 70% 96%)`,
    "--tag-border": `hsl(${hue} 52% 86%)`,
  };
}
