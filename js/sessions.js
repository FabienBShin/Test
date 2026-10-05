// 채팅방(세션) 저장소. 같은 작품으로 채팅방을 여러 개 만들 수 있고, 각 채팅방은 독립된 게임 기록이다.
//
// 저장 위치는 IndexedDB(용량이 넉넉함)를 먼저 쓰고, 쓸 수 없으면 localStorage로 대신한다.
// 한 게임이 1~2MB까지 커질 수 있어서, 예전처럼 localStorage 하나에 모두 넣으면 금방 가득 찬다.
// 드라이버를 바꿔 끼울 수 있게 만들어서 노드에서도 테스트한다.

import { parseBlocks } from './render.js';

export const SLOT_COUNT = 5;
export const LEGACY_ID = 'legacy-autosave'; // 예전 자동 저장 하나를 채팅방으로 옮길 때 쓰는 고정 id

const clone = (o) => structuredClone(o);

export const newId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
export const defaultTitle = (world) => String(world?.name ?? '새 채팅');

// 목록에 보일 한 줄 미리보기: 마지막 AI 응답의 지문이나 대사, 없으면 마지막 플레이어 입력
export function previewOf(game, max = 80) {
  const log = Array.isArray(game?.log) ? game.log : [];
  for (let i = log.length - 1; i >= 0; i--) {
    const m = log[i];
    let text = '';
    if (m.role === 'player') text = String(m.text ?? '');
    else if (m.role === 'gm') {
      const blocks = parseBlocks(m.text).filter((b) => b.type === 'narration' || b.type === 'dialogue');
      text = blocks.length ? blocks[blocks.length - 1].text.replace(/\*+/g, '') : '';
    }
    text = text.replace(/\s+/g, ' ').trim();
    if (text) return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  }
  return '';
}

export function metaOf(game) {
  return {
    id: game.id,
    title: game.title,
    worldId: game.world?.id ?? '',
    worldName: game.world?.name ?? '',
    emoji: game.world?.emoji ?? '🌍',
    playerName: game.player?.name ?? '',
    day: game.time?.day ?? 1,
    updatedAt: game.updatedAt,
    createdAt: game.createdAt,
    preview: previewOf(game),
  };
}

// 상대 시간: 방금 / N분 전 / N시간 전 / N일 전 / 날짜
export function timeAgo(ts, now = Date.now()) {
  const t = Number(ts);
  if (ts == null || !Number.isFinite(t) || t <= 0) return '방금'; // 시각이 없는 항목
  const sec = Math.floor((now - t) / 1000);
  if (!Number.isFinite(sec) || sec < 60) return '방금';
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)}일 전`;
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

const byRecent = (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0);

// ---------- 드라이버 ----------
// 드라이버가 해야 할 일: getAllMeta, getSession, putSession(record, meta), deleteSession, getSlot, putSlot

export function memoryDriver() {
  const sessions = new Map(); const meta = new Map(); const slots = new Map();
  return {
    kind: 'memory',
    async getAllMeta() { return [...meta.values()].map(clone); },
    async getSession(id) { return sessions.has(id) ? clone(sessions.get(id)) : null; },
    async putSession(rec, m) { sessions.set(rec.id, clone(rec)); meta.set(rec.id, clone(m)); },
    async deleteSession(id) { sessions.delete(id); meta.delete(id); },
    async getSlot(i) { return slots.has(i) ? clone(slots.get(i)) : null; },
    async putSlot(i, entry) { slots.set(i, clone(entry)); },
  };
}

// localStorage 드라이버: 쓸 수 없는 환경이면 호출하는 쪽에서 memoryDriver로 대신한다.
export function localDriver(ls) {
  const read = (key, fallback) => { try { return JSON.parse(ls.getItem(key)) ?? fallback; } catch { return fallback; } };
  const write = (key, value) => ls.setItem(key, JSON.stringify(value)); // 용량 초과면 그대로 던진다
  return {
    kind: 'local',
    async getAllMeta() { return read('rp.meta', []); },
    async getSession(id) { return read(`rp.s.${id}`, null); },
    async putSession(rec, m) {
      write(`rp.s.${rec.id}`, rec);
      write('rp.meta', [m, ...read('rp.meta', []).filter((x) => x.id !== m.id)]);
    },
    async deleteSession(id) {
      ls.removeItem(`rp.s.${id}`);
      write('rp.meta', read('rp.meta', []).filter((x) => x.id !== id));
    },
    async getSlot(i) { return read('rp.slots', [])[i] ?? null; },
    async putSlot(i, entry) {
      const all = read('rp.slots', []);
      while (all.length < SLOT_COUNT) all.push(null);
      all[i] = entry;
      write('rp.slots', all);
    },
  };
}

// IndexedDB 드라이버
export function idbDriver(factory, name = 'rp-db') {
  let opening;
  const open = () => (opening ??= new Promise((resolve, reject) => {
    const req = factory.open(name, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('sessions', { keyPath: 'id' });
      db.createObjectStore('meta', { keyPath: 'id' });
      db.createObjectStore('slots', { keyPath: 'slot' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB를 열지 못했습니다.'));
    req.onblocked = () => reject(new Error('IndexedDB가 다른 탭에서 막혀 있습니다.'));
  }));
  // fn은 트랜잭션 안에서 요청(IDBRequest)을 한꺼번에 만들어 돌려준다. 끝난 뒤에 결과를 읽는다.
  const exec = async (stores, mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(stores, mode);
      const out = fn(t);
      t.oncomplete = () => resolve(out?.result);
      t.onabort = () => reject(t.error ?? new Error('IndexedDB 저장이 취소되었습니다.'));
      t.onerror = () => reject(t.error ?? new Error('IndexedDB 오류'));
    });
  };
  return {
    kind: 'idb',
    getAllMeta: () => exec(['meta'], 'readonly', (t) => t.objectStore('meta').getAll()),
    async getSession(id) { return (await exec(['sessions'], 'readonly', (t) => t.objectStore('sessions').get(id))) ?? null; },
    putSession: (rec, m) => exec(['sessions', 'meta'], 'readwrite', (t) => { t.objectStore('sessions').put(rec); t.objectStore('meta').put(m); }),
    deleteSession: (id) => exec(['sessions', 'meta'], 'readwrite', (t) => { t.objectStore('sessions').delete(id); t.objectStore('meta').delete(id); }),
    async getSlot(i) {
      const r = await exec(['slots'], 'readonly', (t) => t.objectStore('slots').get(i));
      return r ? { savedAt: r.savedAt, game: r.game } : null;
    },
    putSlot: (i, entry) => exec(['slots'], 'readwrite', (t) => { t.objectStore('slots').put({ slot: i, ...entry }); }),
  };
}

// ---------- 저장소 ----------

export function createStore(driver) {
  let cache = [];
  const store = {
    kind: driver.kind,
    async init() { cache = (await driver.getAllMeta()).filter((m) => m?.id).sort(byRecent); },
    metas: () => cache,
    // 작품(worldId)별 채팅방 수
    countByWorld() {
      const out = {};
      for (const m of cache) out[m.worldId] = (out[m.worldId] ?? 0) + 1;
      return out;
    },
    async load(id) { return driver.getSession(id); },
    // 저장 시점의 모습을 바로 복사해 두므로, 쓰는 동안 게임이 바뀌어도 일관된 기록이 저장된다.
    async save(game) {
      game.id ??= newId();
      game.title ??= defaultTitle(game.world);
      game.createdAt ??= Date.now();
      game.updatedAt = Date.now();
      const rec = clone(game);
      const meta = metaOf(rec);
      await driver.putSession(rec, meta);
      cache = [meta, ...cache.filter((m) => m.id !== meta.id)].sort(byRecent);
      return meta;
    },
    async remove(id) {
      await driver.deleteSession(id);
      cache = cache.filter((m) => m.id !== id);
    },
    async rename(id, title) {
      const g = await driver.getSession(id);
      if (!g) return null;
      g.title = String(title).trim().slice(0, 60) || defaultTitle(g.world);
      return store.save(g);
    },
    async listSlots() {
      const out = [];
      for (let i = 0; i < SLOT_COUNT; i++) out.push(await driver.getSlot(i));
      return out;
    },
    async saveSlot(i, game) { await driver.putSlot(i, { savedAt: Date.now(), game: clone(game) }); },
  };
  return store;
}

// 예전 버전의 자동 저장 하나와 슬롯을 새 저장소로 옮긴다. 옮기기에 성공한 뒤에만 예전 항목을 지운다.
export async function migrateLegacy(store, driver, ls) {
  if (!ls) return;
  try {
    const raw = ls.getItem('rp.autosave');
    if (raw) {
      const g = JSON.parse(raw);
      if (g?.world && g?.player) {
        g.id = LEGACY_ID;
        await store.save(g);
        ls.removeItem('rp.autosave');
      }
    }
  } catch { /* 깨진 예전 자동 저장은 그대로 두고 넘어간다 */ }
  if (driver.kind === 'local') return; // 같은 위치를 쓰므로 옮길 필요 없음
  try {
    const raw = ls.getItem('rp.slots');
    if (raw) {
      const slots = JSON.parse(raw);
      if (Array.isArray(slots)) {
        for (let i = 0; i < slots.length && i < SLOT_COUNT; i++) if (slots[i]?.game) await driver.putSlot(i, slots[i]);
        ls.removeItem('rp.slots');
      }
    }
  } catch { /* 위와 같음 */ }
}

// 브라우저에서 저장소를 연다. IndexedDB가 안 되면 localStorage, 그것도 안 되면 이번 방문 동안만 기억한다.
export async function openStore({ idb = globalThis.indexedDB, ls = safeLocalStorage(), timeoutMs = 4000 } = {}) {
  let driver = null;
  if (idb) {
    try {
      const d = idbDriver(idb);
      // 열 수 있는지 시험. 응답이 없으면(일부 환경에서 열기가 멈춘다) 기다리지 않고 대신할 저장소로 넘어간다.
      await Promise.race([d.getAllMeta(), new Promise((_, rej) => setTimeout(() => rej(new Error('IndexedDB 응답 없음')), timeoutMs))]);
      driver = d;
    } catch { driver = null; }
  }
  driver ??= ls ? localDriver(ls) : memoryDriver();
  const store = createStore(driver);
  await migrateLegacy(store, driver, ls);
  await store.init();
  return store;
}

function safeLocalStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}
