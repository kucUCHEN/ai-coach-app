// 模擬感測器：假裝有人在運動，產生和真的感測器一模一樣格式的文字行。
import { SensorSource } from './SensorSource.js';
import { byId } from './exercises.js';

export class MockSensor extends SensorSource {
  constructor() {
    super();
    this.kind = 'mock';
    this.name = '模擬感測器';
    this.battery = 80;
    this.timer = null;
    this.reps = 0;
    this.good = 0;
  }
  async connect() {
    await new Promise((r) => setTimeout(r, 600)); // 假裝在連線
    this.setStatus(true);
    this.receiveLine(`B,${this.battery}`);
  }
  async disconnect() {
    this._clear();
    this.setStatus(false);
  }
  async send(cmd) {
    if (!this.connected) return;
    if (cmd.startsWith('S')) this._run(Number(cmd.split(',')[1] ?? 0));
    else if (cmd === 'P') { this._clear(); this._report(); }
    else if (cmd === 'B') this.receiveLine(`B,${this.battery}`);
  }
  _run(id) {
    this._clear();
    const ex = byId(id) || byId(0);
    this.reps = 0; this.good = 0;
    this._report();
    const tick = () => {
      this.reps++;
      if (Math.random() < 0.92) this.good++;
      this._report();
      if (this.reps % 50 === 0 && this.battery > 5) this.battery--;
      const jitter = ex.avgGapMs * (0.8 + Math.random() * 0.4);
      this.timer = setTimeout(tick, jitter);
    };
    this.timer = setTimeout(tick, ex.avgGapMs);
  }
  _report() {
    const quality = this.reps ? Math.round((this.good / this.reps) * 100) : 0;
    const stars = this.reps < 3 ? 0 : 3 + (Math.random() < 0.6 ? 1 : 0) + (Math.random() < 0.2 ? 1 : 0);
    this.receiveLine(`C,${this.reps},${quality},${Math.min(stars, 5)}`);
  }
  _clear() { clearTimeout(this.timer); this.timer = null; }
}
