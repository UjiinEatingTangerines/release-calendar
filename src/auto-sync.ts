/** One server-owned loop: UI reads cache; provider requests never overlap timer ticks. */
export function startAutoSync(sync: () => Promise<void>, intervalMs = 5 * 60 * 1000, onError: () => void = () => process.stderr.write('AUTO_SYNC_FAILED\n')) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = async () => {
    try { await sync(); }
    catch (error) { if (!(error instanceof Error)) throw error; onError(); }
    finally { if (!stopped) { timer = setTimeout(() => { void run(); }, intervalMs); timer.unref(); } }
  };
  void run();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}
