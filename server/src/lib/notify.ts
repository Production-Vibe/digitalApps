import { prisma } from './prisma';
import type { EmployeeRole } from './naryad-status';
import { dispatchPush, initWebPush } from './push';

initWebPush();

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
  void dispatchPush([emp.login], data);
}

export async function notifyRole(role: EmployeeRole, data: NotificationData) {
  const emp = await prisma.employees.findMany({ where: { role }, select: { login: true } });
  await prisma.notification.create({ data: { ...data, targetRole: role } });
  void dispatchPush(emp.map((e) => e.login), data);
}