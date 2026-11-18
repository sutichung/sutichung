'use strict';

// Per-process async cache: fresh hits are immediate, concurrent misses share one
// upstream request, and a failed refresh can return explicitly marked stale data.
function createAsyncCache({maxEntries=500}={}) {
  const values = new Map();
  const pending = new Map();
  async function get(key, ttlMs, loader) {
    const now = Date.now();
    const hit = values.get(key);
    if (hit && now - hit.at < ttlMs) return hit.value;
    if (pending.has(key)) return pending.get(key);
    const task = (async () => {
      try {
        const value = await loader();
        values.delete(key);
        values.set(key, {at:Date.now(), value});
        while (values.size > maxEntries) values.delete(values.keys().next().value);
        return value;
      } catch (error) {
        if (hit && hit.value && typeof hit.value === 'object') {
          return {...hit.value, stale:true, warning:'上游更新失敗，暫時提供舊快取；請勿視為即時行情', refreshError:String(error?.message||error).slice(0,180)};
        }
        throw error;
      } finally {
        pending.delete(key);
      }
    })();
    pending.set(key, task);
    return task;
  }
  return {
    get,
    clear() { values.clear(); pending.clear(); },
    get size() { return values.size; },
    get pendingCount() { return pending.size; }
  };
}
module.exports = {createAsyncCache};
