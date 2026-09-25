import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { normalizeDictValue, resolveOrCreate, DICT_TYPES, DICT_LABELS } from '../src/lib/dict';

const DRY = process.argv.includes('--dry');

type DictType = (typeof DICT_TYPES)[number];
type CatalogDictType = Exclude<DictType, 'priority'>;

type CatalogRow = {
  code: string;
  blankType: string;
  material: string;
  materialGrade: string;
  blankSize: string;
  priority: string;
};

const CATALOG_DICT_TYPES = DICT_TYPES.filter(
  (type): type is CatalogDictType => type !== 'priority',
);

function normalizedSet(values: readonly string[]): Set<string> {
  return new Set(values.map(normalizeDictValue));
}

function normalizedMap(entries: ReadonlyArray<readonly [string, string]>): Map<string, string> {
  return new Map(entries.map(([raw, canonical]) => [normalizeDictValue(raw), canonical]));
}

const BLANK_TYPE_MAP = normalizedMap([
  ['Круг', 'Круг'],
  ['Труба', 'Труба'],
  ['Лист', 'Лист'],
  ['Литье', 'Литьё'],
  ['Шестигранник', 'Шестигранник'],
  ['Поковка', 'Поковка'],
  ['Полоса', 'Полоса'],
  ['0', ''],
  ['—', ''],
  ['1823', ''],
]);

const MATERIAL_MAP = normalizedMap([
  ['Сталь', 'Сталь'],
  ['Бронза', 'Бронза'],
  ['Алюминий', 'Алюминий'],
  ['Полиамид', 'Полиамид'],
  ['—', ''],
  ['0', ''],
  ['68.47', ''],
  ['0.6', ''],
]);

const MATERIAL_GRADE_JUNK = normalizedSet([
  '#N/A',
  '#DIV/0!',
  '2997',
  '0',
  '68.47',
  '192.18',
  '21.3',
  '3',
]);

const BLANK_SIZE_JUNK = normalizedSet([
  '#N/A',
  '0',
  '72.040000000000006',
]);

const VALUE_ORDER: Partial<Record<DictType, readonly string[]>> = {
  blankType: ['Круг', 'Труба', 'Лист', 'Литьё', 'Шестигранник', 'Поковка', 'Полоса'],
  material: ['Сталь', 'Бронза', 'Алюминий', 'Полиамид'],
};

function targetValue(type: CatalogDictType, raw: string): string {
  const normalized = normalizeDictValue(raw);
  if (!normalized) return '';

  if (type === 'blankType') return BLANK_TYPE_MAP.get(normalized) ?? normalized;
  if (type === 'material') return MATERIAL_MAP.get(normalized) ?? normalized;
  if (type === 'materialGrade') return MATERIAL_GRADE_JUNK.has(normalized) ? '' : normalized;
  return BLANK_SIZE_JUNK.has(normalized) ? '' : normalized;
}

function sortValues(type: DictType, values: Iterable<string>): string[] {
  const order = VALUE_ORDER[type];
  if (!order) return [...values].sort((a, b) => a.localeCompare(b, 'ru'));

  const positions = new Map(order.map((value, index) => [value, index]));
  return [...values].sort((a, b) => {
    const aPosition = positions.get(a) ?? order.length;
    const bPosition = positions.get(b) ?? order.length;
    return aPosition - bPosition || a.localeCompare(b, 'ru');
  });
}

function printValues(label: string, values: Iterable<string>): void {
  console.log(`${label}: ${JSON.stringify([...values])}`);
}

async function applyField(type: CatalogDictType, rows: CatalogRow[], dry: boolean): Promise<void> {
  const distinct = sortValues(
    type,
    new Set(rows.map((row) => normalizeDictValue(row[type]))),
  );
  const updates = new Map<string, string>();
  const canonicalValues = new Set<string>();

  for (const row of rows) {
    const raw = normalizeDictValue(row[type]);
    if (!raw) continue;

    const canonical = targetValue(type, row[type]);
    canonicalValues.add(canonical);
    if (canonical !== row[type]) updates.set(row.code, canonical);
  }

  const dictionaryRows = await prisma.dictionaryValue.findMany({
    where: { type },
    select: { value: true, isActive: true, synonyms: true },
  });
  const activeMatches = new Set<string>();
  const existingValues = new Set<string>();

  for (const row of dictionaryRows) {
    existingValues.add(normalizeDictValue(row.value));
    if (!row.isActive) continue;
    activeMatches.add(normalizeDictValue(row.value));
    row.synonyms.forEach((synonym) => activeMatches.add(normalizeDictValue(synonym)));
  }

  const orderedCanonicalValues = sortValues(type, canonicalValues);
  const dictionaryAdded: string[] = [];

  for (const canonical of orderedCanonicalValues) {
    if (!canonical) continue;
    const normalized = normalizeDictValue(canonical);
    if (!activeMatches.has(normalized) && !existingValues.has(normalized)) {
      dictionaryAdded.push(canonical);
    }
    if (!dry) await resolveOrCreate(type, canonical);
  }

  const updatesByValue = new Map<string, string[]>();
  for (const [code, value] of updates) {
    const codes = updatesByValue.get(value) ?? [];
    codes.push(code);
    updatesByValue.set(value, codes);
  }

  if (!dry) {
    for (const [value, codes] of updatesByValue) {
      await prisma.catalog.updateMany({
        where: { code: { in: codes } },
        data: { [type]: value },
      });
    }
  }

  const valuesInDict = dry
    ? dictionaryRows.length + dictionaryAdded.length
    : await prisma.dictionaryValue.count({ where: { type } });
  const changedPairs = new Map<string, string>();
  for (const row of rows) {
    const raw = normalizeDictValue(row[type]);
    const canonical = targetValue(type, row[type]);
    if (row[type] && canonical !== row[type]) changedPairs.set(row[type], canonical);
  }
  const cleared = [...updates.values()].filter((value) => value === '').length;

  console.log(`\n[${type}] ${DICT_LABELS[type]}`);
  printValues(`Distinct до (${distinct.length})`, distinct);
  printValues('План преобразований', [...changedPairs].map(([raw, canonical]) => ({ raw, canonical })));
  printValues(
    dry ? 'Будет добавлено в DictionaryValue' : 'Добавлено в DictionaryValue',
    sortValues(type, dictionaryAdded),
  );
  console.log(`Сводка: ${JSON.stringify({ valuesInDict, rowsUpdated: updates.size, cleared })}`);
}

async function main(): Promise<void> {
  console.log(`Режим: ${DRY ? 'DRY (без записи)' : 'LIVE'}`);
  const rows = await prisma.catalog.findMany({
    select: {
      code: true,
      blankType: true,
      material: true,
      materialGrade: true,
      blankSize: true,
      priority: true,
    },
  });

  console.log(`Catalog: ${rows.length} строк`);
  const priorityValues = sortValues(
    'priority',
    new Set(rows.map((row) => normalizeDictValue(row.priority))),
  );
  printValues(`[priority] ${DICT_LABELS.priority} (только чтение)`, priorityValues);

  for (const type of CATALOG_DICT_TYPES) {
    await applyField(type, rows, DRY);
  }
}

main().finally(() => prisma.$disconnect());
