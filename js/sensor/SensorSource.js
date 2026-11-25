// 感測器連線的「共同介面」。模擬、藍牙、錄好的示範資料都繼承這個類別，
// 畫面只認得這個介面，所以換來源時不用改畫面。

export function parseLine(line) {
  const p = String(line).trim().split(',');
  if (p[0] === 'C' && p.length >= 4) {
    return { type: 'count', reps: +p[1], quality: +p[2], stars: +p[3] };
  }
  if (p[0] === 'B' && p.length >= 2) {
    return { type: 'battery', pct: +p[1] };
  }
  return null; // 看不懂的行直接忽略
}

export class SensorSource {
  constructor() {
    this.handlers = {};
    this.connected = false;
    this.name = '';
    this.kind = 'base'; // 'mock' | 'ble' | 'replay'
  }
  on(evt, fn) { (this.handlers[evt] ||= new Set()).add(fn); return () => this.off(evt, fn); }
  off(evt, fn) { this.handlers[evt]?.delete(fn); }
  emit(evt, data) { this.handlers[evt]?.forEach((fn) => fn(data)); }

  // 子類別收到感測器傳來的一行文字時呼叫
  receiveLine(line) {
    const msg = parseLine(line);
    if (!msg) return;
    const { type, ...data } = msg;
    this.emit(type, data);
  }
  setStatus(connected) {
    this.connected = connected;
    this.emit('status', { connected, name: this.name, kind: this.kind });
  }

  // 子類別實作：把一行指令送到感測器（"S,0"、"P"、"B"）
  async send(_cmd) { throw new Error('not implemented'); }
  async connect() { throw new Error('not implemented'); }
  async disconnect() { this.setStatus(false); }

  start(exerciseId) { return this.send(`S,${exerciseId}`); }
  stop() { return this.send('P'); }
  queryBattery() { return this.send('B'); }
}
