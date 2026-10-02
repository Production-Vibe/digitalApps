import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../src/lib/prisma';

const DRY = process.argv.includes('--dry');
const FILE_ARG = process.argv.find((arg) => arg.startsWith('--file='));
const SOURCE = FILE_ARG
  ? path.resolve(FILE_ARG.slice('--file='.length))
  : path.resolve(__dirname, '..', '..', 'манифест.md');

const K_NAME = 'Наименование';
const K_DESIGNATION = 'Обозначение';
const K_COUNT = 'КолДокументов';
const K_DOC = 'Документ';
const D_TYPE = 'Тип';
const D_FILE = 'Файл';
const D_PATH = 'Источник';
const D_STATUS = 'Статус';

type ManifestDoc = { type: string; file: string; path: string; status: string };

type ManifestItem = {
  name: string;
  designation: string;
  docs: ManifestDoc[];
};

function parseManifest(raw: string): { items: ManifestItem[]; declaredTotal: number } {
  const sections: Record<string, string>[] = [];
  let buffer: Record<string, string> | null = null;

  for (const line of raw.split(/\r?\n/)) {
    if (/^\[\d+\]$/.test(line)) {
      buffer = {};
      sections.push(buffer);
      continue;
    }
    if (!buffer) continue;
    const pair = line.match(/^([^=]+)=(.*)$/);
    if (pair) buffer[pair[1].trim()] = pair[2];
  }

  let declaredTotal = 0;
  const items: ManifestItem[] = sections.map((section) => {
    const declaredCount = Number(section[K_COUNT]) || 0;
    declaredTotal += declaredCount;
    const docs: ManifestDoc[] = [];
    for (let i = 1; i <= declaredCount; i++) {
      docs.push({
        type: (section[`${K_DOC}.${i}.${D_TYPE}`] || '').trim(),
        file: (section[`${K_DOC}.${i}.${D_FILE}`] || '').trim(),
        path: (section[`${K_DOC}.${i}.${D_PATH}`] || '').trim(),
        status: (section[`${K_DOC}.${i}.${D_STATUS}`] || '').trim() || 'new',
      });
    }
    return {
      name: (section[K_NAME] || '').trim(),
      designation: (section[K_DESIGNATION] || '').trim(),
      docs,
    };
  });

  return { items, declaredTotal };
}

function summarize(label: string, values: string[], limit = 12): void {
  console.log(`${label}: ${values.length}`);
  for (const value of values.slice(0, limit)) console.log(`    ${value}`);
  if (values.length > limit) console.log(`    … ещё ${values.length - limit}`);
}

async function main(): Promise<void> {
  console.log(`Режим: ${DRY ? 'DRY (без записи)' : 'LIVE'}`);
  if (!fs.existsSync(SOURCE)) {
    console.error(`Файл манифеста не найден: ${SOURCE}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Файл манифеста: ${SOURCE}`);

  const { items, declaredTotal } = parseManifest(fs.readFileSync(SOURCE, 'utf8'));
  console.log(`Позиций в манифесте: ${items.length}`);
  console.log(`Документов в манифесте: ${declaredTotal}`);

  const catalog = await prisma.catalog.findMany({ select: { code: true, designation: true } });
  const codesByDesignation = new Map<string, string[]>();
  for (const row of catalog) {
    const designation = row.designation.trim();
    if (!designation) continue;
    const list = codesByDesignation.get(designation) ?? [];
    list.push(row.code);
    codesByDesignation.set(designation, list);
  }
  console.log(`Каталог: ${catalog.length} позиций, обозначений: ${codesByDesignation.size}`);

  const skippedNoDesignation: string[] = [];
  const skippedNotFound: string[] = [];
  const skippedBadDocs: string[] = [];
  const typeCount = new Map<string, number>();
  let matchedProducts = 0;
  let sharedProducts = 0;
  let docsToImport = 0;
  let linksToCreate = 0;

  for (const item of items) {
    if (!item.designation) {
      skippedNoDesignation.push(item.name || '(без наименования)');
      continue;
    }
    const codes = codesByDesignation.get(item.designation);
    if (!codes || codes.length === 0) {
      skippedNotFound.push(`${item.designation} — ${item.name}`);
      continue;
    }
    matchedProducts++;
    if (codes.length > 1) sharedProducts++;
    for (const doc of item.docs) {
      if (!doc.type || !doc.file || !doc.path) {
        skippedBadDocs.push(`${item.designation} — ${doc.file || '(без файла)'}`);
        continue;
      }
      docsToImport++;
      linksToCreate += codes.length;
      typeCount.set(doc.type, (typeCount.get(doc.type) ?? 0) + 1);
    }
  }

  console.log('');
  console.log(`Совпало позиций по обозначению: ${matchedProducts} (из них деталь в нескольких сборках: ${sharedProducts})`);
  console.log(`Документов к импорту: ${docsToImport}`);
  console.log(`Связей документ→позиция: ${linksToCreate}`);
  console.log('');
  console.log('Типы документов:');
  for (const [type, count] of [...typeCount.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${count}\t${type}`);
  }
  console.log('');
  summarize('Пропущено позиций: пустое обозначение', skippedNoDesignation);
  summarize('Пропущено позиций: обозначения нет в каталоге', skippedNotFound);
  summarize('Пропущено документов: нет типа/файла/пути', skippedBadDocs);

  const summary = {
    mode: DRY ? 'dry' : 'live',
    manifestItems: items.length,
    manifestDocs: declaredTotal,
    matchedProducts,
    sharedProducts,
    docsToImport,
    linksToCreate,
    skippedNoDesignation: skippedNoDesignation.length,
    skippedNotFound: skippedNotFound.length,
    skippedBadDocs: skippedBadDocs.length,
  };

  if (DRY) {
    console.log('');
    console.log('Сводка: ' + JSON.stringify(summary));
    return;
  }

  const docsBefore = await prisma.productDoc.count();
  const linksBefore = await prisma.productDocLink.count();
  console.log('');
  console.log(`До импорта: документов ${docsBefore}, связей ${linksBefore}`);

  let created = 0;
  let reused = 0;
  let linksAdded = 0;

  for (const item of items) {
    const codes = item.designation ? codesByDesignation.get(item.designation) : undefined;
    if (!codes || codes.length === 0) continue;
    for (const doc of item.docs) {
      if (!doc.type || !doc.file || !doc.path) continue;
      const where = { type_file_path: { type: doc.type, file: doc.file, path: doc.path } };
      const existed = await prisma.productDoc.findUnique({ where, select: { id: true } });
      const saved = await prisma.productDoc.upsert({
        where,
        update: {},
        create: { type: doc.type, file: doc.file, path: doc.path, status: doc.status },
      });
      if (existed) reused++;
      else created++;
      const written = await prisma.productDocLink.createMany({
        data: codes.map((partCode) => ({ docId: saved.id, partCode })),
        skipDuplicates: true,
      });
      linksAdded += written.count;
    }
  }

  console.log(`Создано документов: ${created}`);
  console.log(`Уже существовало: ${reused}`);
  console.log(`Добавлено связей: ${linksAdded}`);

  const linkedParts = await prisma.productDocLink.findMany({
    distinct: ['partCode'],
    select: { partCode: true },
  });

  console.log('');
  console.log('Итого: ' + JSON.stringify({
    ...summary,
    docs: await prisma.productDoc.count(),
    links: await prisma.productDocLink.count(),
    linkedParts: linkedParts.length,
  }));
}

main().finally(() => prisma.$disconnect());
