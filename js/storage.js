// 저장: 설정, 자동 저장, 세이브 슬롯, 직접 만든 세계관, 파일 내보내기/불러오기.
// 모든 데이터는 이 브라우저의 localStorage에만 저장된다.

const K = { settings: 'rp.settings', auto: 'rp.autosave', slots: 'rp.slots', worlds: 'rp.worlds' };
export const SLOT_COUNT = 5; // 임시값

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export const DEFAULT_SETTINGS = { apiKey: '', model: 'auto', responseLength: 'normal', adultMode: false };
export const loadSettings = () => ({ ...DEFAULT_SETTINGS, ...read(K.settings, {}) });
export const saveSettings = (s) => write(K.settings, s);

export const autosave = (g) => write(K.auto, g);
export const loadAutosave = () => read(K.auto, null);

export const listSlots = () => {
  const s = read(K.slots, []);
  return Array.from({ length: SLOT_COUNT }, (_, i) => s[i] ?? null);
};
export function saveSlot(i, g) {
  const s = listSlots();
  s[i] = { savedAt: Date.now(), game: g };
  return write(K.slots, s);
}

export const listWorlds = () => read(K.worlds, []);
export function saveWorld(w) {
  const all = listWorlds().filter((x) => x.id !== w.id);
  all.push(w);
  return write(K.worlds, all);
}
export const deleteWorld = (id) => write(K.worlds, listWorlds().filter((x) => x.id !== id));

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function readJsonFile(file) {
  return file.text().then((t) => JSON.parse(t));
}
