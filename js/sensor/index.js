// 選擇要用哪一種感測器來源。第二階段在這裡加上 BleSensor、ReplaySensor。
import { MockSensor } from './MockSensor.js';
export { EXERCISES, byId } from './exercises.js';

let current = null;
export function getSensor() {
  if (!current) current = new MockSensor();
  return current;
}
