import { prisma } from './prisma';

export async function updateNaryadStatus(naryadNomer: string) {
  const transitions = await prisma.transitions.findMany({ where: { naryadNomer } });
  const order = await prisma.workOrders.findUnique({ where: { номер: naryadNomer } });
  if (!order || order.статус === 'closed') return;

  const hasInProgress = transitions.some((t) => t.статус === 'in_progress');
  const allCompleted = transitions.every((t) => t.статус === 'completed' || t.статус === 'checked');

  let newStatus = order.статус;
  if (hasInProgress) {
    newStatus = 'in_progress';
  } else if (allCompleted && transitions.length > 0) {
    newStatus = 'waiting_otk';
  } else {
    newStatus = 'in_progress';
  }

  if (newStatus !== order.статус) {
    await prisma.workOrders.update({ where: { номер: naryadNomer }, data: { статус: newStatus } });
  }
}