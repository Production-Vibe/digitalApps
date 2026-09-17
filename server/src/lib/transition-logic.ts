import { prisma } from './prisma';
import { notifyRole } from './notify';

export async function updateNaryadStatus(orderNumber: string) {
  const transitions = await prisma.transitions.findMany({ where: { orderNumber } });
  const order = await prisma.workOrders.findUnique({ where: { number: orderNumber } });
  if (!order || order.status === 'closed') return;

  const hasInProgress = transitions.some((t) => t.status === 'in_progress');
  const allCompleted = transitions.every((t) => t.status === 'completed' || t.status === 'checked');

  let newStatus = order.status;
  if (hasInProgress) {
    newStatus = 'in_progress';
  } else if (allCompleted && transitions.length > 0) {
    newStatus = 'waiting_otk';
  } else {
    newStatus = 'in_progress';
  }

  if (newStatus !== order.status) {
    await prisma.workOrders.update({ where: { number: orderNumber }, data: { status: newStatus } });
    if (newStatus === 'waiting_otk') {
      await notifyRole('otk', {
        type: 'waiting_otk',
        title: 'Наряд готов к ОТК',
        message: orderNumber + ' · ' + order.designation + ' · оператор ' + order.operator,
        link: '/otk',
      });
    }
  }
}