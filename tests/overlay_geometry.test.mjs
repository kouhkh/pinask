import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../overlay/pinask.js', import.meta.url), 'utf8');
const context = {
  window: {},
  document: {},
  console,
  Object,
};
vm.runInNewContext(source, context);

const select = context.window.PinAsk.geometry.frameSelectsRect;
const frame = { left: 100, top: 100, right: 200, bottom: 200 };

assert.equal(select(frame, { left: 120, top: 120, right: 180, bottom: 180 }), true, '完整落入框内的元素应命中');
assert.equal(select(frame, { left: 80, top: 120, right: 120, bottom: 180 }), true, '左边界穿过框的元素应命中');
assert.equal(select(frame, { left: 180, top: 180, right: 230, bottom: 230 }), true, '角部边界相交的元素应命中');
assert.equal(select(frame, { left: 200, top: 130, right: 240, bottom: 170 }), true, '边界刚好接触的元素应命中');
assert.equal(select(frame, { left: 220, top: 120, right: 260, bottom: 180 }), false, '完全不相交的元素不应命中');
assert.equal(select(frame, { left: 20, top: 20, right: 280, bottom: 280 }), false, '只从外部包住框的大容器不应命中');
assert.equal(select(frame, { left: 100, top: 20, right: 280, bottom: 280 }), true, '包住框但边界与框接触的元素应命中');
assert.equal(select(frame, { left: 130, top: 80, right: 170, bottom: 120 }), true, '上边相交');
assert.equal(select(frame, { left: 180, top: 130, right: 220, bottom: 170 }), true, '右边相交');
assert.equal(select(frame, { left: 130, top: 180, right: 170, bottom: 220 }), true, '下边相交');
assert.doesNotMatch(source, /const leaves = rows\.filter/, '命中元素不应再被叶子节点裁剪');

console.log('pinask overlay geometry: ok');
