import 'dotenv/config';
import bcrypt from 'bcrypt';
import { prisma } from '../src/lib/prisma';

const MIN_PASSWORD_LENGTH = 6;

function contour(): string {
  const url = process.env.DATABASE_URL;
  if (!url) return '(DATABASE_URL не задан)';
  const m = url.match(/@([^/]+\/[^?]+)/);
  return m ? m[1] : '(не удалось разобрать URL)';
}

async function main() {
  const pass = process.argv[2];
  if (!pass || pass.length < MIN_PASSWORD_LENGTH) {
    console.error(
      `Использование: npm run passwords -- <новый пароль (мин ${MIN_PASSWORD_LENGTH} символов)>`,
    );
    process.exit(1);
  }
  console.log(`Контур: ${contour()}`);
  const employees = await prisma.employees.findMany({
    select: { login: true, fullName: true, role: true },
    orderBy: { login: 'asc' },
  });
  if (employees.length === 0) {
    console.error('Сотрудники не найдены — пароль не изменён.');
    process.exit(1);
  }
  for (const emp of employees) {
    const hash = await bcrypt.hash(pass, 10);
    await prisma.employees.update({ where: { login: emp.login }, data: { password: hash } });
    console.log(`ok ${emp.login} (${emp.fullName}, ${emp.role})`);
  }
  console.log(`Готово: пароль обновлён у ${employees.length} аккаунт(ов).`);
}

main().finally(() => prisma.$disconnect());