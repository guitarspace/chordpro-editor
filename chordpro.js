/* ChordPro 格式解析與輸出 */
const ChordPro = (() => {

  function emptySong() {
    return {
      meta: { title: '', artist: '', key: '', play: '', capo: '', tempo: '', rhythm: '' },
      defines: {},   // name -> { frets:[6 個絕對音格, -1=悶音] }
      blocks: []     // {type:'section', name} | {type:'line', lyrics, chords:[{pos,name}]}
    };
  }

  // ---- 解析 ----
  function parse(text) {
    const song = emptySong();
    const lines = String(text || '').split(/\r?\n/);
    for (const raw of lines) {
      const m = raw.match(/^\s*\{([^:}]+):?\s*([^}]*)\}\s*$/);
      if (m) {
        handleDirective(song, m[1].trim().toLowerCase(), m[2].trim());
      } else {
        song.blocks.push(parseLyricLine(raw));
      }
    }
    // 去掉開頭/結尾多餘空行
    while (song.blocks.length && isEmptyLine(song.blocks[0])) song.blocks.shift();
    while (song.blocks.length && isEmptyLine(song.blocks[song.blocks.length - 1])) song.blocks.pop();
    return song;
  }

  function isEmptyLine(b) {
    return b && b.type === 'line' && !b.lyrics.trim() && b.chords.length === 0;
  }

  function handleDirective(song, name, value) {
    switch (name) {
      case 'title': case 't': song.meta.title = value; break;
      case 'subtitle': case 'st': case 'artist': song.meta.artist = value; break;
      case 'key': song.meta.key = value; break;
      case 'capo': song.meta.capo = value; break;
      case 'tempo': song.meta.tempo = value; break;
      case 'c': case 'comment': case 'ci': case 'cb': case 'section': case 'highlight':
        song.blocks.push({ type: 'section', name: value });
        break;
      case 'start_of_verse': case 'sov':
        song.blocks.push({ type: 'section', name: value || '主歌' }); break;
      case 'start_of_chorus': case 'soc':
        song.blocks.push({ type: 'section', name: value || '副歌' }); break;
      case 'start_of_bridge': case 'sob':
        song.blocks.push({ type: 'section', name: value || '橋段' }); break;
      case 'meta': {
        const sp = value.indexOf(' ');
        if (sp > 0) {
          const k = value.slice(0, sp).trim().toLowerCase();
          const v = value.slice(sp + 1).trim();
          if (k === 'play') song.meta.play = v;
          else if (k === 'rhythm') song.meta.rhythm = v;
          else if (k === 'xfrets') parseXfrets(song, v); // 本編輯器擴充：同一弦上的額外音
          else if (k in song.meta) song.meta[k] = v;
        }
        break;
      }
      case 'define': case 'chord': parseDefine(song, value); break;
      default: break; // 其他指令略過
    }
  }

  function parseDefine(song, value) {
    const tok = value.split(/\s+/).filter(Boolean);
    if (!tok.length) return;
    const name = tok[0];
    let base = 1;
    let frets = null;
    let fingers = null;
    for (let i = 1; i < tok.length; i++) {
      const t = tok[i].toLowerCase();
      if (t === 'base-fret') base = parseInt(tok[++i], 10) || 1;
      else if (t === 'frets') {
        frets = [];
        for (let k = 0; k < 6 && i + 1 < tok.length; k++) {
          const f = tok[++i].toLowerCase();
          if (f === 'x' || f === '-1') frets.push(-1);
          else if (f === 'n' || f === 'o') frets.push(0);
          else frets.push(parseInt(f, 10) || 0);
        }
      } else if (t === 'fingers') {
        // 指法代號：T / 1～4，其他符號視為未標
        fingers = [];
        for (let k = 0; k < 6 && i + 1 < tok.length; k++) {
          const f = tok[++i].toUpperCase();
          fingers.push(/^[T1-4]$/.test(f) ? f : '');
        }
      }
    }
    if (frets && frets.length === 6) {
      // 轉為絕對音格（保留可能已先讀到的 xfrets 額外音）
      const prev = song.defines[name];
      song.defines[name] = { frets: frets.map(f => (f > 0 ? f + base - 1 : f)) };
      if (prev && prev.extra) song.defines[name].extra = prev.extra;
      if (fingers && fingers.some(Boolean)) song.defines[name].fingers = fingers;
    }
  }

  // {meta: xfrets 名稱 弦:格 弦:格 ...}（弦 0=低音E … 5=高音E，格為絕對音格）
  function parseXfrets(song, value) {
    const tok = value.split(/\s+/).filter(Boolean);
    if (tok.length < 2) return;
    const name = tok[0];
    const extra = [];
    for (let i = 1; i < tok.length; i++) {
      const m = tok[i].match(/^([0-5]):(\d+)$/);
      if (m) extra.push({ s: parseInt(m[1], 10), f: parseInt(m[2], 10) });
    }
    if (!extra.length) return;
    if (!song.defines[name]) song.defines[name] = { frets: null };
    song.defines[name].extra = extra;
  }

  function parseLyricLine(raw) {
    let lyrics = '';
    const chords = [];
    let i = 0;
    while (i < raw.length) {
      if (raw[i] === '[') {
        const j = raw.indexOf(']', i);
        if (j > i + 1) {
          let name = raw.slice(i + 1, j);
          const grid = name.endsWith('*'); // 後綴 * = 此和弦上方顯示指法圖（本編輯器擴充）
          if (grid) name = name.slice(0, -1);
          const c = { pos: lyrics.length, name };
          if (grid) c.grid = true;
          chords.push(c);
          i = j + 1;
          continue;
        }
      }
      if (raw[i] === '|') {
        // 小節線：顯示在和弦列上，資料記成 name 為「|」的標記
        chords.push({ pos: lyrics.length, name: '|' });
        i++;
        continue;
      }
      lyrics += raw[i++];
    }
    return { type: 'line', lyrics: lyrics.replace(/\s+$/, ''), chords };
  }

  // ---- 輸出 ----
  function serialize(song) {
    const out = [];
    const m = song.meta;
    if (m.title) out.push(`{title: ${m.title}}`);
    if (m.artist) out.push(`{artist: ${m.artist}}`);
    if (m.key) out.push(`{key: ${m.key}}`);
    if (m.play) out.push(`{meta: play ${m.play}}`);
    if (m.capo !== '' && m.capo != null) out.push(`{capo: ${m.capo}}`);
    if (m.tempo) out.push(`{tempo: ${m.tempo}}`);
    if (m.rhythm) out.push(`{meta: rhythm ${m.rhythm}}`);
    for (const [name, def] of Object.entries(song.defines)) {
      if (def.frets) out.push(serializeDefine(name, def));
      if (def.extra && def.extra.length) {
        out.push(`{meta: xfrets ${name} ${def.extra.map(e => e.s + ':' + e.f).join(' ')}}`);
      }
    }
    if (out.length) out.push('');
    for (const b of song.blocks) {
      if (b.type === 'section') out.push(`{c: ${b.name}}`);
      else out.push(serializeLine(b));
    }
    return out.join('\n') + '\n';
  }

  function serializeDefine(name, def) {
    const pos = def.frets.filter(f => f > 0);
    const maxF = pos.length ? Math.max(...pos) : 0;
    const base = maxF > 5 ? Math.min(...pos) : 1;
    const rel = def.frets.map(f => (f > 0 ? f - base + 1 : f));
    const fretStr = rel.map(f => (f === -1 ? 'x' : f)).join(' ');
    let out = `{define: ${name} base-fret ${base} frets ${fretStr}`;
    if (def.fingers && def.fingers.some(Boolean)) {
      out += ` fingers ${def.fingers.map(f => f || '-').join(' ')}`;
    }
    return out + '}';
  }

  function serializeLine(b) {
    // 同位置時小節線排在和弦前（|Cmaj7 的順序）
    const isBar = (x) => x.name === '|';
    const chords = [...b.chords].sort((a, c) =>
      (a.pos - c.pos) || ((isBar(a) ? -1 : 0) - (isBar(c) ? -1 : 0)));
    let out = '';
    let li = 0;
    for (const ch of chords) {
      const target = Math.max(ch.pos, li);
      while (li < target) { out += (li < b.lyrics.length ? b.lyrics[li] : ' '); li++; }
      out += isBar(ch) ? '|' : `[${ch.name}${ch.grid ? '*' : ''}]`;
    }
    out += b.lyrics.slice(li);
    return out.replace(/\s+$/, '');
  }

  return { parse, serialize, emptySong, isEmptyLine };
})();
