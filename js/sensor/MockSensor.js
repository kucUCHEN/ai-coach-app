// 模擬感測器：假裝有人在運動，產生和真的感測器一模一樣格式的文字行。
// 展示用：節奏比真人快約 1.6 倍；偶爾會有「不完整的一下」，用來展示動作品質判斷。
import { SensorSource } from './SensorSource.js';
import { byId } from './exercises.js';

const SPEED = 1.6;          // 展示加速倍數
const BAD_RATE = 0.11;      // 不完整動作機率（約 8–15%）

export class MockSensor extends SensorSource {
  constructor() {
    super();
    this.kind = 'mock';
    this.name = '模擬感測器';
    this.battery = 80;
    this.timer = null;
    this.reps = 0;
    this.scoreSum = 0;      // 每一下的完整度加總
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
    const gap = ex.avgGapMs / SPEED;
    this.reps = 0; this.scoreSum = 0;
    this._report();
    const tick = () => {
      this.reps++;
      const bad = this.reps > 2 && Math.random() < BAD_RATE;
      this.scoreSum += bad ? 45 + Math.random() * 20 : 86 + Math.random() * 14;
      this._report();
      // 額外的模擬事件（介面外的提示，真感測器沒有也不影響畫面）
      if (bad) this.emit('form', { ok: false, exerciseId: ex.id, rep: this.reps });
      if (this.reps % 50 === 0 && this.battery > 5) this.battery--;
      this.timer = setTimeout(tick, gap * (0.8 + Math.random() * 0.4));
    };
    this.timer = setTimeout(tick, gap);
  }
  _report() {
    const quality = this.reps ? Math.max(0, Math.min(98, Math.round(this.scoreSum / this.reps))) : 0;
    const stars = this.reps < 3 ? 0 : 3 + (Math.random() < 0.6 ? 1 : 0) + (Math.random() < 0.2 ? 1 : 0);
    this.receiveLine(`C,${this.reps},${quality},${Math.min(stars, 5)}`);
  }
  _clear() { clearTimeout(this.timer); this.timer = null; }
}
