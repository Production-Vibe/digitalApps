import { DictionaryValue } from '@prisma/client';
import { prisma } from './prisma';

export const DICT_TYPES = ['blankType', 'material', 'materialGrade', 'blankSize', 'priority'] as const;
export type DictType = (typeof DICT_TYPES)[number];

export const DICT_LABELS: Record<DictType, string> = {
  blankType: 'вид заготовки',
  material: 'материал',
  materialGrade: 'марка материала',
  blankSize: 'размер заготовки',
  priority: 'приоритет',
};

export function isDictField(f: string): f is DictType {
  return (DICT_TYPES as readonly string[]).includes(f);
}

export function normalizeDictValue(v: unknown): string {
  return String(v ?? '').trim().replace(/\s+/g, ' ');
}

const getValues = (type: DictType) => prisma.dictionaryValue.findMany({ where: { type } });

export async function listActive(type: DictType): Promise<DictionaryValue[]> {
  const rows = await getValues(type);
  return rows
    .filter((r) => r.isActive)
    .sort((a, b) => (a.sort - b.sort) || a.value.localeCompare(b.value, 'ru'));
}

export async function toCanonical(type: DictType, raw: unknown): Promise<string | null> {
  const norm = normalizeDictValue(raw);
  if (!norm) return '';
  const rows = await getValues(type);
  for (const r of rows) {
    if (!r.isActive) continue;
    if (normalizeDictValue(r.value) === norm) return r.value;
    if (r.synonyms.map((s) => normalizeDictValue(s)).includes(norm)) return r.value;
  }
  return null;
}

export async function resolveOrCreate(type: DictType, raw: unknown): Promise<{ value: string; created: boolean }> {
  const canon = await toCanonical(type, raw);
  if (canon === '') return { value: '', created: false };
  if (canon !== null) return { value: canon, created: false };
  const value = normalizeDictValue(raw);
  const created = await prisma.dictionaryValue.upsert({
    where: { type_value: { type, value } },
    update: { isActive: true },
    create: { type, value, synonyms: [] },
  });
  return { value: created.value, created: true };
}
