import { isValidISODate } from '../date';
import type { Nutrients } from '../nutrition/types';
import type { DumpData } from './index';
import { DB_VERSION, type Entry, type Food, type WeightEntry } from './schema';

export const BACKUP_FORMAT = 'myfit-backup';

export interface Backup {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  theme?: string;
  data: DumpData;
}

export class BackupError extends Error {}

/**
 * Data migrations for backups made by older versions.
 * Key v upgrades data from schema v to v + 1. Append only.
 */
const dataMigrations: Record<number, (d: DumpData) => DumpData> = {};

export function buildBackup(data: DumpData, theme?: string, now = new Date()): Backup {
  return { format: BACKUP_FORMAT, schemaVersion: DB_VERSION, exportedAt: now.toISOString(), theme, data };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function isNutrients(v: unknown): v is Nutrients {
  return isObj(v) && isNum(v.kcal) && isNum(v.protein) && isNum(v.carbs) && isNum(v.fat);
}

const isEntry = (v: unknown): v is Entry =>
  isObj(v) &&
  typeof v.id === 'string' &&
  isValidISODate(v.date) &&
  typeof v.meal === 'string' &&
  typeof v.name === 'string' &&
  isNum(v.grams) &&
  isNutrients(v.per100);

const isFood = (v: unknown): v is Food =>
  isObj(v) && typeof v.id === 'string' && typeof v.name === 'string' && isNutrients(v.per100);

const isWeight = (v: unknown): v is WeightEntry => isObj(v) && isValidISODate(v.date) && isNum(v.kg);

export interface ParsedBackup {
  backup: Backup;
  skipped: number;
}

export function parseBackup(raw: unknown): ParsedBackup {
  if (!isObj(raw) || raw.format !== BACKUP_FORMAT || !isObj(raw.data)) {
    throw new BackupError("Ce fichier n'est pas une sauvegarde MyFit.");
  }
  const version = raw.schemaVersion;
  if (!isNum(version) || version < 1) throw new BackupError('Version de sauvegarde inconnue.');
  if (version > DB_VERSION) {
    throw new BackupError("Cette sauvegarde vient d'une version plus récente de l'app. Mets l'app à jour puis réessaie.");
  }
  const d = raw.data;
  const arr = (k: string): unknown[] => (Array.isArray(d[k]) ? (d[k] as unknown[]) : []);
  let skipped = 0;
  const keep = <T>(list: unknown[], guard: (v: unknown) => v is T): T[] =>
    list.filter((v): v is T => {
      const ok = guard(v);
      if (!ok) skipped++;
      return ok;
    });
  let data: DumpData = {
    meta: keep(arr('meta'), (v): v is DumpData['meta'][number] => isObj(v) && typeof v.key === 'string'),
    entries: keep(arr('entries'), isEntry),
    foods: keep(arr('foods'), isFood),
    weights: keep(arr('weights'), isWeight),
  };
  for (let v = version; v < DB_VERSION; v++) data = dataMigrations[v]?.(data) ?? data;
  return {
    backup: {
      format: BACKUP_FORMAT,
      schemaVersion: DB_VERSION,
      exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
      theme: typeof raw.theme === 'string' ? raw.theme : undefined,
      data,
    },
    skipped,
  };
}

export function backupFileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `myfit-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}
