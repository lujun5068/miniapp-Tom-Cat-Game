function repeat(ch: string, n: number): string {
  return ch.repeat(n);
}

export function buildDemoMap(): string[] {
  const cols = 14;
  const rows = 14;
  const lines: string[] = [];
  lines.push(repeat('#', cols));
  for (let y = 1; y < rows - 1; y++) {
    lines.push('#' + repeat('.', cols - 2) + '#');
  }
  lines.push(repeat('#', cols));

  const setWall = (x: number, y: number) => {
    const row = lines[y];
    if (!row || x <= 0 || x >= cols - 1) return;
    lines[y] = row.slice(0, x) + '#' + row.slice(x + 1);
  };

  setWall(4, 2);
  setWall(8, 2);
  setWall(6, 4);
  setWall(3, 6);
  setWall(10, 6);
  setWall(6, 8);
  setWall(4, 10);
  setWall(9, 10);

  return lines;
}
