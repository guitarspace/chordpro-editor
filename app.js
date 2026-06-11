/* 所見即所得 ChordPro 編輯器：主程式 */
(() => {
  'use strict';

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  const STORAGE_KEY = 'chordpro-wysiwyg-autosave';

  let song = ChordPro.emptySong();
  let showDegrees = localStorage.getItem('chordpro-degrees') === '1';

  // 顯示設定：字級(px)、上方和弦圖大小(%)、歌詞行內指法圖大小(%)
  const VIEW = Object.assign(
    { font: 19, strip: 100, inline: 62 },
    JSON.parse(localStorage.getItem('chordpro-view') || '{}'));

  function applyView() {
    document.documentElement.style.setProperty('--fs', VIEW.font + 'px');
  }

  function bindView() {
    const map = [['sl-font', 'font'], ['sl-strip', 'strip'], ['sl-inline', 'inline']];
    for (const [id, k] of map) {
      const el = $('#' + id);
      if (!el) continue;
      el.value = VIEW[k];
      el.addEventListener('input', () => {
        VIEW[k] = +el.value;
        localStorage.setItem('chordpro-view', JSON.stringify(VIEW));
        applyView();
        renderChordStrip();
        renderEditor();
      });
    }
    applyView();
  }

  // Key 下拉的 12 個調（索引 = 半音值）；Play 限吉他常用調；Capo 範圍 -2~12
  const KEY_OPTIONS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const PLAY_OPTIONS = ['C', 'G', 'D', 'A', 'E', 'B', 'F'];
  const keyNameOf = (semitone) => KEY_OPTIONS[((semitone % 12) + 12) % 12];

  function fillMetaSelects() {
    const fill = (el, opts) => {
      el.innerHTML = '';
      el.append(new Option('—', ''));
      for (const o of opts) el.append(new Option(o, o));
    };
    fill($('#m-key'), KEY_OPTIONS);
    fill($('#m-play'), PLAY_OPTIONS);
    const capo = $('#m-capo');
    capo.innerHTML = '';
    for (let n = -2; n <= 12; n++) capo.append(new Option(String(n), String(n)));
  }

  // 選單沒有的值（如從檔案讀進來的調名）臨時加一個選項顯示
  function setSelectValue(el, val) {
    [...el.options].forEach(o => { if (o.dataset.extra) o.remove(); });
    if (![...el.options].some(o => o.value === val)) {
      const o = new Option(val || '—', val);
      o.dataset.extra = '1';
      el.append(o);
    }
    el.value = val;
  }

  // 晶片顯示名稱：級數模式以 Play（其次 Key）為 1 級換算
  function displayChordName(name) {
    if (showDegrees) {
      const kv = Chords.noteValue(song.meta.play || song.meta.key);
      if (kv != null) return Chords.degreeName(name, kv);
    }
    return Chords.displayName(name);
  }

  // ================= 啟動 =================
  function boot() {
    let saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      // 一次性修復：先前版本測試時殘留的破損行（之後可移除）
      saved = saved.replace(
        '[G]陽光灑在了窗口 時間不再說話\n光灑[C]在[D/F#]了窗口 [Em maj7]時間不再[D]說話',
        '[G]陽光灑[C]在[D/F#]了窗口 [Em maj7]時間不再[D]說話');
    }
    song = ChordPro.parse(saved != null ? saved : DEMO);
    fillChordDatalist();
    fillMetaSelects();
    bindToolbar();
    bindMeta();
    bindView();
    bindPaletteMove();
    renderAll();
  }

  const DEMO = `{title: 示範歌曲}
{artist: 雙擊文字即可編輯}
{key: C}
{meta: play C}
{capo: 0}
{tempo: 75}
{meta: rhythm T1213121}

{c: 前奏}
|[C]      |[G/B]      |[Am]      |[F]   [G]   |
{c: 主歌}
[C]微風吹過了[G/B]山丘 [Am]雲慢慢地[F]走
[C]陽光灑在了[G/B]窗口 [Am]時間不再[G]說話
{c: 副歌}
[F]啦啦[G]啦 唱一首[Em]簡單的[Am]歌
[F]把和弦[G]拖到 任何想[C]去的地方
{c: 尾奏}
|[F]      |[G]      |[C]      |
`;

  // ================= 儲存 =================
  function persist() {
    localStorage.setItem(STORAGE_KEY, ChordPro.serialize(song));
  }
  function commit() { persist(); renderAll(); }

  // ================= 工具列 =================
  function bindToolbar() {
    $('#btn-new').onclick = () => {
      if (!confirm('確定要開新檔案嗎？目前內容會被清空。')) return;
      song = ChordPro.emptySong();
      song.blocks.push({ type: 'line', lyrics: '', chords: [] });
      commit();
    };
    $('#btn-import').onclick = () => $('#file-input').click();
    if ($('#btn-paste')) $('#btn-paste').onclick = () => { $('#paste-text').value = ''; $('#paste-dlg').showModal(); };
    const pasteToBlocks = () => {
      // 用 ChordPro 解析：純文字直接分行；若貼的是含 [和弦] 或 | 的內容也能正確轉換
      const text = $('#paste-text').value.replace(/\r/g, '');
      return ChordPro.parse(text).blocks;
    };
    if ($('#paste-cancel')) {
      $('#paste-cancel').onclick = () => $('#paste-dlg').close();
      $('#paste-append').onclick = () => {
        song.blocks.push(...pasteToBlocks());
        $('#paste-dlg').close();
        commit();
      };
      $('#paste-replace').onclick = () => {
        if (!confirm('會清掉現有的歌詞與和弦（曲名、Key 等資訊保留），確定？')) return;
        song.blocks = pasteToBlocks();
        $('#paste-dlg').close();
        commit();
      };
    }
    $('#file-input').onchange = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => { song = ChordPro.parse(r.result); commit(); };
      r.readAsText(f);
      e.target.value = '';
    };
    $('#btn-export').onclick = () => {
      const blob = new Blob([ChordPro.serialize(song)], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (song.meta.title || 'song') + '.cho';
      a.click();
      URL.revokeObjectURL(a.href);
    };
    $('#btn-transpose-up').onclick = () => transpose(1);
    $('#btn-transpose-down').onclick = () => transpose(-1);
    const degBtn = $('#btn-degrees');
    if (degBtn) {
      const syncDegBtn = () => degBtn.classList.toggle('active', showDegrees);
      syncDegBtn();
      degBtn.onclick = () => {
        if (!showDegrees && Chords.noteValue(song.meta.play || song.meta.key) == null) {
          alert('請先在標頭填 Play（或 Key）調名，例如 G，才能換算級數。');
          return;
        }
        showDegrees = !showDegrees;
        localStorage.setItem('chordpro-degrees', showDegrees ? '1' : '0');
        syncDegBtn();
        renderAll();
      };
    }
    $('#btn-print').onclick = () => window.print();
    $('#btn-source').onclick = openSource;
    $('#btn-add-line').onclick = () => {
      song.blocks.push({ type: 'line', lyrics: '', chords: [] });
      commit();
      editLyricsAt(song.blocks.length - 1);
    };
    $('#btn-add-section').onclick = () => {
      song.blocks.push({ type: 'section', name: '段落' });
      commit();
    };
  }

  // 只移調譜面（和弦＋自訂指法），不動 meta
  function transposeChords(delta) {
    for (const b of song.blocks) {
      if (b.type !== 'line') continue;
      for (const c of b.chords) if (c.name !== '|') c.name = Chords.transposeName(c.name, delta);
    }
    // 自訂按法跟著移調：按壓位置整體平移（空弦會變成按壓、降到 0 格以下時升八度）
    const shiftFret = (f) => {
      if (f < 0) return -1;
      let n = f + delta;
      while (n < 0) n += 12;
      return n;
    };
    const newDefines = {};
    for (const [n, d] of Object.entries(song.defines)) {
      const nd = { ...d };
      if (d.frets) nd.frets = d.frets.map(shiftFret);
      if (d.extra) nd.extra = d.extra.map(x => ({ s: x.s, f: shiftFret(x.f) }));
      newDefines[Chords.transposeName(n, delta)] = nd;
    }
    song.defines = newDefines;
  }

  function transpose(delta) {
    transposeChords(delta);
    // Capo 不動 → Key 與 Play 同步平移（維持 Key = Play + Capo）
    const pv = Chords.noteValue(song.meta.play);
    const kv = Chords.noteValue(song.meta.key);
    if (pv != null) song.meta.play = keyNameOf(pv + delta);
    if (kv != null) song.meta.key = keyNameOf(kv + delta);
    commit();
  }

  // ---- Key = Play + Capo 連動 ----
  // 改 Capo：指法不變 → 重算 Key；改 Play：Key 不變 → 譜面移調、重算 Capo；
  // 改 Key：Play 不變 → 重算 Capo。缺欄位時盡量補齊。
  function syncKeyPlayCapo(changed, prevValue) {
    const m = song.meta;
    const kv = Chords.noteValue(m.key);
    const pv = Chords.noteValue(m.play);
    const capo = parseInt(m.capo, 10) || 0;
    // Capo 算出 10、11 時改用 -2、-1（降半音/全音調弦比夾高把位實際）
    const capoOf = (k, p) => {
      let c = (k - p + 12) % 12;
      if (c > 9) c -= 12;
      return String(c);
    };
    if (changed === 'capo') {
      if (pv != null) m.key = keyNameOf(pv + capo);
      else if (kv != null) m.play = keyNameOf(kv - capo);
    } else if (changed === 'play') {
      if (pv == null) return;
      let oldPv = Chords.noteValue(prevValue);
      // 舊 Play 是空值/壞值時，用 Key − Capo 推回譜面原本的調，移調才不會斷鏈
      if (oldPv == null && kv != null) oldPv = ((kv - capo) % 12 + 12) % 12;
      if (oldPv != null && oldPv !== pv) transposeChords((pv - oldPv + 12) % 12);
      if (kv != null) m.capo = capoOf(kv, pv);
      else m.key = keyNameOf(pv + capo);
    } else if (changed === 'key') {
      if (kv == null) return;
      if (pv != null) m.capo = capoOf(kv, pv);
      else m.play = keyNameOf(kv - capo);
    }
  }

  // ================= 標頭欄位 =================
  const META_FIELDS = { 'm-title': 'title', 'm-artist': 'artist', 'm-key': 'key', 'm-play': 'play', 'm-capo': 'capo', 'm-tempo': 'tempo', 'm-rhythm': 'rhythm' };
  function bindMeta() {
    for (const [id, key] of Object.entries(META_FIELDS)) {
      $('#' + id).addEventListener('change', (e) => {
        const prev = song.meta[key];
        song.meta[key] = e.target.value.trim();
        if (key === 'key' || key === 'play' || key === 'capo') {
          syncKeyPlayCapo(key, prev); // 維持 Key = Play + Capo（改 Play 會移調譜面）
          persist();
          renderAll(); // 欄位、譜面、級數、順階面板一起更新
          return;
        }
        persist();
        if (key === 'title') document.title = (song.meta.title || 'ChordPro') + ' - ChordPro 編輯器';
      });
    }
  }
  function renderMeta() {
    for (const [id, key] of Object.entries(META_FIELDS)) {
      const el = $('#' + id);
      let v = song.meta[key] || '';
      if (el.tagName === 'SELECT') {
        if (id === 'm-capo' && v === '') v = '0';
        setSelectValue(el, v);
      } else {
        el.value = v;
      }
    }
  }

  // ================= 全部重繪 =================
  function renderAll() {
    renderMeta();
    renderChordStrip();
    renderPalette();
    renderEditor();
  }

  // ================= 順階和弦快速輸入面板 =================
  // 每個級數一欄、縱向對齊。平常只顯示順階一排（1～6m＋小節線）；
  // 滑到某一級 → 該級的延伸選項往上展開；「⌃」按鈕可整個展開/收合。
  let palExpanded = localStorage.getItem('chordpro-pal-expand') === '1';

  function renderPalette() {
    const wrap = $('#palette .pal-chips');
    if (!wrap) return; // 舊版頁面快取時略過
    wrap.innerHTML = '';
    const key = song.meta.play || song.meta.key || 'C';
    const cols = Chords.paletteColumns(key) || Chords.paletteColumns('C');
    $('#pal-key').textContent = (Chords.noteValue(key) != null ? Chords.displayName(key.trim()) : 'C') + ' 調';
    wrap.classList.toggle('expanded', palExpanded);

    const mkChip = (it) => {
      const el = document.createElement('div');
      el.className = 'pal-chip tier' + (it.tier || 1) + (it.name === '|' ? ' pal-bar' : '');
      const big = document.createElement('span');
      big.className = 'pal-name';
      big.textContent = it.name === '|' ? '｜' : Chords.displayName(it.name);
      const sm = document.createElement('span');
      sm.className = 'pal-deg';
      sm.textContent = it.degree;
      el.append(big, sm);
      bindPaletteDrag(el, it.name);
      return el;
    };

    for (const colItems of cols) {
      const colEl = document.createElement('div');
      colEl.className = 'pal-col';
      colEl.appendChild(mkChip(colItems[0]));
      if (colItems.length > 1) {
        const fly = document.createElement('div');
        fly.className = 'pal-fly';
        for (const it of colItems.slice(1)) fly.appendChild(mkChip(it));
        colEl.appendChild(fly);
      }
      wrap.appendChild(colEl);
    }
    const barCol = document.createElement('div');
    barCol.className = 'pal-col';
    barCol.appendChild(mkChip({ name: '|', degree: '小節線', tier: 1 }));
    wrap.appendChild(barCol);

    const ex = $('#pal-expand');
    if (ex) {
      ex.textContent = palExpanded ? '⌄' : '⌃';
      ex.title = palExpanded ? '收合，只顯示順階和弦' : '展開各級數的更多和弦';
      ex.onclick = () => {
        palExpanded = !palExpanded;
        localStorage.setItem('chordpro-pal-expand', palExpanded ? '1' : '0');
        renderPalette();
      };
    }
  }

  // ---- 面板本體可移動：拖曳「順階」標籤，位置存進 localStorage ----
  function applyPalettePos(pos) {
    const pal = $('#palette');
    if (!pal || !pos) return;
    pal.style.left = Math.min(Math.max(0, pos.x), window.innerWidth - 80) + 'px';
    pal.style.top = Math.min(Math.max(0, pos.y), window.innerHeight - 40) + 'px';
    pal.style.bottom = 'auto';
    pal.style.transform = 'none';
  }

  function bindPaletteMove() {
    const pal = $('#palette');
    const handle = pal && $('.pal-label', pal);
    if (!handle) return;
    applyPalettePos(JSON.parse(localStorage.getItem('chordpro-palette-pos') || 'null'));
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const r = pal.getBoundingClientRect();
      const ox = e.clientX - r.left, oy = e.clientY - r.top;
      let last = null;
      const onMove = (ev) => {
        last = { x: ev.clientX - ox, y: ev.clientY - oy };
        applyPalettePos(last);
      };
      const onUp = () => {
        try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        handle.removeEventListener('pointercancel', onUp);
        if (last) localStorage.setItem('chordpro-palette-pos', JSON.stringify(last));
      };
      try { handle.setPointerCapture(e.pointerId); } catch (_) {}
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
      handle.addEventListener('pointercancel', onUp);
    });
  }

  // 從面板拖出 → 放到譜上；沒拖動（點一下）→ 插入到編輯中的游標處
  function bindPaletteDrag(el, name) {
    el.addEventListener('contextmenu', (e) => e.preventDefault()); // iPad 長按選單
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); // 保住編輯中的焦點
      const startX = e.clientX, startY = e.clientY;
      // 觸控：浮起的和弦與命中點都上移，不被手指擋住
      const lift = e.pointerType === 'touch' ? 48 : 0;
      let moved = false, target = null, fly = null;
      const clearDrop = () => $$('.char.drop').forEach(s => s.classList.remove('drop'));

      const onMove = (ev) => {
        if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 5) return;
        if (!moved) {
          moved = true;
          fly = document.createElement('span');
          fly.className = 'chip dragging fly' + (name === '|' ? ' barline' : '') + (lift ? ' touch-drag' : '');
          fly.textContent = name === '|' ? '|' : displayChordName(name);
          fly.style.position = 'fixed';
          document.body.appendChild(fly);
        }
        fly.style.left = (ev.clientX + 8) + 'px';
        fly.style.top = (ev.clientY - 30 - lift) + 'px';
        dragAutoScroll(ev.clientY);
        const drop = findDropTarget(ev.clientX, ev.clientY - lift, fly);
        clearDrop();
        target = drop || null;
        if (drop) {
          const c = drop.cell.querySelector('.char');
          if (c) c.classList.add('drop');
        }
      };

      const onUp = () => {
        try { el.releasePointerCapture(e.pointerId); } catch (_) {}
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
        el.removeEventListener('pointercancel', onUp);
        clearDrop();
        if (fly) fly.remove();
        if (!moved) {
          // 點一下：插入到目前編輯游標的位置
          if (editState) {
            const li = editState.line;
            song.blocks[li].chords.push({ pos: ghost.selectionStart, name });
            persist();
            rerenderBlock(li);
            renderChordStrip();
            ghost.focus({ preventScroll: true });
          }
          return;
        }
        if (target) {
          song.blocks[target.line].chords.push({ pos: target.ci, name });
          commit();
        }
      };

      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);
    });
  }

  // ================= 和弦圖列 =================
  function usedChords() {
    const seen = [];
    for (const b of song.blocks) {
      if (b.type !== 'line') continue;
      for (const c of b.chords) if (c.name !== '|' && !seen.includes(c.name)) seen.push(c.name);
    }
    return seen;
  }

  function renderChordStrip() {
    const wrap = $('#chordstrip .grids');
    wrap.innerHTML = '';
    for (const name of usedChords()) {
      const def = Chords.getDef(name, song.defines);
      const svg = chordSVG(name, def, VIEW.strip / 100);
      svg.addEventListener('click', () => openChordEditor(name));
      svg.setAttribute('role', 'button');
      const t = document.createElementNS(SVGNS, 'title');
      t.textContent = '點擊自訂 ' + name + ' 按法';
      svg.appendChild(t);
      wrap.appendChild(svg);
    }
    $('#chordstrip').style.display = usedChords().length ? '' : 'none';
  }

  // ================= 和弦圖 SVG =================
  const SVGNS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs, parent) {
    const el = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
    if (parent) parent.appendChild(el);
    return el;
  }

  // def: {frets:[6], extra:[{s,f}], fingers:[6]} 絕對音格。回傳 <svg>（預設顯示 3 格，不夠自動加大）
  // opts.noTitle = 不畫上方的和弦名（行內圖用，名稱已由紅色和弦字顯示）
  function chordSVG(name, def, scale = 1, opts = {}) {
    const SG = 11 * scale;          // 弦距
    const FG = 13 * scale;          // 格距
    const X0 = 16 * scale, Y0 = (opts.noTitle ? 14 : 30) * scale;

    const frets = def ? def.frets : null;
    const extra = (def && def.extra) ? def.extra : [];
    const allPos = [];
    if (frets) for (const f of frets) if (f > 0) allPos.push(f);
    for (const e of extra) if (e.f > 0) allPos.push(e.f);
    const maxF = allPos.length ? Math.max(...allPos) : 0;
    const minF = allPos.length ? Math.min(...allPos) : 1;
    let base = opts.base || (maxF > (opts.nFrets || 3) ? minF : 1);
    const NFRETS = opts.nFrets || Math.max(3, maxF - base + 1);

    const W = X0 * 2 + SG * 5, H = Y0 + FG * NFRETS + 8 * scale;
    const svg = svgEl('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` });

    // 和弦名（升降記號顯示在字母左邊）
    if (!opts.noTitle) {
      const title = svgEl('text', {
        x: W / 2, y: 13 * scale, 'text-anchor': 'middle',
        'font-size': 13 * scale, 'font-weight': 700, fill: 'var(--chord-color)',
        'font-family': 'Helvetica Neue, Arial, sans-serif',
      }, svg);
      title.textContent = Chords.displayName(name);
    }

    // 琴枕 / 把位數字
    if (base === 1) {
      svgEl('rect', { x: X0 - 1, y: Y0 - 2.5 * scale, width: SG * 5 + 2, height: 3 * scale, fill: '#222' }, svg);
    } else {
      const t = svgEl('text', { x: X0 - 6 * scale, y: Y0 + FG * 0.65, 'text-anchor': 'end', 'font-size': 10 * scale, fill: '#555' }, svg);
      t.textContent = base;
    }

    // 格線
    for (let s = 0; s < 6; s++) {
      svgEl('line', { x1: X0 + s * SG, y1: Y0, x2: X0 + s * SG, y2: Y0 + FG * NFRETS, stroke: '#555', 'stroke-width': scale }, svg);
    }
    for (let f = 0; f <= NFRETS; f++) {
      svgEl('line', { x1: X0, y1: Y0 + f * FG, x2: X0 + SG * 5, y2: Y0 + f * FG, stroke: '#888', 'stroke-width': scale }, svg);
    }

    // 指法
    if (frets) {
      for (let s = 0; s < 6; s++) {
        const f = frets[s];
        const x = X0 + s * SG;
        if (f === -1) {
          const t = svgEl('text', { x, y: Y0 - 5 * scale, 'text-anchor': 'middle', 'font-size': 9 * scale, fill: '#333' }, svg);
          t.textContent = '×';
        } else if (f === 0) {
          svgEl('circle', { cx: x, cy: Y0 - 8 * scale, r: 3 * scale, fill: 'none', stroke: '#333', 'stroke-width': scale }, svg);
        } else {
          const row = f - base;            // 0-based 格
          if (row >= 0 && row < NFRETS) {
            const cy = Y0 + row * FG + FG / 2;
            svgEl('circle', { cx: x, cy, r: 4 * scale, fill: '#222' }, svg);
            // 指法代號（T 1 2 3 4）畫在按壓點裡
            const fg = def.fingers && def.fingers[s];
            if (fg) {
              const t = svgEl('text', {
                x, y: cy + 2.4 * scale, 'text-anchor': 'middle',
                'font-size': 6.5 * scale, 'font-weight': 700, fill: '#fff',
              }, svg);
              t.textContent = fg;
            }
          }
        }
      }
      // 同一弦上的額外音（空心圓）
      for (const e of extra) {
        const row = e.f - base;
        if (row >= 0 && row < NFRETS) {
          svgEl('circle', {
            cx: X0 + e.s * SG, cy: Y0 + row * FG + FG / 2, r: 4 * scale,
            fill: '#fff', stroke: '#222', 'stroke-width': 1.4 * scale,
          }, svg);
        }
      }
    } else {
      const t = svgEl('text', { x: W / 2, y: Y0 + FG * 2.5, 'text-anchor': 'middle', 'font-size': 11 * scale, fill: '#aaa' }, svg);
      t.textContent = '?';
    }
    return svg;
  }

  // ================= 指法編輯器 =================
  const ceDlg = $('#chord-editor');
  let ceState = null; // { name, frets:[6], extra:[{s,f}], fingers:[6], base }
  const CE_NFRETS = 5; // 編輯器顯示格數（顯示用圖預設 3 格，編輯時給多一點空間）

  function openChordEditor(name) {
    const cur = Chords.getDef(name, song.defines);
    const frets = cur ? cur.frets.slice() : [-1, -1, -1, -1, -1, -1];
    const extra = cur ? cur.extra.map(x => ({ s: x.s, f: x.f })) : [];
    const fingers = (cur && cur.fingers) ? cur.fingers.slice() : ['', '', '', '', '', ''];
    const allPos = frets.filter(f => f > 0).concat(extra.map(x => x.f));
    const base = allPos.length && Math.max(...allPos) > CE_NFRETS ? Math.min(...allPos) : 1;
    ceState = { name, frets, extra, fingers, base };
    $('#ce-name').value = Chords.displayName(name);
    $('#ce-base').value = base;
    renderCEFingers();
    renderCE();
    ceDlg.showModal();
  }

  // 指法代號輸入欄（低音 E → 高音 E，每弦一格，只收 T / 1～4）
  function renderCEFingers() {
    const wrap = $('#ce-fingers .ce-f-inputs');
    if (!wrap) return;
    wrap.innerHTML = '';
    ['E', 'A', 'D', 'G', 'B', 'E'].forEach((stringName, s) => {
      const inp = document.createElement('input');
      inp.maxLength = 1;
      inp.placeholder = stringName;
      inp.value = ceState.fingers[s] || '';
      inp.addEventListener('input', () => {
        const v = inp.value.toUpperCase().replace(/[^T1-4]/g, '');
        inp.value = v;
        ceState.fingers[s] = v;
        renderCE(); // 圖上的按壓點即時顯示代號
      });
      wrap.appendChild(inp);
    });
  }

  function renderCE() {
    const wrap = $('#ce-svg-wrap');
    wrap.innerHTML = '';
    const scale = 2.4;
    const svg = chordSVG(ceState.name, { frets: ceState.frets, extra: ceState.extra, fingers: ceState.fingers }, scale,
      { base: ceState.base, nFrets: CE_NFRETS });
    // 點擊層
    const SG = 11 * scale, FG = 13 * scale, X0 = 16 * scale, Y0 = 30 * scale;
    for (let s = 0; s < 6; s++) {
      // 琴枕上方：切換 ○ / ×
      const topHit = svgEl('rect', {
        x: X0 + s * SG - SG / 2, y: Y0 - 16 * scale, width: SG, height: 14 * scale,
        fill: 'transparent', cursor: 'pointer',
      }, svg);
      topHit.addEventListener('click', () => {
        ceState.frets[s] = ceState.frets[s] === 0 ? -1 : 0;
        renderCE();
      });
      // 各格：點＝主按壓位置；Shift+點＝同一弦的額外音（空心圓）
      for (let f = 0; f < CE_NFRETS; f++) {
        const hit = svgEl('rect', {
          x: X0 + s * SG - SG / 2, y: Y0 + f * FG, width: SG, height: FG,
          fill: 'transparent', cursor: 'pointer',
        }, svg);
        const absFret = ceState.base + f;
        hit.addEventListener('click', (ev) => {
          if (ev.shiftKey) {
            const k = ceState.extra.findIndex(x => x.s === s && x.f === absFret);
            if (k >= 0) ceState.extra.splice(k, 1);
            else if (ceState.frets[s] !== absFret) ceState.extra.push({ s, f: absFret });
          } else {
            ceState.frets[s] = (ceState.frets[s] === absFret) ? 0 : absFret;
            ceState.extra = ceState.extra.filter(x => !(x.s === s && x.f === absFret));
          }
          renderCE();
        });
      }
    }
    wrap.appendChild(svg);
  }

  $('#ce-base').addEventListener('change', (e) => {
    const nb = Math.max(1, Math.min(15, parseInt(e.target.value, 10) || 1));
    e.target.value = nb;
    // 平移現有按壓位置到新把位視窗
    const shift = nb - ceState.base;
    ceState.frets = ceState.frets.map(f => (f > 0 ? Math.max(1, f + shift) : f));
    ceState.extra = ceState.extra.map(x => ({ s: x.s, f: Math.max(1, x.f + shift) }));
    ceState.base = nb;
    renderCE();
  });
  $('#ce-save').onclick = () => {
    const newName = Chords.normalizeName($('#ce-name').value.trim()) || ceState.name;
    if (newName !== ceState.name) {
      // 改名：整首歌同名和弦一起改
      for (const b of song.blocks) {
        if (b.type !== 'line') continue;
        for (const c of b.chords) if (c.name === ceState.name) c.name = newName;
      }
      delete song.defines[ceState.name];
    }
    const def = { frets: ceState.frets.slice() };
    if (ceState.extra.length) def.extra = ceState.extra.map(x => ({ s: x.s, f: x.f }));
    if (ceState.fingers.some(Boolean)) def.fingers = ceState.fingers.slice();
    song.defines[newName] = def;
    ceDlg.close();
    commit();
  };
  $('#ce-reset').onclick = () => {
    delete song.defines[ceState.name];
    ceDlg.close();
    commit();
  };
  $('#ce-cancel').onclick = () => ceDlg.close();

  // ================= 編輯區 =================
  function buildBlock(b, i) {
    const el = b.type === 'section' ? renderSection(b, i) : renderLine(b, i);
    el.classList.add('block');
    el.dataset.index = i;
    el.appendChild(blockTools(i));
    return el;
  }

  function renderEditor() {
    const ed = $('#editor');
    ed.innerHTML = '';
    song.blocks.forEach((b, i) => ed.appendChild(buildBlock(b, i)));
    fixChipOverlaps(ed);
    decorateEdit();
  }

  // 只重繪單一區塊（打字時用，避免整頁重繪）
  function rerenderBlock(i) {
    const old = $(`#editor .block[data-index="${i}"]`);
    if (!old || !song.blocks[i]) return;
    const nu = buildBlock(song.blocks[i], i);
    old.replaceWith(nu);
    fixChipOverlaps(nu);
    decorateEdit();
  }

  // 相鄰和弦名（或行內指法圖）過長會重疊 → 把前一格加寬，讓下一個往右推
  function fixChipOverlaps(root) {
    const lines = (root.classList && root.classList.contains('line')) ? [root] : $$('.line', root);
    for (const line of lines) {
      for (const sel of ['.chip', '.gridchip']) {
        const chips = $$(sel, line);
        for (let k = 0; k < chips.length - 1; k++) {
          const a = chips[k].getBoundingClientRect();
          const b = chips[k + 1].getBoundingClientRect();
          if (Math.abs(a.top - b.top) < 5 && a.right + 4 > b.left) {
            const cell = chips[k].closest('.cell');
            cell.style.minWidth = (cell.offsetWidth + (a.right + 4 - b.left)) + 'px';
          }
        }
      }
    }
  }

  function blockTools(i) {
    const t = document.createElement('div');
    t.className = 'blocktools';
    const mk = (label, title, fn) => {
      const btn = document.createElement('button');
      btn.textContent = label; btn.title = title;
      btn.onclick = (e) => { e.stopPropagation(); fn(); };
      t.appendChild(btn);
    };
    mk('＋', '在下方插入歌詞行', () => {
      song.blocks.splice(i + 1, 0, { type: 'line', lyrics: '', chords: [] });
      commit();
      editLyricsAt(i + 1);
    });
    mk('§', '在下方插入段落標題', () => {
      song.blocks.splice(i + 1, 0, { type: 'section', name: '段落' });
      commit();
    });
    mk('↑', '上移', () => {
      if (i === 0) return;
      [song.blocks[i - 1], song.blocks[i]] = [song.blocks[i], song.blocks[i - 1]];
      commit();
    });
    mk('↓', '下移', () => {
      if (i >= song.blocks.length - 1) return;
      [song.blocks[i + 1], song.blocks[i]] = [song.blocks[i], song.blocks[i + 1]];
      commit();
    });
    mk('✕', '刪除此行', () => {
      song.blocks.splice(i, 1);
      commit();
    });
    return t;
  }

  // ---- 段落標題 ----
  function renderSection(b, i) {
    const div = document.createElement('div');
    const label = document.createElement('span');
    label.className = 'section-label';
    label.textContent = b.name || '段落';
    label.title = '點擊編輯段落名稱';
    label.onclick = () => {
      const input = document.createElement('input');
      input.value = b.name;
      label.textContent = '';
      label.appendChild(input);
      input.focus(); input.select();
      const done = (ok) => {
        if (ok) b.name = input.value.trim() || '段落';
        commit();
      };
      input.onblur = () => done(true);
      input.onkeydown = (e) => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') { input.onblur = null; done(false); }
      };
    };
    div.appendChild(label);
    return div;
  }

  // 行尾額外可放和弦的空位數（點擊行內空白區域會就近換算，不需要太多佔位格）
  function padExtra(b) { return b.lyrics.length ? 4 : (b.chords.length ? 6 : 16); }

  // ---- 歌詞行（字格模式：每個字＋上方和弦包成一格，過長自動換行） ----
  function renderLine(b, i) {
    const div = document.createElement('div');
    div.className = 'line';
    if (!b.lyrics.trim()) div.classList.add('nolyrics'); // 純和弦行：歌詞列壓縮高度
    const flow = document.createElement('div');
    flow.className = 'flow';
    div.appendChild(flow);

    const maxPos = b.chords.reduce((m, c) => Math.max(m, c.pos), 0);
    const padTo = Math.max(b.lyrics.length, b.chords.length ? maxPos + 1 : 0) + padExtra(b);
    let lineGridH = 0; // 此行行內指法圖的最大高度（0 = 沒有圖）

    // 依位置整理和弦
    const byPos = new Map();
    b.chords.forEach((c, ci) => {
      if (!byPos.has(c.pos)) byPos.set(c.pos, []);
      byPos.get(c.pos).push(ci);
    });

    for (let k = 0; k < padTo; k++) {
      const cell = document.createElement('span');
      cell.className = 'cell';
      cell.dataset.ci = k;

      const slot = document.createElement('span');
      slot.className = 'chips';
      slot.title = '點擊新增和弦／小節線';
      cell.appendChild(slot);

      const isPad = k >= b.lyrics.length;
      const isBar = !isPad && b.lyrics[k] === '|';
      const charSpan = document.createElement('span');
      charSpan.className = 'char' + (isPad ? ' pad' : '') + (isBar ? ' bar' : '');
      charSpan.textContent = isPad ? '·' : b.lyrics[k];
      cell.appendChild(charSpan);

      // 和弦籤／小節線 + 對應字的顏色標示（同格時小節線排前面）
      const chordIdxs = (byPos.get(k) || []).sort((a, c) =>
        ((b.chords[a].name === '|' ? -1 : 0) - (b.chords[c].name === '|' ? -1 : 0)));
      if (chordIdxs.some(ci => b.chords[ci].name !== '|') && !isPad) charSpan.classList.add('anchored');
      let chipOff = 0;
      chordIdxs.forEach((ci) => {
        const isBarChip = b.chords[ci].name === '|';
        const chip = document.createElement('span');
        chip.className = 'chip' + (isBarChip ? ' barline' : '');
        chip.textContent = isBarChip ? '|' : displayChordName(b.chords[ci].name);
        chip.style.left = chipOff + 'px';
        // 此和弦開了「圖示」→ 在和弦名上方放一張小指法圖
        if (!isBarChip && b.chords[ci].grid) {
          const g = document.createElement('span');
          g.className = 'gridchip';
          g.style.left = chipOff + 'px';
          const gsvg = chordSVG(b.chords[ci].name,
            Chords.getDef(b.chords[ci].name, song.defines), VIEW.inline / 100, { noTitle: true });
          g.appendChild(gsvg);
          slot.appendChild(g);
          lineGridH = Math.max(lineGridH, parseFloat(gsvg.getAttribute('height')) || 0);
        }
        chipOff += isBarChip ? 12 : 26;
        chip.title = isBarChip ? '小節線：可拖曳移動；點一下可刪除' : '拖曳移動位置；點一下改名 / 刪除';
        bindChipDrag(chip, i, ci);
        // 滑過和弦／小節線 → 加強顯示綁定的位置
        if (isBarChip) {
          charSpan.classList.add('bar-anchored'); // 歌詞列畫出小節線的綁定位置
          chip.addEventListener('mouseenter', () => charSpan.classList.add('hot-bar'));
          chip.addEventListener('mouseleave', () => charSpan.classList.remove('hot-bar'));
        } else {
          chip.addEventListener('mouseenter', () => charSpan.classList.add('hot'));
          chip.addEventListener('mouseleave', () => charSpan.classList.remove('hot'));
        }
        slot.appendChild(chip);
      });

      flow.appendChild(cell);
    }

    // 行內有指法圖 → 整行和弦槽加高，和弦名往下挪到圖的下方（換行的每段都對齊）
    if (lineGridH) {
      const off = Math.ceil(lineGridH) + 2;
      for (const s of flow.querySelectorAll('.chips')) s.style.height = `calc(var(--chips-h) + ${off}px)`;
      for (const ch of flow.querySelectorAll('.chip')) ch.style.top = off + 'px';
    }

    // 點字 → 游標移到該處直接編輯（preventDefault 保住隱形輸入框的焦點）
    // 點和弦槽 → 新增和弦/小節線
    flow.addEventListener('pointerdown', (e) => {
      if (e.target.classList.contains('char')) {
        e.preventDefault();
        const cell = e.target.parentElement;
        const r = e.target.getBoundingClientRect();
        let ci = parseInt(cell.dataset.ci, 10);
        if (e.clientX > r.left + r.width / 2) ci++; // 點右半邊算下一格，像一般編輯器
        setEdit(i, ci);
      } else if (e.target.classList.contains('chips')) {
        e.preventDefault();
        e.stopPropagation();
        const ci = parseInt(e.target.parentElement.dataset.ci, 10);
        openPopover(e.clientX, e.clientY, { mode: 'add', line: i, pos: ci });
      } else if (e.target === flow) {
        // 點到格子之外的空白區域：就近換算位置（超出最後一格時依寬度外推）
        e.preventDefault();
        const cell = nearestCell(div, e.clientX, e.clientY);
        if (!cell) return;
        const cr = cell.getBoundingClientRect();
        let ci = parseInt(cell.dataset.ci, 10);
        if (e.clientX > cr.right) {
          ci += Math.min(60, Math.round((e.clientX - cr.right) / Math.max(cr.width, 9)) + 1);
        } else if (e.clientX > cr.left + cr.width / 2) ci++;
        if (e.clientY < cr.top + 24) {
          e.stopPropagation();
          openPopover(e.clientX, e.clientY, { mode: 'add', line: i, pos: ci });
        } else {
          setEdit(i, ci);
        }
      }
    });

    return div;
  }

  // 拖曳接近畫面上下緣時自動捲動（iPad 長譜面拖曳用）
  function dragAutoScroll(clientY) {
    const m = 70;
    if (clientY < m) window.scrollBy(0, -14);
    else if (clientY > window.innerHeight - m) window.scrollBy(0, 14);
  }

  // 找指標位置對應的目標格（拖曳用）
  function findDropTarget(x, y, chip) {
    const els = document.elementsFromPoint(x, y).filter(el => el !== chip && !chip.contains(el));
    let cell = els.find(el => el.classList && el.classList.contains('cell'));
    const lineEl = cell ? cell.closest('.line')
      : els.find(el => el.classList && el.classList.contains('line'));
    if (!lineEl) return null;
    if (!cell) cell = nearestCell(lineEl, x, y);
    if (!cell) return null;
    return { line: parseInt(lineEl.dataset.index, 10), ci: parseInt(cell.dataset.ci, 10), cell };
  }

  function nearestCell(lineEl, x, y) {
    let best = null, bestD = Infinity;
    for (const c of lineEl.querySelectorAll('.cell')) {
      const r = c.getBoundingClientRect();
      const dx = Math.max(r.left - x, x - r.right, 0);
      const dy = Math.max(r.top - y, y - r.bottom, 0);
      const d = dy * 4 + dx;
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  // ---- 和弦拖曳 ----
  function bindChipDrag(chip, lineIdx, chordIdx) {
    chip.addEventListener('contextmenu', (e) => e.preventDefault()); // iPad 長按選單
    chip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const startX = e.clientX, startY = e.clientY;
      const rect = chip.getBoundingClientRect();
      // 觸控：和弦上浮到手指上方才看得到；命中點也跟著浮起的位置
      const lift = e.pointerType === 'touch' ? 48 : 0;
      let moved = false;
      let target = null;

      const clearDrop = () => $$('.char.drop').forEach(s => s.classList.remove('drop'));

      const onMove = (ev) => {
        if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 5) return;
        if (!moved) {
          moved = true;
          chip.classList.add('dragging');
          if (lift) chip.classList.add('touch-drag');
          chip.style.position = 'fixed';
        }
        chip.style.left = (rect.left + ev.clientX - startX) + 'px';
        chip.style.top = (rect.top + ev.clientY - startY - lift) + 'px';
        dragAutoScroll(ev.clientY);
        const drop = findDropTarget(ev.clientX, ev.clientY - lift, chip);
        clearDrop();
        if (drop) {
          target = drop;
          const charEl = drop.cell.querySelector('.char');
          if (charEl) charEl.classList.add('drop');
        }
      };

      const onUp = (ev) => {
        try { chip.releasePointerCapture(e.pointerId); } catch (_) {}
        chip.removeEventListener('pointermove', onMove);
        chip.removeEventListener('pointerup', onUp);
        chip.removeEventListener('pointercancel', onUp);
        clearDrop();
        if (!moved) {
          // 視為點擊 → 開啟編輯
          openPopover(ev.clientX, ev.clientY, { mode: 'edit', line: lineIdx, chord: chordIdx });
          return;
        }
        if (target) {
          const src = song.blocks[lineIdx];
          const chord = src.chords[chordIdx];
          if (target.line === lineIdx) {
            chord.pos = target.ci;
          } else {
            src.chords.splice(chordIdx, 1);
            song.blocks[target.line].chords.push({ pos: target.ci, name: chord.name });
          }
        }
        commit(); // 重繪會還原拖曳中的樣式
      };

      try { chip.setPointerCapture(e.pointerId); } catch (_) {}
      chip.addEventListener('pointermove', onMove);
      chip.addEventListener('pointerup', onUp);
      chip.addEventListener('pointercancel', onUp);
    });
  }

  // ---- 歌詞行內編輯（所見即所得：隱形輸入框 + 即時渲染） ----
  // 游標直接顯示在譜面上，打字即時更新，和弦全程可見並跟著字移動。
  // Enter 拆行；行首 Backspace / 行尾 Delete 併行；↑↓ 移到上下行；Esc 還原本行。
  let editState = null; // { line, snapshot:{lyrics, chords} }
  const ghost = document.createElement('textarea');
  ghost.id = 'ghost-input';
  ghost.autocomplete = 'off';
  ghost.spellcheck = false;
  ghost.setAttribute('autocapitalize', 'off');
  ghost.setAttribute('aria-hidden', 'true');
  document.body.appendChild(ghost);

  function setEdit(i, caret) {
    const b = song.blocks[i];
    if (!b || b.type !== 'line') return;
    const prevLine = editState ? editState.line : null;
    editState = { line: i, snapshot: { lyrics: b.lyrics, chords: b.chords.map(c => ({ ...c })) } };
    const cp = Math.max(0, caret == null ? b.lyrics.length : caret);
    // 點到行尾之後（例如純和弦行）→ 自動補空白，游標就能停在點擊處
    if (cp > b.lyrics.length) b.lyrics = b.lyrics.padEnd(cp, ' ');
    ghost.value = b.lyrics;
    ghost.focus({ preventScroll: true });
    ghost.setSelectionRange(cp, cp);
    if (prevLine != null && prevLine !== i) rerenderBlock(prevLine);
    decorateEdit();
  }

  function endEdit() {
    if (!editState) return;
    const i = editState.line;
    editState = null;
    const b = song.blocks[i];
    if (b && b.type === 'line') b.lyrics = b.lyrics.replace(/\s+$/, '');
    persist();
    rerenderBlock(i);
  }

  // 游標／選取範圍畫到譜面上；隱形輸入框跟著游標走（中文輸入法候選窗才會出現在正確位置）
  function decorateEdit() {
    $$('#editor .cell.sel, #editor .cell.caret-here').forEach(c => c.classList.remove('sel', 'caret-here'));
    $$('#editor .line.editing').forEach(l => l.classList.remove('editing'));
    if (!editState) return;
    const lineEl = $(`#editor .block[data-index="${editState.line}"]`);
    if (!lineEl) return;
    lineEl.classList.add('editing');
    const cells = $$('.cell', lineEl);
    const a = Math.min(ghost.selectionStart, ghost.selectionEnd);
    const z = Math.max(ghost.selectionStart, ghost.selectionEnd);
    for (let k = a; k < z && k < cells.length; k++) cells[k].classList.add('sel');
    const cc = cells[Math.min(a, cells.length - 1)];
    if (cc) {
      if (a === z) cc.classList.add('caret-here');
      const r = cc.getBoundingClientRect();
      ghost.style.left = r.left + 'px';
      ghost.style.top = Math.max(0, r.bottom - 26) + 'px';
    }
  }

  ghost.addEventListener('blur', endEdit);

  document.addEventListener('selectionchange', () => {
    if (editState && document.activeElement === ghost) decorateEdit();
  });

  ghost.addEventListener('input', () => {
    if (!editState) return;
    const i = editState.line;
    const b = song.blocks[i];
    // 優先用游標位置判定插入/刪除點（連續空白等相同字元時，純比對會誤判位置）
    if (!remapWithCaret(b, b.lyrics, ghost.value, ghost.selectionStart)) {
      remapChordPositions(b, b.lyrics, ghost.value);
    }
    b.lyrics = ghost.value;
    if (b.lyrics.includes('\n')) {
      // Enter 或貼上多行 → 拆行後游標移到對應的新行
      const caretPos = ghost.selectionStart;
      const parts = b.lyrics.split('\n');
      splitLineBlock(i);
      editState = null;
      persist();
      renderAll();
      let st = 0, k = 0;
      while (k < parts.length - 1 && caretPos > st + parts[k].length) { st += parts[k].length + 1; k++; }
      setEdit(i + k, caretPos - st);
    } else {
      persist();
      rerenderBlock(i);
    }
  });

  ghost.addEventListener('keydown', (e) => {
    if (!editState || e.isComposing) return;
    const i = editState.line;
    const v = ghost.value, s = ghost.selectionStart, z = ghost.selectionEnd;
    if (e.key === 'Escape') {
      const b = song.blocks[i];
      b.lyrics = editState.snapshot.lyrics;
      b.chords = editState.snapshot.chords;
      editState = null;
      persist();
      rerenderBlock(i);
      ghost.blur();
    } else if (e.key === 'Backspace' && s === 0 && z === 0
               && i > 0 && song.blocks[i - 1].type === 'line') {
      e.preventDefault();
      mergeLineUp(i);
    } else if (e.key === 'Delete' && s === v.length && z === v.length
               && song.blocks[i + 1] && song.blocks[i + 1].type === 'line') {
      e.preventDefault();
      mergeNextDown(i);
    } else if (e.key === '|') {
      // 編輯歌詞時直接打「|」→ 在游標位置的和弦列加小節線
      e.preventDefault();
      song.blocks[i].chords.push({ pos: s, name: '|' });
      persist();
      rerenderBlock(i);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const p = prevLineIdx(i);
      if (p != null) setEdit(p, Math.min(s, song.blocks[p].lyrics.length));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const n = nextLineIdx(i + 1);
      if (n != null) setEdit(n, Math.min(s, song.blocks[n].lyrics.length));
    }
    // Enter 不攔截：textarea 插入換行 → input 事件處理拆行
  });

  function prevLineIdx(i) {
    for (let k = i - 1; k >= 0; k--) if (song.blocks[k].type === 'line') return k;
    return null;
  }
  function nextLineIdx(from) {
    for (let k = from; k < song.blocks.length; k++) if (song.blocks[k].type === 'line') return k;
    return null;
  }
  // 歌詞含換行 → 拆成多個行區塊，和弦依位置分配；回傳拆出的行數
  function splitLineBlock(i) {
    const b = song.blocks[i];
    if (!b.lyrics.includes('\n')) {
      for (const c of b.chords) c.pos = Math.max(0, Math.min(c.pos, b.lyrics.length + padExtra(b) - 1));
      return 1;
    }
    const parts = b.lyrics.split('\n');
    const bounds = [];
    let s = 0;
    for (const p of parts) { bounds.push({ st: s, en: s + p.length }); s += p.length + 1; }
    const newBlocks = parts.map(p => ({ type: 'line', lyrics: p, chords: [] }));
    for (const c of [...b.chords].sort((a, x) => a.pos - x.pos)) {
      let k = bounds.findIndex(bd => c.pos <= bd.en);
      if (k < 0) k = parts.length - 1;
      newBlocks[k].chords.push({ pos: Math.max(0, c.pos - bounds[k].st), name: c.name });
    }
    song.blocks.splice(i, 1, ...newBlocks);
    return parts.length;
  }

  // 行尾 Delete：把下一行併上來（游標停在接縫處）
  function mergeNextDown(i) {
    const b = song.blocks[i];
    const nxt = song.blocks[i + 1];
    const off = b.lyrics.length;
    for (const c of nxt.chords) b.chords.push({ pos: c.pos + off, name: c.name });
    b.lyrics = b.lyrics + nxt.lyrics;
    song.blocks.splice(i + 1, 1);
    editState = null;
    persist();
    renderAll();
    setEdit(i, off);
  }

  // 行首 Backspace：與上一行合併（游標停在接縫處）
  function mergeLineUp(i) {
    const prev = song.blocks[i - 1];
    const b = song.blocks[i];
    const off = prev.lyrics.length;
    for (const c of b.chords) prev.chords.push({ pos: c.pos + off, name: c.name });
    prev.lyrics = prev.lyrics + b.lyrics;
    song.blocks.splice(i, 1);
    editState = null;
    persist();
    renderAll();
    setEdit(i - 1, off);
  }

  // 用游標位置精確判定純插入/純刪除，據此移動和弦與小節線。
  // 處理不了的情況（如輸入法整段替換）回傳 false，交給 remapChordPositions。
  function remapWithCaret(b, oldS, newS, caret) {
    const delta = newS.length - oldS.length;
    if (delta > 0) {
      const q = caret - delta; // 插入起點
      if (q >= 0 && newS.slice(0, q) === oldS.slice(0, q) && newS.slice(caret) === oldS.slice(q)) {
        // 純插入：插入點（含）之後的和弦與小節線都右移——和弦跟著被綁定的字走
        for (const c of b.chords) {
          if (c.pos >= q) c.pos += delta;
        }
        return true;
      }
    } else if (delta < 0) {
      const d = -delta;
      if (newS.slice(0, caret) === oldS.slice(0, caret) && newS.slice(caret) === oldS.slice(caret + d)) {
        // 純刪除：刪除區之後的標記左移，刪除區內的收到刪除點
        for (const c of b.chords) {
          if (c.pos >= caret + d) c.pos += delta;
          else if (c.pos > caret) c.pos = caret;
        }
        return true;
      }
    }
    return false;
  }

  // 歌詞變更時，讓和弦跟著原本的字移動：
  // 比對共同前綴/後綴，後綴區的和弦隨長度差平移，被改掉的區段夾在範圍內
  function remapChordPositions(b, oldS, newS) {
    if (oldS === newS || !b.chords.length) return;
    const maxP = Math.min(oldS.length, newS.length);
    let p = 0;
    while (p < maxP && oldS[p] === newS[p]) p++;
    let s = 0;
    while (s < maxP - p && oldS[oldS.length - 1 - s] === newS[newS.length - 1 - s]) s++;
    const delta = newS.length - oldS.length;
    for (const c of b.chords) {
      if (c.pos >= oldS.length - s) c.pos = Math.max(0, c.pos + delta); // 後段：跟著字平移
      else if (c.pos > p) c.pos = Math.min(Math.max(c.pos, p), Math.max(p, newS.length - s)); // 被改掉的區段
      // c.pos <= p：前段不動
    }
  }

  // 在指定位置加小節線（顯示在和弦列上）
  function insertBarline(lineIdx, pos) {
    song.blocks[lineIdx].chords.push({ pos, name: '|' });
  }

  function editLyricsAt(i) {
    setEdit(i, 0);
  }

  // ================= 和弦浮動視窗 =================
  const pop = $('#popover');
  let popCtx = null;

  function fillChordDatalist() {
    const dl = $('#chord-list');
    dl.innerHTML = '';
    const seen = new Set();
    for (const n of Chords.SUGGESTIONS) {
      for (const v of [Chords.displayName(n), n]) { // 兩種寫法都提示（#C 與 C#）
        if (seen.has(v)) continue;
        seen.add(v);
        const o = document.createElement('option');
        o.value = v;
        dl.appendChild(o);
      }
    }
  }

  function openPopover(x, y, ctx) {
    popCtx = ctx;
    const input = $('#pop-input');
    const isEdit = ctx.mode === 'edit';
    const editName = isEdit ? song.blocks[ctx.line].chords[ctx.chord].name : '';
    input.value = isEdit ? Chords.displayName(editName) : '';
    input.placeholder = isEdit ? '和弦名或級數' : '和弦名或級數（| = 小節線）';
    $('#pop-edit-shape').style.display = (isEdit && editName !== '|') ? '' : 'none';
    $('#pop-del').style.display = isEdit ? '' : 'none';
    if ($('#pop-bar')) $('#pop-bar').style.display = isEdit ? 'none' : '';
    const gbtn = $('#pop-grid');
    if (gbtn) {
      const showG = isEdit && editName !== '|';
      gbtn.style.display = showG ? '' : 'none';
      if (showG) gbtn.textContent = song.blocks[ctx.line].chords[ctx.chord].grid ? '隱藏圖示' : '顯示圖示';
    }
    pop.classList.add('show');
    const pw = pop.offsetWidth || 140;
    pop.style.left = Math.min(x, window.innerWidth - pw - 12) + window.scrollX + 'px';
    pop.style.top = (y + 10 + window.scrollY) + 'px';
    input.focus();
    input.select();
  }

  function closePopover() { pop.classList.remove('show'); popCtx = null; }

  // 輸入框內容 → 和弦名：開頭是 1～7（可帶 #/b）視為級數，以 Play（其次 Key）換算
  function inputToChordName(raw) {
    if (!raw) return '';
    if (/^[#b♯♭]?[1-7]/.test(raw)) {
      const byDeg = Chords.nameFromDegree(raw, song.meta.play || song.meta.key || 'C');
      if (byDeg) return byDeg;
    }
    return Chords.normalizeName(raw);
  }

  function popCommit() {
    if (!popCtx) return;
    const name = inputToChordName($('#pop-input').value.trim());
    const b = song.blocks[popCtx.line];
    if (popCtx.mode === 'add') {
      if (name === '|') insertBarline(popCtx.line, popCtx.pos);
      else if (name) b.chords.push({ pos: popCtx.pos, name });
    } else {
      if (name) b.chords[popCtx.chord].name = name;
      else b.chords.splice(popCtx.chord, 1);
    }
    closePopover();
    commit();
  }

  $('#pop-ok').onclick = popCommit;
  if ($('#pop-bar')) $('#pop-bar').onclick = () => {
    if (popCtx && popCtx.mode === 'add') insertBarline(popCtx.line, popCtx.pos);
    closePopover();
    commit();
  };
  $('#pop-del').onclick = () => {
    if (popCtx && popCtx.mode === 'edit') song.blocks[popCtx.line].chords.splice(popCtx.chord, 1);
    closePopover();
    commit();
  };
  if ($('#pop-grid')) $('#pop-grid').onclick = () => {
    if (popCtx && popCtx.mode === 'edit') {
      const c = song.blocks[popCtx.line].chords[popCtx.chord];
      c.grid = !c.grid;
      if (!c.grid) delete c.grid;
    }
    closePopover();
    commit();
  };
  $('#pop-edit-shape').onclick = () => {
    const name = popCtx && song.blocks[popCtx.line].chords[popCtx.chord].name;
    closePopover();
    if (name) openChordEditor(name);
  };
  $('#pop-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') popCommit();
    if (e.key === 'Escape') closePopover();
  });
  document.addEventListener('pointerdown', (e) => {
    if (pop.classList.contains('show') && !pop.contains(e.target)) closePopover();
  });

  // ================= 原始碼 =================
  function openSource() {
    $('#source-text').value = ChordPro.serialize(song);
    $('#source-dlg').showModal();
  }
  $('#src-close').onclick = () => $('#source-dlg').close();
  $('#src-apply').onclick = () => {
    song = ChordPro.parse($('#source-text').value);
    $('#source-dlg').close();
    commit();
  };

  boot();
})();
