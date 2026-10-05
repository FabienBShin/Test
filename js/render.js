// AI 응답 렌더러: 마크다운 일부를 지문·대사·상태창·장면 헤더로 나눠 보여준다.
// 문자열을 HTML로 바꾸지 않고 DOM 요소를 직접 만들기 때문에 응답에 HTML이나 스크립트가 있어도 글자로만 보인다.
//
// 인식하는 형식 (AI가 흔히 쓰는 형식):
//   > 🏝️ 장소: …            → 장면 헤더(인용 블록)
//   *지문* / 일반 문단        → 지문
//   **이름**: "대사"          → 대사 (이름 뒤 콜론이 ** 안쪽이어도 됨. 💭 로 시작하면 속마음)
//   ```INFO … ```             → 상태창 패널
//   {{asset:KEY}}             → 이미지 참조. 이 앱에는 이미지가 없으므로 지운다

// ---------- 표시 설정 ----------

// 5단계 값. 3단계가 기본이며 현재 화면의 기본 크기와 같다.
export const FONT_REM = [0.8125, 0.9, 1, 1.125, 1.25];
export const LINE_HEIGHT = [1.3, 1.4, 1.5, 1.65, 1.8];
export const DEFAULT_DISPLAY = { viewMode: 'bubble', fontSizeLevel: 3, lineHeightLevel: 3 };

const level = (v, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(1, Math.min(5, n)) : fallback;
};

// 저장돼 있던 값이 깨졌거나 범위를 벗어나도 안전한 값으로 되돌린다.
export function normalizeDisplay(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    viewMode: r.viewMode === 'plain' ? 'plain' : 'bubble',
    fontSizeLevel: level(r.fontSizeLevel, DEFAULT_DISPLAY.fontSizeLevel),
    lineHeightLevel: level(r.lineHeightLevel, DEFAULT_DISPLAY.lineHeightLevel),
  };
}

export function displayVars(display) {
  const d = normalizeDisplay(display);
  return {
    '--chat-font-size': `${FONT_REM[d.fontSizeLevel - 1]}rem`,
    '--chat-line-height': String(LINE_HEIGHT[d.lineHeightLevel - 1]),
  };
}

// ---------- 분석 (DOM 없이 동작하므로 노드에서도 테스트 가능) ----------

const ASSET = /\{\{\s*asset:[^}]*\}\}/g;
const FENCE_OPEN = /^\s*```\s*([^\s`]*)\s*$/;
const FENCE_CLOSE = /^\s*```\s*$/;
// **이름**: "…"  /  **이름:** "…"  /  **이름 (소속):** "…"  /  **[역할]**: "…"
const DIALOGUE = /^\s*\*\*\s*([^*\n]{1,40}?)\s*(?:[:：]\s*\*\*|\*\*\s*[:：])\s*(.*)$/;
const QUOTE_PAIRS = [['"', '"'], ['“', '”'], ['「', '」'], ['\'', '\''], ['‘', '’']];

export function stripAssets(text) {
  return String(text ?? '').replace(ASSET, '');
}

function unquote(s) {
  const t = s.trim();
  for (const [a, b] of QUOTE_PAIRS) {
    if (t.length >= 2 && t.startsWith(a) && t.endsWith(b)) return t.slice(1, -1).trim();
  }
  return t;
}

export function parseBlocks(raw) {
  const lines = stripAssets(raw).replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let para = [];
  const flush = () => {
    const text = para.join('\n').trim();
    if (text) blocks.push({ type: 'narration', text });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const open = line.match(FENCE_OPEN);
    if (open) {
      flush();
      const body = [];
      for (i++; i < lines.length && !FENCE_CLOSE.test(lines[i]); i++) body.push(lines[i]);
      const text = body.join('\n').replace(/^\s*\n+|\n+\s*$/g, '');
      if (text.trim()) blocks.push({ type: 'code', label: open[1] || '', text });
      continue;
    }
    if (/^\s*>/.test(line)) {
      flush();
      const q = [];
      for (; i < lines.length && /^\s*>/.test(lines[i]); i++) {
        const t = lines[i].replace(/^\s*>\s?/, '').trim();
        if (t) q.push(t);
      }
      i--;
      if (q.length) blocks.push({ type: 'quote', lines: q });
      continue;
    }
    const d = line.match(DIALOGUE);
    if (d) {
      flush();
      const speaker = d[1].replace(/^\[|\]$/g, '').trim();
      let said = unquote(d[2]);
      const thought = /^💭/.test(said);
      if (thought) said = unquote(said.replace(/^💭\s*/, ''));
      blocks.push({ type: 'dialogue', speaker, text: said, thought });
      continue;
    }
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { flush(); continue; } // 구분선
    if (/^\s*\|?\s*\|?\s*$/.test(line)) { flush(); continue; } // 빈 줄, 이미지 표 껍데기
    para.push(line);
  }
  flush();
  return blocks;
}

// 줄 안쪽 서식: **굵게**, *기울임*, `코드`. 짝이 맞지 않는 별표는 글자 그대로 둔다.
export function parseInline(text) {
  const out = [];
  // 여는 별표 바로 뒤와 닫는 별표 바로 앞은 공백이 아니어야 서식으로 본다 (마크다운 규칙). lookbehind는 오래된 iOS에서 문법 오류라 쓰지 않는다.
  const re = /\*\*(?!\s)([^*\n]*[^*\s])\*\*|\*(?!\s)([^*\n]*[^*\s])\*|`([^`\n]+?)`/g;
  let last = 0;
  for (let m; (m = re.exec(text));) {
    if (m.index > last) out.push({ t: 'x', s: text.slice(last, m.index) });
    if (m[1] != null) out.push({ t: 'b', s: m[1] });
    else if (m[2] != null) out.push({ t: 'i', s: m[2] });
    else out.push({ t: 'c', s: m[3] });
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ t: 'x', s: text.slice(last) });
  return out;
}

// 지문은 문단 전체를 *…* 로 감싸는 경우가 많아서, 전부 기울임이면 기울임 표시를 빼고 보여준다.
function flattenIfAllItalic(tokens) {
  const meaningful = tokens.filter((t) => t.s.trim());
  return meaningful.length && meaningful.every((t) => t.t === 'i')
    ? tokens.map((t) => (t.t === 'i' ? { t: 'x', s: t.s } : t))
    : tokens;
}

// ---------- DOM 만들기 ----------

function inline(doc, text, { flatten = false } = {}) {
  let tokens = parseInline(text);
  if (flatten) tokens = flattenIfAllItalic(tokens);
  const frag = doc.createDocumentFragment();
  for (const tk of tokens) {
    if (tk.t === 'x') { frag.append(tk.s); continue; }
    const el = doc.createElement(tk.t === 'b' ? 'strong' : tk.t === 'i' ? 'em' : 'code');
    el.textContent = tk.s;
    frag.append(el);
  }
  return frag;
}

function node(doc, tag, className, children = []) {
  const el = doc.createElement(tag);
  if (className) el.className = className;
  for (const c of children) if (c != null) el.append(c);
  return el;
}

// viewMode: 'bubble'(채팅형, 문단마다 말풍선) | 'plain'(소설형, 지문은 배경 위에 그대로, 대사만 말풍선)
export function renderBlocks(blocks, { viewMode = 'bubble', doc = document } = {}) {
  const bubble = viewMode !== 'plain';
  const wrap = node(doc, 'div', `gm-body view-${bubble ? 'bubble' : 'plain'}`);
  for (const b of blocks) {
    if (b.type === 'narration') {
      wrap.append(node(doc, 'div', `blk narration${bubble ? ' bubble' : ''}`, [inline(doc, b.text, { flatten: true })]));
    } else if (b.type === 'dialogue') {
      wrap.append(node(doc, 'div', `blk dialogue${b.thought ? ' thought' : ''}`, [
        b.speaker ? node(doc, 'span', 'who', [b.speaker]) : null,
        node(doc, 'div', 'say bubble', [inline(doc, b.text)]),
      ]));
    } else if (b.type === 'quote') {
      wrap.append(node(doc, 'div', 'blk quote', b.lines.map((l) => node(doc, 'div', 'ql', [inline(doc, l)]))));
    } else if (b.type === 'code') {
      const pre = node(doc, 'pre', 'panel-text', [b.text]);
      wrap.append(node(doc, 'div', 'blk panel', [b.label ? node(doc, 'span', 'panel-label', [b.label]) : null, pre]));
    }
  }
  return wrap;
}

export function renderMessage(text, opts = {}) {
  return renderBlocks(parseBlocks(text), opts);
}
