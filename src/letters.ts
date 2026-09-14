export type Point = { x: number; y: number };
export type Stroke = Point[];
const line = (...v: number[]): Stroke => Array.from({ length: v.length / 2 }, (_, i) => ({ x: v[i * 2], y: v[i * 2 + 1] }));
const arc = (x: number, y: number, rx: number, ry: number, start = 0, end = Math.PI * 2): Stroke =>
  Array.from({ length: 65 }, (_, i) => ({ x: x + rx * Math.cos(start + (end - start) * i / 64), y: y + ry * Math.sin(start + (end - start) * i / 64) }));
const curve = (...v: number[]): Stroke => Array.from({ length: 49 }, (_, i) => {
  const t = i / 48, u = 1 - t;
  return { x: u ** 3 * v[0] + 3 * u ** 2 * t * v[2] + 3 * u * t ** 2 * v[4] + t ** 3 * v[6], y: u ** 3 * v[1] + 3 * u ** 2 * t * v[3] + 3 * u * t ** 2 * v[5] + t ** 3 * v[7] };
});
const join = (...s: Stroke[]): Stroke => s.flat();
const pi = Math.PI;
const upper: Record<string, Stroke[]> = {
  A: [line(60, 300, 150, 70, 240, 300), line(96, 210, 204, 210)],
  B: [line(75, 300, 75, 70), join(line(75, 70, 145, 70), arc(145, 127.5, 85, 57.5, -pi / 2, pi / 2), line(145, 185, 75, 185)), join(line(75, 185, 150, 185), arc(150, 242.5, 85, 57.5, -pi / 2, pi / 2), line(150, 300, 75, 300))],
  C: [arc(155, 185, 100, 115, -pi / 4, -7 * pi / 4)],
  D: [line(70, 300, 70, 70), join(line(70, 70, 125, 70), arc(125, 185, 115, 115, -pi / 2, pi / 2), line(125, 300, 70, 300))],
  E: [line(230, 70, 75, 70, 75, 300, 230, 300), line(75, 182, 205, 182)],
  F: [line(230, 70, 75, 70, 75, 300), line(75, 182, 205, 182)],
  G: [join(arc(155, 185, 100, 115, -pi / 4, -2 * pi), line(255, 185, 165, 185))],
  H: [line(65, 70, 65, 300), line(235, 70, 235, 300), line(65, 185, 235, 185)],
  I: [line(80, 70, 220, 70), line(150, 70, 150, 300), line(80, 300, 220, 300)],
  J: [line(110, 70, 235, 70), join(line(210, 70, 210, 235), arc(140, 235, 70, 65, 0, pi))],
  K: [line(75, 70, 75, 300), line(235, 70, 75, 200, 235, 300)],
  L: [line(80, 70, 80, 300, 230, 300)],
  M: [line(50, 300, 50, 70, 150, 210, 250, 70, 250, 300)],
  N: [line(65, 300, 65, 70, 235, 300, 235, 70)],
  O: [arc(150, 185, 100, 115, -pi / 2, 3 * pi / 2)],
  P: [line(75, 300, 75, 70), join(line(75, 70, 145, 70), arc(145, 135, 90, 65, -pi / 2, pi / 2), line(145, 200, 75, 200))],
  Q: [arc(150, 180, 100, 110, -pi / 2, 3 * pi / 2), line(170, 245, 245, 315)],
  R: [line(75, 300, 75, 70), join(line(75, 70, 145, 70), arc(145, 135, 90, 65, -pi / 2, pi / 2), line(145, 200, 75, 200)), line(145, 200, 240, 300)],
  S: [join(curve(235, 95, 80, 0, 5, 155, 150, 185), curve(150, 185, 310, 218, 220, 365, 60, 275))],
  T: [line(50, 70, 250, 70), line(150, 70, 150, 300)],
  U: [join(line(60, 70, 60, 210), arc(150, 210, 90, 90, pi, 0), line(240, 210, 240, 70))],
  V: [line(50, 70, 150, 300, 250, 70)],
  W: [line(35, 70, 85, 300, 150, 150, 215, 300, 265, 70)],
  X: [line(60, 70, 240, 300), line(240, 70, 60, 300)],
  Y: [line(50, 70, 150, 185, 250, 70), line(150, 185, 150, 300)],
  Z: [line(60, 70, 240, 70, 60, 300, 240, 300)]
};
const bowl = () => arc(140, 225, 70, 75, 0, -2 * pi);
const lower: Record<string, Stroke[]> = {
  a: [bowl(), line(210, 150, 210, 300)],
  b: [line(80, 70, 80, 300), arc(150, 225, 70, 75, pi, -pi)],
  c: [arc(155, 225, 75, 75, -pi / 4, -7 * pi / 4)],
  d: [bowl(), line(210, 70, 210, 300)],
  e: [join(line(75, 222, 225, 222), arc(150, 222, 75, 75, 0, -1.75 * pi))],
  f: [join(curve(210, 85, 150, 35, 120, 85, 120, 140), line(120, 140, 120, 300)), line(65, 155, 205, 155)],
  g: [bowl(), join(line(210, 150, 210, 315), curve(210, 315, 210, 370, 125, 380, 85, 335))],
  h: [line(80, 70, 80, 300), join(arc(150, 220, 70, 70, pi, 2 * pi), line(220, 220, 220, 300))],
  i: [line(150, 155, 150, 300), line(150, 104, 150, 110)],
  j: [join(line(180, 155, 180, 315), curve(180, 315, 180, 365, 110, 365, 90, 335)), line(180, 104, 180, 110)],
  k: [line(85, 70, 85, 300), line(220, 150, 85, 235, 225, 300)],
  l: [line(150, 70, 150, 300)],
  m: [line(50, 150, 50, 300), join(arc(100, 205, 50, 55, pi, 2 * pi), line(150, 205, 150, 300)), join(arc(200, 205, 50, 55, pi, 2 * pi), line(250, 205, 250, 300))],
  n: [line(80, 150, 80, 300), join(arc(150, 220, 70, 70, pi, 2 * pi), line(220, 220, 220, 300))],
  o: [arc(150, 225, 75, 75, -pi / 2, 3 * pi / 2)],
  p: [line(80, 150, 80, 365), arc(150, 225, 70, 75, pi, -pi)],
  q: [bowl(), line(210, 150, 210, 365)],
  r: [line(100, 150, 100, 300), curve(100, 215, 100, 155, 150, 135, 205, 160)],
  s: [join(curve(215, 165, 95, 105, 40, 215, 150, 225), curve(150, 225, 265, 235, 210, 345, 80, 280))],
  t: [join(line(140, 95, 140, 255), curve(140, 255, 140, 305, 180, 310, 210, 285)), line(75, 160, 210, 160)],
  u: [join(line(80, 150, 80, 230), arc(150, 230, 70, 70, pi, 0), line(220, 230, 220, 150)), line(220, 230, 220, 300)],
  v: [line(65, 150, 150, 300, 235, 150)],
  w: [line(35, 150, 85, 300, 150, 195, 215, 300, 265, 150)],
  x: [line(80, 150, 220, 300), line(220, 150, 80, 300)],
  y: [line(65, 150, 150, 290), line(235, 150, 115, 365)],
  z: [line(75, 150, 225, 150, 75, 300, 225, 300)]
};
export const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
export const words = ['apple', 'butterfly', 'cat', 'dinosaur', 'elephant', 'flower', 'giraffe', 'house', 'ice cream', 'jellyfish', 'kite', 'lion', 'moon', 'nest', 'octopus', 'penguin', 'queen', 'rainbow', 'sun', 'turtle', 'umbrella', 'violin', 'whale', 'xylophone', 'yo-yo', 'zebra'];
export const pictures = ['🍎', '🦋', '🐱', '🦕', '🐘', '🌼', '🦒', '🏡', '🍦', '🪼', '🪁', '🦁', '🌙', '🪺', '🐙', '🐧', '👑', '🌈', '☀️', '🐢', '☂️', '🎻', '🐳', '🎵', '🪀', '🦓'];
export function getGuide(letter: string, lowercase = false): Stroke[] {
  return (lowercase ? lower[letter.toLowerCase()] : upper[letter]).map(s => s.map(p => ({ x: p.x + 170, y: p.y + 20 })));
}
