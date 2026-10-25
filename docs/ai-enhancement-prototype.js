/*
 * JON Stream AI enhancement prototype contract.
 * Experiment branch only. This module does NOT include an AI model and does not
 * alter or connect to the production player. It is intentionally inert until a
 * reviewed adapter is supplied by a future test harness.
 */
(function (root) {
  'use strict';

  const DEFAULTS = Object.freeze({
    maxConsecutiveOverBudget: 3,
    maxFrameQueue: 1,
    targetFrameBudgetMs: 33.3
  });

  function createEnhancementSession(adapter, options) {
    const config = Object.assign({}, DEFAULTS, options || {});
    let state = 'unavailable';
    let consecutiveOverBudget = 0;
    let disposed = false;

    function getStatus() {
      return Object.freeze({
        state,
        modelActive: state === 'processing',
        modelName: adapter && adapter.modelName ? String(adapter.modelName) : null,
        reason: state === 'unavailable' ? 'No reviewed model adapter supplied' : null
      });
    }

    async function initialize(context) {
      if (disposed) return getStatus();
      if (!adapter || typeof adapter.initialize !== 'function' || typeof adapter.processFrame !== 'function') {
        state = 'unavailable';
        return getStatus();
      }
      try {
        const result = await adapter.initialize(context || {});
        if (!result || result.ready !== true) {
          state = 'unavailable';
          return getStatus();
        }
        state = 'ready';
        return getStatus();
      } catch (_) {
        state = 'unavailable';
        return getStatus();
      }
    }

    async function processFrame(frame) {
      if (disposed || state !== 'ready' || !frame) {
        return { enhanced: false, frame, reason: 'not-ready' };
      }
      // Single-frame call only: callers must not enqueue frames behind playback.
      state = 'processing';
      const started = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      try {
        const result = await adapter.processFrame(frame);
        const ended = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const elapsedMs = Math.max(0, ended - started);
        if (elapsedMs > config.targetFrameBudgetMs) consecutiveOverBudget++;
        else consecutiveOverBudget = 0;
        if (consecutiveOverBudget >= config.maxConsecutiveOverBudget) {
          state = 'disabled';
          return { enhanced: false, frame, reason: 'frame-budget-exceeded', elapsedMs };
        }
        if (!result || !result.frame) {
          state = 'ready';
          return { enhanced: false, frame, reason: 'invalid-model-output', elapsedMs };
        }
        state = 'ready';
        return { enhanced: true, frame: result.frame, elapsedMs };
      } catch (_) {
        state = 'disabled';
        return { enhanced: false, frame, reason: 'model-error' };
      }
    }

    async function dispose() {
      disposed = true;
      state = 'disposed';
      if (adapter && typeof adapter.dispose === 'function') {
        try { await adapter.dispose(); } catch (_) { /* keep teardown best-effort */ }
      }
      return getStatus();
    }

    return Object.freeze({ initialize, processFrame, dispose, getStatus });
  }

  root.JONStreamAIPrototype = Object.freeze({ createEnhancementSession, defaults: DEFAULTS });
})(typeof window !== 'undefined' ? window : globalThis);
