/** Clawd's 2D animation clips (animated WebP renders of the mascot rig) and the
    behavior table for the corner pet. */

export type ClawdClip =
  | "IDLE"
  | "THINKING"
  | "TYPING"
  | "READING_FILES"
  | "RUNNING_COMMAND"
  | "BUILDING"
  | "TESTING"
  | "DEBUGGING"
  | "PERMISSION"
  | "SUBAGENTS"
  | "COMPLETE"
  | "ERROR_RETRY";

/* Animated WebP renders of the rig at 192px (2x the 96px display size) —
   about a third of the old 384px GIFs' weight, same frames and timing.
   Bump this whenever the files under public/models/mascot/webp/ are
   regenerated: same filenames, new pixel content, and browsers otherwise keep
   serving whatever they cached from an earlier version. */
const ASSET_VERSION = "5";

function clip(file: string) {
  return `/models/mascot/webp/${file}?v=${ASSET_VERSION}`;
}

export const CLAWD_SPRITES: Record<ClawdClip, string> = {
  IDLE: clip("01_IDLE.webp"),
  THINKING: clip("02_THINKING.webp"),
  TYPING: clip("03_TYPING.webp"),
  READING_FILES: clip("04_READING_FILES.webp"),
  RUNNING_COMMAND: clip("05_RUNNING_COMMAND.webp"),
  BUILDING: clip("06_BUILDING.webp"),
  TESTING: clip("07_TESTING.webp"),
  DEBUGGING: clip("08_DEBUGGING.webp"),
  PERMISSION: clip("09_PERMISSION.webp"),
  SUBAGENTS: clip("10_SUBAGENTS.webp"),
  COMPLETE: clip("11_COMPLETE.webp"),
  ERROR_RETRY: clip("12_ERROR_RETRY.webp"),
};

/** Clips Clawd drifts into on his own while nothing is happening. */
export const IDLE_FLAVOR: ClawdClip[] = ["THINKING", "RUNNING_COMMAND"];

/** Pool Clawd picks a random clip from while the user is scrolling fast. */
export const SCROLL_CLIPS: ClawdClip[] = [
  "TYPING",
  "READING_FILES",
  "RUNNING_COMMAND",
  "BUILDING",
  "TESTING",
  "DEBUGGING",
  "SUBAGENTS",
];

/** Clips for a click reaction, with a matching line for the speech bubble. */
export const CLICK_REACTIONS: Array<{ clip: ClawdClip; line: string }> = [
  { clip: "PERMISSION", line: "May I?" },
  { clip: "DEBUGGING", line: "Found the bug. It was me." },
  { clip: "SUBAGENTS", line: "Delegating this click…" },
  { clip: "ERROR_RETRY", line: "Retrying…" },
  { clip: "TYPING", line: "Shipping a fix…" },
  { clip: "BUILDING", line: "npm run build" },
  { clip: "TESTING", line: "All green." },
  { clip: "THINKING", line: "Hmm…" },
  { clip: "COMPLETE", line: "Deployed!" },
  { clip: "READING_FILES", line: "Reading the docs. Finally." },
];

/** Section class → clip Clawd reacts with while that section is on screen,
    and a line he says the first time you get there. */
export const SECTION_CLIPS: Array<{ selector: string; clip: ClawdClip; line?: string }> = [
  { selector: ".showcase", clip: "READING_FILES", line: "All of these are live." },
  { selector: ".heat", clip: "BUILDING" },
  { selector: ".footer-giant", clip: "COMPLETE", line: "That's everything. Say hi!" },
];
