/** Ping backend so Render free tier stays warm during an event. */
export function wakeBackend(): void {
  const apiBase = import.meta.env.VITE_API_URL as string | undefined;
  if (!apiBase) return;
  const health = apiBase.replace(/\/api\/?$/, '') + '/api/health';
  fetch(health, { method: 'GET', mode: 'cors', cache: 'no-store' }).catch(() => {});
}

/** Call every ~8 minutes while a live page is open. */
export function startKeepAliveInterval(ms = 8 * 60 * 1000): () => void {
  wakeBackend();
  const id = window.setInterval(wakeBackend, ms);
  return () => window.clearInterval(id);
}
