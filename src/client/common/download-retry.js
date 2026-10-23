const delays = [1000, 2000, 4000];

function waitForRetry(delay, signal) {
  signal.throwIfAborted();
  let abort;
  return new Promise((resolve, reject) => {
    abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(resolve, delay);
    signal.addEventListener('abort', abort, { once: true });
  }).finally(() => signal.removeEventListener('abort', abort));
}

// An attempt must settle its Worker / OPFS cleanup before this schedules another one.
export async function retryDownload(run, { signal, onRetry, wait = waitForRetry }) {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    try { return await run(attempt); }
    catch (error) {
      signal.throwIfAborted();
      if (attempt === delays.length) throw error;
      const delay = delays[attempt];
      onRetry?.(error, { attempt: attempt + 1, delay });
      await wait(delay, signal);
    }
  }
}
