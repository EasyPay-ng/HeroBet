// Public, read-only shared-round API. Requests are same-origin so local Vite
// and production reverse proxies can route /api without browser localhost URLs.
async function getJson(path, timeoutMs = 2_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(path, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Game API returned ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchSharedGameState() {
  const data = await getJson('/api/game/state');
  if (!data || !Number.isFinite(data.serverTime) || !data.round || !['waiting', 'flying', 'crashed', 'finished'].includes(data.round.phase)) {
    throw new Error('Game API returned invalid round state');
  }
  return data;
}

export async function fetchSharedRoundHistory(limit = 8) {
  const data = await getJson(`/api/game/rounds?limit=${encodeURIComponent(limit)}`);
  if (!Array.isArray(data?.rounds)) throw new Error('Game API returned invalid round history');
  return data.rounds;
}
