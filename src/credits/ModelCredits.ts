import data from './modelCredits.json';
import { rigFile, type RigKind } from '../graphics/RiggedModels';

export interface ModelCredit { title: string; author: string; authorUrl: string; license: string; source: string; files: string[]; used: boolean }

const credits = (data as { credits: ModelCredit[] }).credits;
const byFile = new Map<string, ModelCredit>();
for (const c of credits) for (const f of c.files) byFile.set(f, c);

/** Credit of the model file behind a rigged unit / building kind (null for own work or unknown). */
export function creditForKind(kind: RigKind): ModelCredit | null {
  return byFile.get(rigFile(kind)) ?? null;
}

/** Every model the game actually loads, grouped per source model (author, title, licence, link) and sorted by author. */
export function usedCredits(): ModelCredit[] {
  return credits.filter(c => c.used).sort((a, b) => a.author.toLowerCase().localeCompare(b.author.toLowerCase()) || a.title.localeCompare(b.title));
}

export function hasOwnWork(): boolean {
  return ((data as any).ownWork?.files ?? []).some((f: { used: boolean }) => f.used);
}
