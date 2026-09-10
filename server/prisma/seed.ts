import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

const SEED_DIR = path.join(__dirname, 'data');

interface CatalogRow {
  code: string;
  name: string;
  designation: string;
  designation2?: string;
  parentQty: number;
  blankType: string;
  material: string;
  materialGrade: string;
  blankSize: string;
  wallThickness: number;
  cutLength: number;
  ppb: string;
  blankWeight: number;
  partWeight: number;
  cutting: boolean;
  heatTreatment: boolean;
  plasma: boolean;
  turning: boolean;
  milling: boolean;
  drilling: boolean;
  fitting: boolean;
  bending: boolean;
  coating: boolean;
  priority: string;
}

interface EmployeeRow {
  login: string;
  password: string;
  fullName: string;
  role: 'master' | 'shift' | 'operator' | 'otk';
}

interface EquipmentRow {
  name: string;
}

function toBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toUpperCase();
  return s === '+' || s === '1' || s === 'ДА';
}

function toNum(v: unknown): number {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function toStr(v: unknown): string {
  return v === null || v === undefined ? '' : String(v);
}

async function seedCatalog(rows: CatalogRow[]) {
  console.log(`Seeding catalog: ${rows.length} rows`);
  for (const r of rows) {
    await prisma.catalog.upsert({
      where: { code: r.code },
      update: {},
      create: {
        code: r.code,
        name: toStr(r.name),
        designation: toStr(r.designation),
        designation2: toStr(r.designation2),
        parentQty: toNum(r.parentQty),
        blankType: toStr(r.blankType),
        material: toStr(r.material),
        materialGrade: toStr(r.materialGrade),
        blankSize: toStr(r.blankSize),
        wallThickness: toNum(r.wallThickness),
        cutLength: toNum(r.cutLength),
        ppb: toStr(r.ppb),
        blankWeight: toNum(r.blankWeight),
        partWeight: toNum(r.partWeight),
        cutting: toBool(r.cutting),
        heatTreatment: toBool(r.heatTreatment),
        plasma: toBool(r.plasma),
        turning: toBool(r.turning),
        milling: toBool(r.milling),
        drilling: toBool(r.drilling),
        fitting: toBool(r.fitting),
        bending: toBool(r.bending),
        coating: toBool(r.coating),
        priority: toStr(r.priority),
      },
    });
  }
}

async function seedEmployees(rows: EmployeeRow[]) {
  console.log(`Seeding employees: ${rows.length} rows`);
  for (const r of rows) {
    const hash = await bcrypt.hash(r.password, 10);
    await prisma.employees.upsert({
      where: { login: r.login },
      update: { password: hash },
      create: {
        login: r.login,
        password: hash,
        fullName: r.fullName,
        role: r.role,
      },
    });
  }
}

async function seedEquipment(rows: EquipmentRow[]) {
  console.log(`Seeding equipment: ${rows.length} rows`);
  for (const r of rows) {
    await prisma.equipment.upsert({
      where: { name: r.name },
      update: {},
      create: { name: r.name },
    });
  }
}

function loadJson<T>(filename: string): T[] {
  const fp = path.join(SEED_DIR, filename);
  if (!fs.existsSync(fp)) {
    console.log(`  ${filename} not found, skipping`);
    return [];
  }
  return JSON.parse(fs.readFileSync(fp, 'utf-8')) as T[];
}

async function main() {
  console.log('=== Seed start ===');

  const catalog = loadJson<CatalogRow>('catalog.json');
  if (catalog.length > 0) await seedCatalog(catalog);

  const employees = loadJson<EmployeeRow>('employees.json');
  if (employees.length > 0) await seedEmployees(employees);

  const equipment = loadJson<EquipmentRow>('equipment.json');
  if (equipment.length > 0) await seedEquipment(equipment);

  console.log('=== Seed complete ===');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());