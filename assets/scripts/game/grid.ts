import { Cell } from './types';

export class Grid {
  readonly width: number;
  readonly height: number;
  private readonly data: Cell[][];

  constructor(width: number, height: number, cells: Cell[][]) {
    this.width = width;
    this.height = height;
    this.data = cells;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  get(x: number, y: number): Cell | undefined {
    if (!this.inBounds(x, y)) return undefined;
    const row = this.data[y];
    if (!row) return undefined;
    return row[x];
  }

  isWalkable(x: number, y: number): boolean {
    return this.get(x, y) === Cell.Empty;
  }

  static fromLines(lines: string[]): Grid {
    const h = lines.length;
    const w = Math.max(...lines.map((l) => l.length), 0);
    const cells: Cell[][] = [];
    for (let y = 0; y < h; y++) {
      const row: Cell[] = [];
      const line = lines[y] ?? '';
      for (let x = 0; x < w; x++) {
        const ch = line[x] ?? '#';
        row.push(ch === '#' ? Cell.Obstacle : Cell.Empty);
      }
      cells.push(row);
    }
    return new Grid(w, h, cells);
  }

  listEmptyCells(): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.get(x, y) === Cell.Empty) out.push({ x, y });
      }
    }
    return out;
  }
}
