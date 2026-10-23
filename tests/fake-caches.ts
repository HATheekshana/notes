// A small in-memory stand-in for the browser's CacheStorage, faithful to the parts the app relies on:
// responses are copied on put (bodies are single-use), match can ignore the query string, keys() keeps insertion order.
type Stored = { status: number; statusText: string; headers: [string, string][]; body: Uint8Array };
type Req = string | URL | { url: string };
const BASE = 'https://app.test';
const keyOf = (r: Req) => typeof r === 'string' ? new URL(r, BASE).href : r instanceof URL ? r.href : r.url;
const rebuild = (s: Stored) => new Response(s.body.length ? (s.body.buffer.slice(s.body.byteOffset, s.body.byteOffset + s.body.byteLength) as ArrayBuffer) : null, { status: s.status, statusText: s.statusText, headers: s.headers });

export class FakeCache {
  network: (url: string) => Promise<Response>;
  constructor(network?: (url: string) => Promise<Response>) { this.network = network || (url => fetch(url)); }
  entries = new Map<string, Stored>();
  async match(request: Req, options?: { ignoreSearch?: boolean }) {
    const key = keyOf(request);
    let hit = this.entries.get(key);
    if (!hit && options?.ignoreSearch) {
      const wanted = new URL(key); wanted.search = '';
      for (const [k, v] of this.entries) { const u = new URL(k); u.search = ''; if (u.href === wanted.href) { hit = v; break; } }
    }
    return hit ? rebuild(hit) : undefined;
  }
  async put(request: Req, response: Response) {
    this.entries.set(keyOf(request), { status: response.status, statusText: response.statusText, headers: [...response.headers.entries()], body: new Uint8Array(await response.arrayBuffer()) });
  }
  async add(request: Req) { const response = await this.network(keyOf(request)); if (!response.ok) throw new TypeError('add failed'); await this.put(request, response); }
  async delete(request: Req) { return this.entries.delete(keyOf(request)); }
  async keys() { return [...this.entries.keys()].map(url => ({ url })); }
}

export class FakeCacheStorage {
  network?: (url: string) => Promise<Response>;
  constructor(network?: (url: string) => Promise<Response>) { this.network = network; }
  stores = new Map<string, FakeCache>();
  async open(name: string) { if (!this.stores.has(name)) this.stores.set(name, new FakeCache(this.network)); return this.stores.get(name)!; }
  async keys() { return [...this.stores.keys()]; }
  async delete(name: string) { return this.stores.delete(name); }
  async has(name: string) { return this.stores.has(name); }
  async match(request: Req, options?: { cacheName?: string; ignoreSearch?: boolean }) {
    const caches = options?.cacheName ? [this.stores.get(options.cacheName)].filter(Boolean) as FakeCache[] : [...this.stores.values()];
    for (const cache of caches) { const hit = await cache.match(request, options); if (hit) return hit; }
    return undefined;
  }
}
export const APP = BASE;
