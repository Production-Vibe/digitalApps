import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function inflateRaw(buf: Buffer): Buffer {
  return zlib.inflateRawSync(buf);
}

function readZipEntries(filePath: string): Map<string, Buffer> {
  const data = fs.readFileSync(filePath);
  let eocd = -1;
  for (let i = data.length - 22; i >= 0; i--) {
    if (data.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('EOCD not found');

  const cdOffset = data.readUInt32LE(eocd + 16);
  const cdSize = data.readUInt32LE(eocd + 12);
  const entries = new Map<string, Buffer>();
  let p = cdOffset;
  const end = cdOffset + cdSize;

  while (p + 46 <= end) {
    if (data.readUInt32LE(p) !== 0x02014b50) break;
    const method = data.readUInt16LE(p + 10);
    const compSize = data.readUInt32LE(p + 20);
    const nameLen = data.readUInt16LE(p + 28);
    const extraLen = data.readUInt16LE(p + 30);
    const commentLen = data.readUInt16LE(p + 32);
    const localOffset = data.readUInt32LE(p + 42);
    const name = data.subarray(p + 46, p + 46 + nameLen).toString('utf8');

    const lh = localOffset;
    const ln = data.readUInt16LE(lh + 26);
    const le = data.readUInt16LE(lh + 28);
    const dataStart = lh + 30 + ln + le;
    const comp = data.subarray(dataStart, dataStart + compSize);
    const raw = method === 8 ? inflateRaw(comp) : method === 0 ? comp : Buffer.from('');
    entries.set(name, raw);

    p += 46 + nameLen + extraLen + commentLen;
  }

  const probe = entries.get('xl/workbook.xml');
  if (!probe) throw new Error('в архиве нет xl/workbook.xml — это не xlsx/xlsm');
  return entries;
}

function colIndex(ref: string): number {
  let n = 0;
  for (let i = 0; i < ref.length; i++) {
    const ch = ref.charCodeAt(i);
    if (ch < 65 || ch > 90) break;
    n = n * 26 + (ch - 64);
  }
  return n - 1;
}

interface RawCell {
  col: number;
  val: string;
}

function parseSheetXml(xml: string, shared: string[]): Map<number, RawCell[]> {
  const rows = new Map<number, RawCell[]>();
  const rowRe = /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  const cellRe = /<c[^>]*?r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(xml))) {
    const rn = Number(rm[1]);
    const cells: RawCell[] = [];
    let cm: RegExpExecArray | null;
    cellRe.lastIndex = 0;
    const body = rm[2];
    while ((cm = cellRe.exec(body))) {
      const ref = cm[1];
      const attrs = cm[2];
      const content = cm[3];
      let val = '';
      const v = /<v>([\s\S]*?)<\/v>/.exec(content);
      const isInline = /<is>([\s\S]*?)<\/is>/.exec(content);
      if (attrs.includes('t="s"') && v) {
        val = shared[Number(v[1])] ?? '';
      } else if (attrs.includes('t="inlineStr"') && isInline) {
        const t = /<t[^>]*>([\s\S]*?)<\/t>/.exec(isInline[1]);
        val = t ? t[1] : '';
      } else if (v) {
        val = v[1];
      }
      cells.push({ col: colIndex(ref), val });
    }
    rows.set(rn, cells);
  }
  return rows;
}

function parseSharedStrings(xml: string): string[] {
  const list: string[] = [];
  const siRe = /<si>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = siRe.exec(xml))) {
    let s = '';
    const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g;
    let tm: RegExpExecArray | null;
    while ((tm = tRe.exec(m[1]))) s += tm[1];
    list.push(s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
  }
  return list;
}

function csv(v: string | undefined): string {
  return (v ?? '').trim();
}

function num(v: string | undefined): number {
  const n = Number(csv(v));
  return Number.isFinite(n) ? n : 0;
}

function toBool(v: string | undefined): boolean {
  return csv(v) === '+' || csv(v) === 'Д' || csv(v) === 'ДА' || csv(v) === '1';
}

interface ImportRow {
  code: string;
  name: string;
  designation: string;
  designation2: string;
  parentQty: number;
  blankType: string;
  material: string;
  materialGrade: string;
  blankSize: string;
  wallThickness: number;
  cutLength: number;
  partWeight: number;
  blankWeight: number;
  heatTreatment: boolean;
  coating: boolean;
}

function cellOf(cells: RawCell[], col: number): string | undefined {
  const c = cells.find((x) => x.col === col);
  return c ? c.val : undefined;
}

function parseRows(rows: Map<number, RawCell[]>): Map<string, ImportRow> {
  const out = new Map<string, ImportRow>();
  for (const [rn, cells] of rows) {
    if (rn < 8) continue;
    const code = csv(cellOf(cells, 0));
    if (!code) continue;
    out.set(code, {
      code,
      name: csv(cellOf(cells, 1)),
      designation: csv(cellOf(cells, 2)),
      designation2: csv(cellOf(cells, 3)),
      parentQty: num(cellOf(cells, 27)),
      blankType: csv(cellOf(cells, 21)),
      material: csv(cellOf(cells, 22)),
      materialGrade: csv(cellOf(cells, 23)),
      blankSize: csv(cellOf(cells, 24)),
      wallThickness: num(cellOf(cells, 25)),
      cutLength: num(cellOf(cells, 19)),
      partWeight: num(cellOf(cells, 30)),
      blankWeight: num(cellOf(cells, 31)),
      heatTreatment: toBool(cellOf(cells, 15)),
      coating: toBool(cellOf(cells, 16)),
    });
  }
  return out;
}

async function dropOrphanRefs(orphanCodes: string[]): Promise<void> {
  if (orphanCodes.length === 0) return;

  const [launches, workOrders, queues] = await Promise.all([
    prisma.launches.findMany({ where: { partCode: { in: orphanCodes } }, select: { id: true, partCode: true } }),
    prisma.workOrders.findMany({ where: { partCode: { in: orphanCodes } }, select: { number: true, partCode: true } }),
    prisma.queue.findMany({ where: { code: { in: orphanCodes } }, select: { id: true } }),
  ]);

  const orderNumbers = workOrders.map((w) => w.number);
  const launchIds = launches.map((l) => l.id);

  if (orderNumbers.length) {
    await prisma.transitions.deleteMany({ where: { orderNumber: { in: orderNumbers } } });
    await prisma.closedOrders.deleteMany({ where: { orderNumber: { in: orderNumbers } } });
    await prisma.printQueue.deleteMany({ where: { orderNumber: { in: orderNumbers } } });
    await prisma.workOrders.deleteMany({ where: { number: { in: orderNumbers } } });
  }
  if (launchIds.length) {
    await prisma.launches.deleteMany({ where: { id: { in: launchIds } } });
  }
  if (queues.length) {
    await prisma.queue.deleteMany({ where: { id: { in: queues.map((q) => q.id) } } });
  }

  console.log(`  Удалены orphan-ссылки: запусков=${launches.length}, нарядов=${workOrders.length}, queue=${queues.length}`);
  for (const l of launches) console.log(`    launch ${l.id} (partCode=${l.partCode})`);
  for (const w of workOrders) console.log(`    naryad ${w.number} (partCode=${w.partCode})`);
}

async function main() {
  const arg = process.argv[2];
  const defaultPath = path.resolve(__dirname, '..', '..', 'Номенклатура продукции.xlsm');
  const file = arg ? path.resolve(process.cwd(), arg) : defaultPath;
  if (!fs.existsSync(file)) {
    console.error(`Файл не найден: ${file}`);
    process.exit(1);
  }

  console.log(`Читаю: ${file}`);
  const entries = readZipEntries(file);

  const workBookXml = entries.get('xl/workbook.xml')?.toString('utf8') ?? '';
  const sheetNames = Array.from(workBookXml.matchAll(/<sheet[^>]*name="([^"]+)"/g)).map((m) => m[1]);
  console.log(`Листы: ${sheetNames.join(', ')}`);
  const isProduct = sheetNames.some((s) => s.startsWith('Продукц'));
  if (!isProduct) {
    console.error('Первый лист не называется «Продукция» — остановка.');
    process.exit(1);
  }

  const shared = parseSharedStrings(entries.get('xl/sharedStrings.xml')?.toString('utf8') ?? '');
  const rows = parseSheetXml(entries.get('xl/worksheets/sheet1.xml')?.toString('utf8') ?? '', shared);
  const parsed = parseRows(rows);
  console.log(`Кодов в листе «Продукция»: ${parsed.size}`);

  const existing = await prisma.catalog.findMany({ select: { code: true } });
  const oldCodes = new Set(existing.map((x) => x.code));
  const orphanCodes = [...oldCodes].filter((c) => !parsed.has(c));
  console.log(`Текущий каталог: ${existing.length}. Импортируем: ${parsed.size}. Orphan (старые коды без аналога): ${orphanCodes.length}`);

  const rowsArr = [...parsed.values()];
  const catalogRows = rowsArr.map((r) => ({
    ...r,
    ppb: '',
    cutting: false,
    plasma: false,
    turning: false,
    milling: false,
    drilling: false,
    fitting: false,
    bending: false,
    priority: '',
  }));

  const result = await prisma.$transaction(async (tx) => {
    await dropOrphanRefs(orphanCodes);
    await tx.catalog.deleteMany({});
    for (let i = 0; i < catalogRows.length; i += 500) {
      await tx.catalog.createMany({ data: catalogRows.slice(i, i + 500) });
    }
    const after = await tx.catalog.count();
    return after;
  });

  console.log(`Импорт завершён. Catalog=%d`, result);
}

main()
  .catch((e) => {
    console.error('Импорт не удался:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());