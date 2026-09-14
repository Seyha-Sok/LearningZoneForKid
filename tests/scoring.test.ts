import test from 'node:test';
import assert from 'node:assert/strict';
import { alphabet, getGuide } from '../src/letters.ts';
import { scoreTrace, sample } from '../src/scoring.ts';

test('all 52 complete guides pass, including gently imperfect tracing', () => {
  for (const letter of alphabet) for (const lower of [false, true]) {
    const guide = getGuide(letter, lower);
    assert.equal(scoreTrace(guide, guide).passed, true, `${letter} ${lower}`);
    const gentle = guide.map(s => sample(s).map((p, i) => ({ x: p.x + Math.sin(i) * 5, y: p.y + Math.cos(i) * 5 })));
    assert.equal(scoreTrace(gentle, guide).passed, true, `gentle ${letter} ${lower}`);
  }
});
test('an empty page, dot, or short mark cannot pass any letter', () => {
  for (const letter of alphabet) for (const lower of [false, true]) {
    const guide = getGuide(letter, lower), p = guide[0][0];
    for (const ink of [[], [[p]], [[p, { x: p.x + 8, y: p.y + 5 }]]]) assert.equal(scoreTrace(ink, guide).passed, false);
  }
});
test('coverage includes every component, including the dots on i and j', () => {
  for (const [letter, lower] of [['A', false], ['H', false], ['R', false], ['i', true], ['j', true]] as const) {
    const guide = getGuide(letter.toUpperCase(), lower);
    assert.equal(scoreTrace(guide.slice(0, -1), guide).passed, false, letter);
  }
});
test('partial coverage and shifted letters fail', () => {
  const guide = getGuide('O');
  assert.equal(scoreTrace([guide[0].slice(0, 30)], guide).passed, false);
  assert.equal(scoreTrace(guide.map(s => s.map(p => ({ x: p.x + 70, y: p.y }))), guide).passed, false);
});
test('scribbling over the page or repeatedly along the guide cannot earn a pass', () => {
  const guide = getGuide('A');
  const scribble = Array.from({ length: 90 }, (_, i) => ({ x: i % 2 ? 630 : 10, y: (i * 71) % 420 }));
  assert.equal(scoreTrace([scribble], guide).passed, false);
  assert.equal(scoreTrace([...guide, ...guide, ...guide, ...guide], guide).passed, false);
  assert.equal(scoreTrace([...guide, scribble], guide).passed, false);
});
test('dense duplicate pointer events do not turn an inaccurate trace into a pass', () => {
  const guide = getGuide('L');
  const ink = [...Array.from({ length: 1000 }, () => guide[0][0]), { x: 600, y: 10 }, ...guide[0]];
  assert.equal(scoreTrace([ink], guide).passed, false);
});
