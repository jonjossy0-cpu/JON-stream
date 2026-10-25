/* Node built-in tests for the isolated prototype contract. No third-party packages. */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
require('./ai-enhancement-prototype.js');

const { createEnhancementSession } = globalThis.JONStreamAIPrototype;

test('no model adapter means unavailable and never active', async () => {
  const session = createEnhancementSession(null);
  const status = await session.initialize();
  assert.equal(status.state, 'unavailable');
  assert.equal(status.modelActive, false);
  const frame = { id: 'original' };
  const result = await session.processFrame(frame);
  assert.equal(result.enhanced, false);
  assert.equal(result.frame, frame);
});

test('reviewed adapter can initialize and return a processed frame', async () => {
  const output = { id: 'processed' };
  const session = createEnhancementSession({
    modelName: 'test-adapter-not-an-AI-model',
    async initialize() { return { ready: true }; },
    async processFrame() { return { frame: output }; },
    async dispose() {}
  });
  const initialized = await session.initialize();
  assert.equal(initialized.state, 'ready');
  const result = await session.processFrame({ id: 'input' });
  assert.equal(result.enhanced, true);
  assert.equal(result.frame, output);
  assert.equal(typeof result.elapsedMs, 'number');
  await session.dispose();
  assert.equal(session.getStatus().state, 'disposed');
});

test('adapter exceptions fall back to the original frame and disable processing', async () => {
  const session = createEnhancementSession({
    async initialize() { return { ready: true }; },
    async processFrame() { throw new Error('test failure'); }
  });
  await session.initialize();
  const frame = { id: 'original' };
  const result = await session.processFrame(frame);
  assert.equal(result.enhanced, false);
  assert.equal(result.frame, frame);
  assert.equal(result.reason, 'model-error');
  assert.equal(session.getStatus().state, 'disabled');
});

test('repeated over-budget frames disable processing', async () => {
  const session = createEnhancementSession({
    async initialize() { return { ready: true }; },
    async processFrame(frame) {
      await new Promise(resolve => setTimeout(resolve, 8));
      return { frame: { id: 'processed', original: frame.id } };
    }
  }, { targetFrameBudgetMs: 1, maxConsecutiveOverBudget: 2 });
  await session.initialize();
  const first = await session.processFrame({ id: 'one' });
  assert.equal(first.enhanced, true);
  const second = await session.processFrame({ id: 'two' });
  assert.equal(second.enhanced, false);
  assert.equal(second.reason, 'frame-budget-exceeded');
  assert.equal(session.getStatus().state, 'disabled');
});

test('concurrent calls do not queue behind a busy frame', async () => {
  let finish;
  const session = createEnhancementSession({
    async initialize() { return { ready: true }; },
    async processFrame(frame) {
      await new Promise(resolve => { finish = resolve; });
      return { frame: { id: 'processed', original: frame.id } };
    }
  });
  await session.initialize();
  const pending = session.processFrame({ id: 'first' });
  await new Promise(resolve => setImmediate(resolve));
  const concurrent = await session.processFrame({ id: 'second' });
  assert.equal(concurrent.enhanced, false);
  assert.equal(concurrent.reason, 'busy-fallback');
  assert.equal(concurrent.frame.id, 'second');
  finish();
  assert.equal((await pending).enhanced, true);
});

test('dispose during inference prevents late enhanced output', async () => {
  let finish;
  const session = createEnhancementSession({
    async initialize() { return { ready: true }; },
    async processFrame(frame) {
      await new Promise(resolve => { finish = resolve; });
      return { frame: { id: 'processed', original: frame.id } };
    },
    async dispose() {}
  });
  await session.initialize();
  const pending = session.processFrame({ id: 'original' });
  await new Promise(resolve => setImmediate(resolve));
  await session.dispose();
  finish();
  const result = await pending;
  assert.equal(result.enhanced, false);
  assert.equal(result.reason, 'disposed-during-processing');
  assert.equal(result.frame.id, 'original');
  assert.equal(session.getStatus().state, 'disposed');
});

test('local image A/B page keeps the reviewed model hash and expected output shape', () => {
  const fs = require('node:fs');
  const html = fs.readFileSync(require('node:path').join(__dirname, 'ai-local-image-sr-ab-test.html'), 'utf8');
  assert.match(html, /85f36ff88cc504a24af5e0602148bc56a8aa09a58eca8c0da2756f3e8186035e/);
  assert.match(html, /out\.dims\[2\]!==672\|\|out\.dims\[3\]!==672/);
  assert.match(html, /dims\.some\(\(d,i\)=>Number\.isInteger\(d\)&&d>0&&d!==\[1,1,224,224\]\[i\]\)/);
  assert.match(html, /dims\.some\(\(d,i\)=>typeof d==='number'&&d===0\)/);
  assert.doesNotMatch(html, /typeof d==='number'&&d<=0/);
  assert.match(html, /networkStreamUsed:false/);
  assert.match(html, /playerConnected:false/);
  assert.match(html, /uploadIntended:false/);
});

test('local image A/B page does not add live-video, HLS, Firebase, or upload APIs', () => {
  const fs = require('node:fs');
  const html = fs.readFileSync(require('node:path').join(__dirname, 'ai-local-image-sr-ab-test.html'), 'utf8');
  assert.doesNotMatch(html, /<video\b|hls\.js|firebase|XMLHttpRequest|\bfetch\s*\(/i);
  assert.match(html, /Select a test image/);
  assert.match(html, /SHA-256/);
  assert.match(html, /aspect-ratio-preserving contain fit with black letterbox to 224x224/);
  assert.match(html, /Math\.min\(224\/img\.naturalWidth,224\/img\.naturalHeight\)/);
  assert.match(html, /sourceImageWidth=img\.naturalWidth/);
});
