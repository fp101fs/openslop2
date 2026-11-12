/** Stable file key for a spoken mission line: public/audio/voices/campaign/<key>.mp3 (made by tools/campaign/genvoice.ts). */
export function lineKey(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
/** What the narrator says when an objective appears / is completed (also used by the generator). */
export const revealLine = (text: string) => `New objective. ${text}`;
export const doneLine = (text: string, bonus: boolean) => `${bonus ? 'Bonus objective' : 'Objective'} complete. ${text}`;
