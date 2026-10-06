export function parseContactCsv(input: string) {
  if (input.length > 100000) throw new Error('CSV is too large; import at most 100 contacts at a time');
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && input[i + 1] === '\n') i++;
      row.push(cell); if (row.some(v => v.trim())) rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field');
  row.push(cell); if (row.some(v => v.trim())) rows.push(row);
  const header = rows.shift()?.map(v => v.trim());
  if (header?.join(',') !== 'externalId,name,email,phone') throw new Error('CSV header must be externalId,name,email,phone');
  if (rows.length < 1 || rows.length > 100 || rows.some(r => r.length !== 4)) throw new Error('CSV requires 1–100 rows with four columns');
  return rows.map(([externalId, name, email, phone]) => ({ externalId, name, email, phone }));
}
