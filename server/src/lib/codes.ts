const splitCode = (code: string): string[] =>
  code.split(/[./]/).map((s) => s.trim()).filter(Boolean);

const norm = (code: string): string => splitCode(code).join('/');

export function computeNext(parent: string, codes: string[]): string {
  const segs = splitCode(parent);
  const parentKey = norm(parent);
  const direct = codes.filter((c) => {
    const key = norm(c);
    return key.startsWith(parentKey + '/') && key.split('/').length === segs.length + 1;
  });
  const nums = direct
    .map((c) => Number(splitCode(c).at(-1)))
    .filter((n) => Number.isFinite(n));
  return parent + '/' + ((nums.length ? Math.max(...nums) : 0) + 1);
}

export function topLevelNext(codes: string[]): string {
  const tops = codes
    .map((c) => Number(splitCode(c)[0]))
    .filter((n) => Number.isFinite(n));
  return String((tops.length ? Math.max(...tops) : 0) + 1);
}

export function missingPathRows(rootCode: string, codes: string[]): string[] {
  const segs = splitCode(rootCode);
  const allowed = new Set(codes.map((c) => norm(c)));
  const missing: string[] = [];
  for (let i = 1; i <= segs.length; i++) {
    const p = segs.slice(0, i).join('/');
    if (!allowed.has(p)) missing.push(p);
  }
  return missing;
}

export function isPrefix(parent: string, codes: string[]): boolean {
  return codes.some((c) => c === parent || c.startsWith(parent + '/'));
}
