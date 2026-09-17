import { prisma } from './prisma';
import type { EmployeeRole } from './naryad-status';

export interface NotificationData {
  type: string;
  title: string;
  message?: string;
  link?: string;
}

async function findByFullName(fullName: string) {
  if (!fullName) return null;
  return prisma.employees.findFirst({ where: { fullName } });
}

export async function notifyOperator(fullName: string, data: NotificationData) {
  const emp = await findByFullName(fullName);
  if (!emp) return;
  await prisma.notification.create({ data: { ...data, targetLogin: emp.login } });
}

export function notifyRole(role: EmployeeRole, data: NotificationData) {
  return prisma.notification.create({ data: { ...data, targetRole: role } });
}