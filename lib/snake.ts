"use client";

/*
 * A small snake game printed into a <pre>, for the shell. Arrows or WASD
 * steer, a swipe works on phones, q or esc quits. The board is a box of
 * + - |, the snake o with an @ for a head, the food a *.
 */

type Dir = [number, number];
const DIRS: Record<string, Dir> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  w: [0, -1],
  s: [0, 1],
  a: [-1, 0],
  d: [1, 0],
};

export class Snake {
  private el: HTMLElement;
  private cols: number;
  private rows: number;
  private body: [number, number][] = [];
  private dir: Dir = [1, 0];
  private queue: Dir[] = [];
  private food: [number, number] = [0, 0];
  private timer = 0;
  private best = 0;
  score = 0;
  over = false;
  private onScore: (score: number) => void;
  private swipe: { x: number; y: number } | null = null;

  constructor(el: HTMLElement, cols: number, rows: number, onScore: (score: number) => void) {
    this.el = el;
    this.cols = cols;
    this.rows = rows;
    this.onScore = onScore;
    el.addEventListener("pointerdown", this.down);
    el.addEventListener("pointerup", this.up);
    this.reset();
  }

  private down = (e: PointerEvent) => {
    this.swipe = { x: e.clientX, y: e.clientY };
  };

  private up = (e: PointerEvent) => {
    if (!this.swipe) return;
    const dx = e.clientX - this.swipe.x;
    const dy = e.clientY - this.swipe.y;
    this.swipe = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) {
      if (this.over) this.reset();
      return;
    }
    this.turn(Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)]);
  };

  reset() {
    const y = (this.rows / 2) | 0;
    this.body = [
      [5, y],
      [4, y],
      [3, y],
    ];
    this.dir = [1, 0];
    this.queue = [];
    this.score = 0;
    this.over = false;
    this.place();
    this.schedule();
    this.draw();
  }

  /** handles a key; true if it was the game's */
  key(k: string) {
    const d = DIRS[k] ?? DIRS[k.toLowerCase()];
    if (d) {
      this.turn(d);
      return true;
    }
    if ((k === " " || k === "Enter") && this.over) {
      this.reset();
      return true;
    }
    return false;
  }

  private turn(d: Dir) {
    const last = this.queue[this.queue.length - 1] ?? this.dir;
    // no turning back into yourself
    if (d[0] === -last[0] && d[1] === -last[1]) return;
    if (d[0] === last[0] && d[1] === last[1]) return;
    if (this.queue.length < 3) this.queue.push(d);
  }

  private place() {
    const free: [number, number][] = [];
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if (!this.body.some(([bx, by]) => bx === x && by === y)) free.push([x, y]);
      }
    }
    this.food = free[(Math.random() * free.length) | 0] ?? [0, 0];
  }

  private schedule() {
    window.clearTimeout(this.timer);
    if (this.over) return;
    // a little faster with every bite
    this.timer = window.setTimeout(() => this.step(), Math.max(60, 130 - this.score * 4));
  }

  private step() {
    this.dir = this.queue.shift() ?? this.dir;
    const [hx, hy] = this.body[0];
    const nx = hx + this.dir[0];
    const ny = hy + this.dir[1];
    const hitsSelf = this.body.slice(0, -1).some(([x, y]) => x === nx && y === ny);
    if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows || hitsSelf) {
      this.over = true;
      this.best = Math.max(this.best, this.score);
      this.draw();
      return;
    }
    this.body.unshift([nx, ny]);
    if (nx === this.food[0] && ny === this.food[1]) {
      this.score++;
      this.onScore(this.score);
      this.place();
    } else this.body.pop();
    this.draw();
    this.schedule();
  }

  private draw() {
    const grid = Array.from({ length: this.rows }, () => Array(this.cols).fill(" "));
    grid[this.food[1]][this.food[0]] = "*";
    this.body.forEach(([x, y], i) => {
      grid[y][x] = i === 0 ? (this.over ? "x" : "@") : "o";
    });
    const edge = `+${"-".repeat(this.cols)}+`;
    const status = this.over
      ? `game over. ${this.score} eaten. space for another, q to quit`
      : `${this.score} eaten${this.best ? `, best ${this.best}` : ""}. arrows or wasd, q quits`;
    this.el.textContent = [edge, ...grid.map((r) => `|${r.join("")}|`), edge, status].join("\n");
  }

  destroy() {
    window.clearTimeout(this.timer);
    this.over = true;
    this.el.removeEventListener("pointerdown", this.down);
    this.el.removeEventListener("pointerup", this.up);
  }
}
