// 저장: 설정, 화면 표시, 직접 만든 세계관, 파일 내보내기/불러오기. 모두 이 브라우저의 localStorage에 저장된다.
// 채팅방(게임 기록)과 세이브 슬롯은 용량이 커서 sessions.js가 IndexedDB에 따로 저장한다.

import { normalizeDisplay } from './render.js';

const K = { settings: 'rp.settings', display: 'rp.display', worlds: 'rp.worlds' };

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export const DEFAULT_SETTINGS = { apiKey: '', model: 'auto', responseLength: 'normal', adultMode: false, stream: true };
export const loadSettings = () => ({ ...DEFAULT_SETTINGS, ...read(K.settings, {}) });
export const saveSettings = (s) => write(K.settings, s);

// 화면 표시(보기 방식, 글자 크기, 줄 간격). 깨진 값은 기본값으로 되돌린다.
export const loadDisplay = () => normalizeDisplay(read(K.display, null));
export const saveDisplay = (d) => write(K.display, normalizeDisplay(d));

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
