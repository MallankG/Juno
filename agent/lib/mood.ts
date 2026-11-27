/**
 * Juno shows a mood with each reply. The model starts its reply with a tag such
 * as "[mood: happy]"; the phone app reads it to change Juno's face and removes
 * it before showing or speaking the text.
 */
export const MOODS = [
  "happy", "excited", "calm", "thinking", "curious", "concerned",
  "empathetic", "proud", "playful", "sleepy", "celebrating",
] as const;

const TAG = /\[\s*mood\s*:\s*[a-z-]+\s*\]\s*/gi;

/** Removes mood tags from text that is stored, spoken or sent as a notification. */
export function stripMood(text: string): string {
  return text.replace(TAG, "").trim();
}
