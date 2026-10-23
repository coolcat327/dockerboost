// Scheduling only; each job owns the existing download task and its cleanup.
export function createBatchQueue(run, changed = () => {}, concurrency = 5) {
  const waiting = [], active = new Map();
  let paused = false;
  function pump() {
    if (paused) return;
    while (active.size < concurrency && waiting.length) {
      const job = waiting.shift(), controller = new AbortController();
      active.set(job, controller); job.state = 'running'; changed(job);
      Promise.resolve().then(() => { controller.signal.throwIfAborted(); return run(job, controller.signal); }).then(() => {
        job.state = controller.signal.aborted ? 'stopped' : 'done';
      }, error => { job.state = controller.signal.aborted ? 'stopped' : 'failed'; job.error = error.message; }).finally(() => {
        active.delete(job); changed(job); pump();
      });
    }
  }
  return {
    add(job) {
      if (active.has(job) || waiting.includes(job)) return;
      job.state = 'queued'; job.error = ''; waiting.push(job); changed(job); pump();
    },
    stop(job) {
      const index = waiting.indexOf(job);
      if (index >= 0) { waiting.splice(index, 1); job.state = 'stopped'; changed(job); }
      active.get(job)?.abort();
    },
    stopAll() {
      paused = true;
      for (const job of waiting.splice(0)) { job.state = 'stopped'; changed(job); }
      for (const controller of active.values()) controller.abort();
      paused = false;
    },
    get busy() { return active.size > 0 || waiting.length > 0; }
  };
}
