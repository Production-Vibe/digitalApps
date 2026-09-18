import bcrypt from 'bcrypt';
import { prisma } from '../src/lib/prisma';

async function main() {
  const pass = process.argv[2];
  if (!pass || pass.length < 8) {
    console.error('Использование: npm run passwords -- <новый пароль (мин 8 символов)>');
    process.exit(1);
  }
  const logins = ['master', 'shift', 'operator', 'otk'];
  for (const login of logins) {
    const emp = await prisma.employees.findUnique({ where: { login } });
    if (!emp) {
      console.log(`skip ${login}: не найден`);
      continue;
    }
    const hash = await bcrypt.hash(pass, 10);
    await prisma.employees.update({ where: { login }, data: { password: hash } });
    console.log(`ok ${login} (${emp.fullName})`);
  }
}

main().finally(() => prisma.$disconnect());