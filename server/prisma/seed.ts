import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

const SEED_DIR = path.join(__dirname, 'data');

interface CatalogRow {
  Код: string;
  Наименование: string;
  Обозначение: string;
  'Обозначение 2': string;
  'Кол-во на родителя': number;
  'Тип заготовки': string;
  Материал: string;
  'Марка материала': string;
  'Размер заготовки': string;
  'Толщина стенки': number;
  'Длина резки': number;
  ППБ: string;
  'Масса заготовки': number;
  'Масса детали': number;
  Резка: string;
  Термообработка: string;
  Плазма: string;
  Токарная: string;
  Фрезерная: string;
  Сверлильная: string;
  Слесарная: string;
  Гибка: string;
  Покрытие: string;
  Приоритет: string;
}

interface EmployeeRow {
  login: string;
  password: string;
  ФИО: string;
  role: string;
}

interface EquipmentRow {
  название: string;
}

function toBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toUpperCase();
  return s === '+' || s === '1' || s === 'ДА';
}

async function seedCatalog(rows: CatalogRow[]) {
  console.log(`Seeding catalog: ${rows.length} rows`);
  for (const r of rows) {
    await prisma.catalog.upsert({
      where: { код: r['Код'] },
      update: {},
      create: {
        код: r['Код'],
        наименование: r['Наименование'],
        обозначение: r['Обозначение'],
        обозначение2: r['Обозначение 2'],
        колНаРодителя: r['Кол-во на родителя'],
        типЗаготовки: r['Тип заготовки'],
        материал: r['Материал'],
        маркаМатериала: r['Марка материала'],
        размерЗаготовки: r['Размер заготовки'],
        толщинаСтенки: r['Толщина стенки'],
        длинаРезки: r['Длина резки'],
        ппб: r['ППБ'],
        массаЗаготовки: r['Масса заготовки'],
        массаДетали: r['Масса детали'],
        резка: toBool(r['Резка']),
        термообработка: toBool(r['Термообработка']),
        плазма: toBool(r['Плазма']),
        токарная: toBool(r['Токарная']),
        фрезерная: toBool(r['Фрезерная']),
        сверлильная: toBool(r['Сверлильная']),
        слесарная: toBool(r['Слесарная']),
        гибка: toBool(r['Гибка']),
        покрытие: toBool(r['Покрытие']),
        приоритет: r['Приоритет'],
      },
    });
  }
}

async function seedEmployees(rows: EmployeeRow[]) {
  console.log(`Seeding employees: ${rows.length} rows`);
  for (const r of rows) {
    const hash = await bcrypt.hash(r['password'], 10);
    await prisma.employees.upsert({
      where: { login: r['login'] },
      update: { password: hash },
      create: {
        login: r['login'],
        password: hash,
        фио: r['ФИО'],
        role: r['role'] as 'master' | 'shift' | 'operator' | 'otk',
      },
    });
  }
}

async function seedEquipment(rows: EquipmentRow[]) {
  console.log(`Seeding equipment: ${rows.length} rows`);
  for (const r of rows) {
    await prisma.equipment.upsert({
      where: { название: r['название'] },
      update: {},
      create: { название: r['название'] },
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
