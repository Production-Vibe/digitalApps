function pad(n: number, len: number): string {
  return String(n).padStart(len, '0');
}

function ts(): { ymd: string; hms: string; hm: string } {
  const d = new Date();
  const ymd = `${d.getFullYear().toString().slice(2)}${pad(d.getMonth() + 1, 2)}${pad(d.getDate(), 2)}`;
  const hms = `${pad(d.getHours(), 2)}${pad(d.getMinutes(), 2)}${pad(d.getSeconds(), 2)}`;
  const hm = `${pad(d.getHours(), 2)}${pad(d.getMinutes(), 2)}`;
  return { ymd, hms, hm };
}

export function generateLaunchId(): string {
  const { ymd, hms } = ts();
  return `ЗП-${ymd}-${hms}`;
}

export function generateNaryadId(): string {
  const { ymd, hms } = ts();
  return `Н-${ymd}-${hms}`;
}

export function generateShiftId(): string {
  const { ymd, hms } = ts();
  return `СМ-${ymd}-${hms}`;
}

export async function generateTransitionNumber(
  prisma: { transitions: { findMany: (args: { where: { orderNumber: string }; orderBy: { number: 'desc' }; take: number }) => Promise<{ number: string }[]> } },
  orderNumber: string,
): Promise<string> {
  const last = await prisma.transitions.findMany({
    where: { orderNumber },
    orderBy: { number: 'desc' },
    take: 1,
  });
  if (last.length === 0) return '005';
  const num = parseInt(last[0].number, 10);
  return pad(num + 5, 3);
}
