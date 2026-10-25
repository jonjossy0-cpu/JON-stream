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
    targetFrameBudgetMs: 33.3
  });

  function createEnhancementSession(adapter, options) {
    const config = Object.assign({}, DEFAULTS, options || {});
    let state = 'unavailable';
    let consecutiveOverBudget = 0;
    let disposed = false;
    let inFlight = false;

    function getStatus() {
      return Object.freeze({
        state,
        modelActive: state === 'processing',
        modelName: adapter && adapter.modelName ? String(adapter.modelName) : null,
        reason: state === 'unavailable' ? 'No reviewed model adapter supplied' :
          state === 'disabled' ? 'Enhancement disabled after a processing error or frame-budget failure' :
          state === 'disposed' ? 'Session disposed' : null
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
        if (disposed) return getStatus();
        if (!result || result.ready !== true) {
          state = 'unavailable';
          return getStatus();
        }
        state = 'ready';
        return getStatus();
      } catch (_) {
        if (!disposed) state = 'unavailable';
        return getStatus();
      }
    }

    async function processFrame(frame) {
      if (disposed || !frame) {
        return { enhanced: false, frame, reason: disposed ? 'disposed' : 'not-ready' };
      }
      // Never queue or overlap frames: a busy model must not add playback latency.
      if (inFlight) {
        return { enhanced: false, frame, reason: 'busy-fallback' };
      }
      if (state !== 'ready') return { enhanced: false, frame, reason: 'not-ready' };
      inFlight = true;
      state = 'processing';
      const started = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      try {
        const result = await adapter.processFrame(frame);
        const ended = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const elapsedMs = Math.max(0, ended - started);
        if (disposed) return { enhanced: false, frame, reason: 'disposed-during-processing', elapsedMs };
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
        if (!disposed) state = 'disabled';
        return { enhanced: false, frame, reason: disposed ? 'disposed-during-processing' : 'model-error' };
      } finally {
        inFlight = false;
      }
    }

    async function dispose() {
      if (!disposed) {
        disposed = true;
        state = 'disposed';
      }
      if (adapter && typeof adapter.dispose === 'function') {
        try { await adapter.dispose(); } catch (_) { /* keep teardown best-effort */ }
      }
      return getStatus();
    }

    return Object.freeze({ initialize, processFrame, dispose, getStatus });
  }

  root.JONStreamAIPrototype = Object.freeze({ createEnhancementSession, defaults: DEFAULTS });
})(typeof window !== 'undefined' ? window : globalThis);
