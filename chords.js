/* 內建和弦庫 + 自動封閉和弦推算 + 移調工具 */
const Chords = (() => {

  // 絕對音格，由低音 E 弦到高音 E 弦；-1 = 悶音(×)，0 = 空弦(○)
  const DICT = {
    'C':      [-1, 3, 2, 0, 1, 0],
    'C7':     [-1, 3, 2, 3, 1, 0],
    'Cmaj7':  [-1, 3, 2, 0, 0, 0],
    'Cadd9':  [-1, 3, 2, 0, 3, 0],
    'Csus4':  [-1, 3, 3, 0, 1, 1],
    'Cm':     [-1, 3, 5, 5, 4, 3],
    'Cm7':    [-1, 3, 5, 3, 4, 3],
    'C/B':    [-1, 2, 2, 0, 1, 0],
    'C/G':    [3, 3, 2, 0, 1, 0],
    'C/E':    [0, 3, 2, 0, 1, 0],
    'D':      [-1, -1, 0, 2, 3, 2],
    'Dm':     [-1, -1, 0, 2, 3, 1],
    'D7':     [-1, -1, 0, 2, 1, 2],
    'Dm7':    [-1, -1, 0, 2, 1, 1],
    'Dmaj7':  [-1, -1, 0, 2, 2, 2],
    'Dsus4':  [-1, -1, 0, 2, 3, 3],
    'Dsus2':  [-1, -1, 0, 2, 3, 0],
    'D/F#':   [2, 0, 0, 2, 3, 2],
    'E':      [0, 2, 2, 1, 0, 0],
    'Em':     [0, 2, 2, 0, 0, 0],
    'E7':     [0, 2, 0, 1, 0, 0],
    'Em7':    [0, 2, 0, 0, 0, 0],
    'Esus4':  [0, 2, 2, 2, 0, 0],
    'F':      [1, 3, 3, 2, 1, 1],
    'Fm':     [1, 3, 3, 1, 1, 1],
    'F7':     [1, 3, 1, 2, 1, 1],
    'Fmaj7':  [-1, -1, 3, 2, 1, 0],
    'G':      [3, 2, 0, 0, 0, 3],
    'G7':     [3, 2, 0, 0, 0, 1],
    'Gmaj7':  [3, 2, 0, 0, 0, 2],
    'Gsus4':  [3, 3, 0, 0, 1, 3],
    'Gm':     [3, 5, 5, 3, 3, 3],
    'G/B':    [-1, 2, 0, 0, 0, 3],
    'A':      [-1, 0, 2, 2, 2, 0],
    'Am':     [-1, 0, 2, 2, 1, 0],
    'A7':     [-1, 0, 2, 0, 2, 0],
    'Am7':    [-1, 0, 2, 0, 1, 0],
    'Amaj7':  [-1, 0, 2, 1, 2, 0],
    'Asus2':  [-1, 0, 2, 2, 0, 0],
    'Asus4':  [-1, 0, 2, 2, 3, 0],
    'Am/G':   [3, 0, 2, 2, 1, 0],
    'B':      [-1, 2, 4, 4, 4, 2],
    'Bm':     [-1, 2, 4, 4, 3, 2],
    'B7':     [-1, 2, 1, 2, 0, 2],
    'Bm7':    [-1, 2, 4, 2, 3, 2],
    'Bm7b5':  [-1, 2, 3, 2, 3, -1],
    'Bb':     [-1, 1, 3, 3, 3, 1],
    'Bdim':   [-1, 2, 3, 1, 3, -1],
    'Fadd9':  [-1, -1, 3, 2, 1, 3],
    'Gadd9':  [3, -1, 0, 2, 0, 3],
    'Aadd9':  [-1, 0, 2, 4, 2, 0],
    'Eadd9':  [0, 2, 2, 1, 0, 2],
    'Dadd9':  [-1, -1, 0, 2, 3, 0],
    'F#m7b5': [2, -1, 2, 2, 1, -1],
    'Em7b5':  [0, 1, 0, 0, 3, 0],
    'C#dim':  [-1, 4, 5, 3, 5, -1],
    'F#dim':  [2, -1, 1, 2, 1, -1],
    'G#dim':  [4, -1, 3, 4, 3, -1],
  };

  const NOTES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const NOTE_VAL = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'Fb': 4, 'F': 5,
    'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11, 'Cb': 11,
  };

  // 封閉和弦樣板（相對於空弦把位）
  const E_SHAPE = { '': [0,2,2,1,0,0], 'm': [0,2,2,0,0,0], '7': [0,2,0,1,0,0], 'm7': [0,2,0,0,0,0], 'maj7': [0,2,1,1,0,0], 'sus4': [0,2,2,2,0,0] };
  const A_SHAPE = { '': [-1,0,2,2,2,0], 'm': [-1,0,2,2,1,0], '7': [-1,0,2,0,2,0], 'm7': [-1,0,2,0,1,0], 'maj7': [-1,0,2,1,2,0], 'sus4': [-1,0,2,2,3,0] };

  function parseName(name) {
    const m = String(name).match(/^([A-G][#b]?)(.*)$/);
    if (!m) return null;
    const slash = m[2].indexOf('/');
    return {
      root: m[1],
      quality: slash >= 0 ? m[2].slice(0, slash) : m[2],
      bass: slash >= 0 ? m[2].slice(slash + 1) : null,
    };
  }

  // 內建 / 推算的基本指法（不含自訂）
  function lookupFrets(name) {
    if (DICT[name]) return DICT[name].slice();
    const p = parseName(name);
    if (!p) return null;
    // 斜線和弦：先試上方和弦本體
    const main = p.bass ? (p.root + p.quality) : null;
    if (main && DICT[main]) return DICT[main].slice();
    const q = p.quality;
    const r = NOTE_VAL[p.root];
    if (r == null) return null;
    const candidates = [];
    if (E_SHAPE[q] != null) {
      const off = (r - 4 + 12) % 12;
      if (off > 0) candidates.push({ off, shape: E_SHAPE[q] });
    }
    if (A_SHAPE[q] != null) {
      const off = (r - 9 + 12) % 12;
      if (off > 0) candidates.push({ off, shape: A_SHAPE[q] });
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => a.off - b.off);
    const c = candidates[0];
    return c.shape.map(f => (f < 0 ? -1 : f + c.off));
  }

  // 取得和弦指法：使用者自訂 > 內建 > 封閉和弦推算 > null
  // 回傳 { frets:[6], extra:[{s,f}...], fingers:[6]|null, custom }，extra 是同一弦上的額外音
  function getDef(name, defines) {
    const custom = defines && defines[name];
    const frets = (custom && custom.frets) ? custom.frets.slice() : lookupFrets(name);
    if (!frets) return null;
    const extra = (custom && custom.extra) ? custom.extra.map(x => ({ s: x.s, f: x.f })) : [];
    const fingers = (custom && custom.fingers) ? custom.fingers.slice() : null;
    return { frets, extra, fingers, custom: !!custom };
  }

  const NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

  // 順階和弦：給定調名回傳七個級數和弦（降記號調用降記號拼法）
  function diatonicChords(key) {
    const v = noteValue(key);
    if (v == null) return null;
    const useFlat = /[b♭]/.test(String(key)) || String(key).trim() === 'F';
    const names = useFlat ? NOTES_FLAT : NOTES_SHARP;
    const degs = [[0, '', '1'], [2, 'm', '2m'], [4, 'm', '3m'], [5, '', '4'], [7, '', '5'], [9, 'm', '6m'], [11, 'dim', '7dim']];
    return degs.map(([off, q, deg]) => ({ name: names[(v + off) % 12] + q, degree: deg }));
  }

  // 快速輸入面板：每個級數一欄（1～6），欄內第一個是順階三和弦，其餘是該級的延伸選項。
  // tier 常用度：1=最常用(綠)、2=次常用(黃)、3=較少用(白)
  function paletteColumns(key) {
    const v = noteValue(key);
    if (v == null) return null;
    const useFlat = /[b♭]/.test(String(key)) || String(key).trim() === 'F';
    const names = useFlat ? NOTES_FLAT : NOTES_SHARP;
    const N = (off) => names[((v + off) % 12 + 12) % 12];
    const C = (off, q, deg, tier, bass) =>
      ({ name: N(off) + q + (bass != null ? '/' + N(bass) : ''), degree: deg, tier });
    return [
      [C(0, '', '1', 1), C(0, 'maj7', '1maj7', 2), C(0, 'add9', '1add9', 1), C(0, 'sus4', '1sus4', 3), C(0, '', '1/3', 2, 4), C(0, '7', '17', 2)],
      [C(2, 'm', '2m', 1), C(2, 'm7', '2m7', 1), C(2, '', '2', 3), C(2, '7', '27', 3)],
      [C(4, 'm', '3m', 1), C(4, 'm7', '3m7', 1), C(4, '', '3', 2), C(4, '7', '37', 2)],
      [C(5, '', '4', 1), C(5, 'maj7', '4maj7', 2), C(5, 'add9', '4add9', 1), C(5, 'm', '4m', 2), C(6, 'm7b5', '#4m7b5', 3)],
      [C(7, '', '5', 1), C(7, '7', '57', 2), C(7, 'sus4', '5sus4', 1), C(7, '', '5/7', 2, 11), C(7, 'm', '5m', 3)],
      [C(9, 'm', '6m', 1), C(9, 'm7', '6m7', 1), C(9, 'm7', '6m7/5', 2, 7), C(9, '7', '67', 3)],
    ];
  }

  // 級數輸入 → 和弦名：「4」→ F、「2m7」→ Dm7、「57」→ G7、「5/7」→ G/B（以 key 為 1 級）
  const DEG_SEMI = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11 };
  function nameFromDegree(input, key) {
    const v = noteValue(key);
    if (v == null) return null;
    const useFlat = /[b♭]/.test(String(key)) || String(key).trim() === 'F';
    const names = useFlat ? NOTES_FLAT : NOTES_SHARP;
    const conv = (part) => {
      const m = part.match(/^([#b♯♭]?)([1-7])(.*)$/);
      if (!m) return null;
      let off = DEG_SEMI[+m[2]];
      if (m[1] === '#' || m[1] === '♯') off++;
      else if (m[1] === 'b' || m[1] === '♭') off--;
      return names[((v + off) % 12 + 12) % 12] + m[3];
    };
    const out = String(input).trim().split('/').map(conv);
    return out.some(p => p == null) ? null : out.join('/');
  }

  // ---- 級數和弦（Nashville）：以 Play 調為 1 級，G 調時 G=1、A=2… ----
  const DEGREE = { 0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4', 6: '#4', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7' };

  // 取出調名的半音值（"G"、"F#"、"bB"、"Bb" 都接受），無法解析回傳 null
  function noteValue(key) {
    const m = String(key || '').trim().match(/^([#b♯♭]?)([A-G])([#b♯♭]?)/);
    if (!m) return null;
    const acc = m[1] || m[3];
    const name = m[2] + (acc === '♯' ? '#' : acc === '♭' ? 'b' : acc);
    return NOTE_VAL[name] != null ? NOTE_VAL[name] : null;
  }

  // 和弦名 → 級數表示（品質與斜線低音保留）：keyVal 為 1 級的半音值
  function degreeName(name, keyVal) {
    return String(name).split('/').map(part => {
      const m = part.match(/^([A-G][#b♯♭]?)(.*)$/);
      if (!m) return part;
      const v = NOTE_VAL[m[1].replace('♯', '#').replace('♭', 'b')];
      if (v == null) return part;
      return DEGREE[(v - keyVal + 12) % 12] + m[2];
    }).join('/');
  }

  // 顯示用名稱：升降記號移到字母左邊（C# → #C、Bb → bB），含斜線低音
  function displayName(name) {
    return String(name).split('/').map(p =>
      p.replace(/^([A-G])([#b♯♭])/, (m, l, a) => a + l)
    ).join('/');
  }

  // 輸入正規化：接受 #C / bB / ♯C 等寫法，轉回內部格式 C# / Bb
  function normalizeName(input) {
    return String(input).split('/').map(p =>
      p.replace(/^([#b♯♭])([A-G])/, (m, a, l) => l + (a === '♯' ? '#' : a === '♭' ? 'b' : a))
       .replace(/^([A-G])([♯♭])/, (m, l, a) => l + (a === '♯' ? '#' : 'b'))
    ).join('/');
  }

  // 移調：C → D 之類，保留品質與斜線低音
  function transposeName(name, delta) {
    return String(name).split('/').map(part => {
      const m = part.match(/^([A-G][#b]?)(.*)$/);
      if (!m || NOTE_VAL[m[1]] == null) return part;
      const v = (NOTE_VAL[m[1]] + delta + 120) % 12;
      return NOTES_SHARP[v] + m[2];
    }).join('/');
  }

  // 常用和弦名稱（輸入提示用）
  const SUGGESTIONS = [];
  for (const root of ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B']) {
    for (const q of ['','m','7','m7','maj7','sus4','sus2','add9','dim','6','9']) {
      SUGGESTIONS.push(root + q);
    }
  }
  SUGGESTIONS.push('C/B','C/G','C/E','D/F#','G/B','Am/G','Bm7b5');

  return { getDef, transposeName, parseName, displayName, normalizeName, degreeName, nameFromDegree, noteValue, diatonicChords, paletteColumns, SUGGESTIONS, DICT };
})();
