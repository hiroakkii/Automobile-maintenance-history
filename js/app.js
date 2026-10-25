(function () {
  'use strict';

  const A = window.Analysis;
  const STORAGE_KEY = 'car-maintenance-history:v1';

  const VEHICLE_FIELDS = [
    ['name', '車名'],
    ['maker', 'メーカー'],
    ['model', '型式'],
    ['firstRegistration', '初度登録年月'],
    ['plate', '登録番号'],
    ['vin', '車台番号'],
    ['engine', '原動機の型式'],
    ['purchaseDate', '購入日'],
    ['purchaseOdometer', '購入時走行距離 (km)'],
    ['inspectionExpiry', '車検満了日'],
    ['memo', 'メモ'],
  ];

  const NUMBER_FIELDS = new Set(['odometer', 'partsCost', 'laborCost']);

  const PRESET_CONTENTS = [
    'エンジンオイル交換',
    'オイルエレメント交換',
    'タイヤ交換',
    'タイヤローテーション',
    '車検',
    '12ヶ月点検',
    'バッテリー交換',
    'ブレーキパッド交換',
    'ブレーキフルード交換',
    'ワイパーゴム交換',
    'エアコンフィルター交換',
    'エアクリーナー交換',
    'スパークプラグ交換',
    'LLC（冷却水）交換',
    'ATF/CVTF交換',
  ];

  const $ = (sel) => document.querySelector(sel);

  // ---------- 状態 ----------
  let state = load();
  let sort = { key: 'date', dir: 'desc' };
  let filter = '';

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function newVehicle() {
    return { id: uid(), info: {}, records: [] };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && Array.isArray(data.vehicles) && data.vehicles.length) return data;
      }
    } catch (e) {
      console.warn('保存データの読み込みに失敗しました', e);
    }
    const v = newVehicle();
    return { vehicles: [v], currentId: v.id };
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      alert('データを保存できませんでした: ' + e.message);
    }
  }

  function current() {
    return state.vehicles.find((v) => v.id === state.currentId) || state.vehicles[0];
  }

  function vehicleLabel(v, i) {
    const name = [v.info.maker, v.info.name].filter(Boolean).join(' ');
    return name || '車両 ' + (i + 1);
  }

  // ---------- 表示ユーティリティ ----------
  const yen = (n) => (n === null || n === undefined ? '' : Math.round(n).toLocaleString('ja-JP'));
  const km = (n) => (n === null || n === undefined ? '' : Math.round(n).toLocaleString('ja-JP'));

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.entries(attrs).forEach(([k, v]) => {
        if (k === 'text') node.textContent = v;
        else if (k === 'className') node.className = v;
        else node.setAttribute(k, v);
      });
    }
    (children || []).forEach((c) => node.append(c));
    return node;
  }

  // ---------- 車両 ----------
  function renderVehicleSelect() {
    const sel = $('#vehicleSelect');
    sel.innerHTML = '';
    state.vehicles.forEach((v, i) => {
      sel.append(el('option', { value: v.id, text: vehicleLabel(v, i) }));
    });
    sel.value = current().id;
    $('#deleteVehicleBtn').disabled = state.vehicles.length <= 1;
  }

  function renderVehicleForm() {
    const info = current().info;
    const form = $('#vehicleForm');
    VEHICLE_FIELDS.forEach(([key]) => {
      form.elements[key].value = info[key] ?? '';
    });
    // 入力済みの車両は編集欄を閉じて、履歴を見やすくする
    document.querySelector('.vehicle-edit').open = !(info.name || info.plate);
    renderVehicleSummary();
  }

  // 上段のナンバープレート風表示と要約
  function renderVehicleSummary() {
    const v = current();
    const info = v.info;
    const parts = (info.plate || '').trim().split(/\s+/).filter(Boolean);
    const plate = $('#plateView');
    // 「品川 300 あ 12-34」の形なら 2 段に分ける
    const region = parts.length >= 4 ? parts.slice(0, 2).join(' ') : '';
    const serial = parts.length >= 4 ? parts.slice(2).join(' ') : parts.join(' ');
    plate.querySelector('.plate-region').textContent = region;
    plate.querySelector('.plate-serial').textContent = serial || '登録番号 未入力';
    plate.classList.toggle('is-empty', !serial);
    plate.setAttribute('aria-label', '登録番号 ' + (parts.join(' ') || '未入力'));

    const title = [info.maker, info.name].filter(Boolean).join(' ');
    $('#vehicleTitle').textContent = title || '車両情報を入力してください';
    $('#factModel').textContent = info.model || '—';
    $('#factFirstReg').textContent = info.firstRegistration ? info.firstRegistration.replace('-', '年') + '月' : '—';

    const exp = $('#factInspection');
    exp.className = '';
    exp.textContent = '—';
    if (info.inspectionExpiry) {
      const left = A.daysBetween(today(), info.inspectionExpiry);
      let note = '';
      if (left !== null) {
        if (left < 0) { note = `（${-left}日超過）`; exp.className = 'alert'; }
        else if (left <= 60) { note = `（あと${left}日）`; exp.className = 'alert'; }
        else note = `（あと${left}日）`;
      }
      exp.textContent = info.inspectionExpiry.replace(/-/g, '/') + note;
    }
  }

  $('#vehicleForm').addEventListener('input', (e) => {
    const name = e.target.name;
    if (!name) return;
    current().info[name] = e.target.value;
    save();
    if (name === 'name' || name === 'maker') renderVehicleSelect();
    renderVehicleSummary();
  });

  $('#vehicleSelect').addEventListener('change', (e) => {
    state.currentId = e.target.value;
    filter = '';
    save();
    renderAll();
  });

  $('#addVehicleBtn').addEventListener('click', () => {
    const v = newVehicle();
    state.vehicles.push(v);
    state.currentId = v.id;
    filter = '';
    save();
    renderAll();
    $('#vehicleForm').elements.name.focus();
  });

  $('#deleteVehicleBtn').addEventListener('click', () => {
    if (state.vehicles.length <= 1) return;
    const v = current();
    const label = vehicleLabel(v, state.vehicles.indexOf(v));
    if (!confirm(`「${label}」と、そのメンテナンス履歴 ${v.records.length} 件を削除します。よろしいですか？`)) return;
    state.vehicles = state.vehicles.filter((x) => x.id !== v.id);
    state.currentId = state.vehicles[0].id;
    save();
    renderAll();
  });

  // ---------- メンテナンス履歴 ----------
  function visibleRecords() {
    const recs = current().records.filter((r) => !filter || (r.content || '').trim() === filter);
    return A.sortRecords(recs, sort.key, sort.dir);
  }

  function renderContentOptions() {
    const contents = A.uniqueContents(current().records);

    inputPickers.content.setOptions(contentOptions());
    refreshInputParts();

    const fsel = $('#filterContent');
    fsel.innerHTML = '';
    fsel.append(el('option', { value: '', text: '（すべて）' }));
    contents.forEach((c) => fsel.append(el('option', { value: c, text: c })));
    if (filter && !contents.includes(filter)) filter = '';
    fsel.value = filter;

    const isel = $('#intervalContent');
    const prev = isel.value;
    isel.innerHTML = '';
    if (!contents.length) isel.append(el('option', { value: '', text: '（記録がありません）' }));
    contents.forEach((c) => isel.append(el('option', { value: c, text: c })));
    if (contents.includes(prev)) isel.value = prev;
  }

  // リスト選択 + 手入力の部品。値は getValue()/setValue() で扱う
  const MANUAL = '__manual__';

  function createPicker(field, placeholder) {
    const wrap = el('div', { className: 'picker', 'data-f': field });
    const select = el('select');
    const input = el('input', { type: 'text', placeholder, className: 'picker-manual' });
    let options = [];
    let manual = false;

    function build() {
      select.innerHTML = '';
      select.append(el('option', { value: '', text: '（選択）' }));
      options.forEach((o) => select.append(el('option', { value: o, text: o })));
      select.append(el('option', { value: MANUAL, text: '✎ 手入力…' }));
    }

    function sync() {
      select.value = manual ? MANUAL : (select.querySelector(`option[value="${CSS.escape(wrap.pending ?? '')}"]`) ? wrap.pending : '');
      input.hidden = !manual;
    }

    wrap.getValue = () => (manual ? input.value.trim() : select.value);
    wrap.isManual = () => manual;
    wrap.setValue = (v) => {
      v = v || '';
      manual = !!v && !options.includes(v);
      wrap.pending = manual ? '' : v;
      input.value = manual ? v : '';
      sync();
    };
    wrap.setOptions = (list) => {
      const cur = wrap.getValue();
      const wasManual = manual;
      options = list.slice();
      build();
      wrap.setValue(wasManual ? cur : (options.includes(cur) ? cur : ''));
    };

    select.addEventListener('change', () => {
      manual = select.value === MANUAL;
      wrap.pending = manual ? '' : select.value;
      input.hidden = !manual;
      if (manual) input.focus();
    });

    wrap.append(select, input);
    build();
    sync();
    return wrap;
  }

  function contentOptions() {
    return Array.from(new Set(A.uniqueContents(current().records).concat(PRESET_CONTENTS)));
  }

  function partsOptions(content, extra) {
    const list = A.partsFor(current().records, content);
    if (extra && !list.includes(extra)) list.push(extra);
    return list;
  }

  const inputPickers = {
    content: createPicker('content', '内容を入力'),
    parts: createPicker('parts', '部品を入力'),
  };
  document.querySelector('#inputRow [data-slot="content"]').append(inputPickers.content);
  document.querySelector('#inputRow [data-slot="parts"]').append(inputPickers.parts);

  function refreshInputParts() {
    inputPickers.parts.setOptions(partsOptions(inputPickers.content.getValue()));
  }

  inputPickers.content.addEventListener('change', refreshInputParts);

  function cellPicker(record, field) {
    const picker = createPicker(field, field === 'content' ? '内容を入力' : '部品を入力');
    picker.setOptions(field === 'content'
      ? contentOptions().concat(record.content && !contentOptions().includes(record.content) ? [record.content] : [])
      : partsOptions(record.content, record.parts));
    picker.setValue(record[field] || '');
    return el('td', null, [picker]);
  }

  function cellInput(record, field) {
    const attrs = { 'data-f': field };
    if (field === 'date') attrs.type = 'date';
    else if (NUMBER_FIELDS.has(field)) Object.assign(attrs, { type: 'number', min: '0', step: '1' });
    const input = el('input', attrs);
    input.value = record[field] ?? '';
    return el('td', null, [input]);
  }

  function renderRecords() {
    const body = $('#recordBody');
    body.innerHTML = '';
    const recs = visibleRecords();

    recs.forEach((r) => {
      const tr = el('tr', { 'data-id': r.id });
      tr.append(cellInput(r, 'date'), cellInput(r, 'odometer'), cellPicker(r, 'content'), cellPicker(r, 'parts'),
        cellInput(r, 'partsCost'), cellInput(r, 'laborCost'));
      tr.append(el('td', { className: 'num total', text: yen(A.recordTotal(r)) }));
      tr.append(cellInput(r, 'note'));
      tr.append(el('td', null, [el('button', { type: 'button', className: 'danger small', 'data-action': 'delete', text: '削除' })]));
      body.append(tr);
    });

    if (!recs.length) {
      body.append(el('tr', { className: 'empty' }, [
        el('td', { colspan: '9', text: current().records.length ? '該当する記録がありません。' : 'まだ記録がありません。上の行に入力して「追加」を押してください。' }),
      ]));
    }

    renderTotals(recs);
    renderSortIndicators();
  }

  function renderTotals(recs) {
    const parts = recs.reduce((s, r) => s + (A.toNumber(r.partsCost) || 0), 0);
    const labor = recs.reduce((s, r) => s + (A.toNumber(r.laborCost) || 0), 0);
    $('#rowCount').textContent = recs.length;
    $('#sumParts').textContent = yen(parts);
    $('#sumLabor').textContent = yen(labor);
    $('#sumTotal').textContent = yen(parts + labor);
  }

  function renderSortIndicators() {
    document.querySelectorAll('#recordTable th[data-sort]').forEach((th) => {
      th.classList.toggle('sorted-asc', th.dataset.sort === sort.key && sort.dir === 'asc');
      th.classList.toggle('sorted-desc', th.dataset.sort === sort.key && sort.dir === 'desc');
    });
    const opt = sort.key + ':' + sort.dir;
    const sel = $('#sortSelect');
    sel.value = Array.from(sel.options).some((o) => o.value === opt) ? opt : '';
  }

  // 既存行の編集
  $('#recordBody').addEventListener('change', (e) => {
    const input = e.target.closest('[data-f]');
    const tr = input && input.closest('tr[data-id]');
    if (!tr) return;
    const rec = current().records.find((r) => r.id === tr.dataset.id);
    if (!rec) return;
    const field = input.dataset.f;
    const value = input.getValue ? input.getValue() : (field === 'content' ? input.value.trim() : input.value);
    // 「手入力」を選んだだけで未入力の間は保存しない
    if (input.isManual && input.isManual() && !value) return;
    if (field === 'content' && !value) {
      renderRecords();
      return;
    }
    rec[field] = value;
    save();
    tr.querySelector('.total').textContent = yen(A.recordTotal(rec));
    renderTotals(visibleRecords());
    if (field === 'content') {
      renderContentOptions();
      // この行の部品リストを新しい内容に合わせる
      const partsPicker = tr.querySelector('.picker[data-f="parts"]');
      partsPicker.setOptions(partsOptions(rec.content, rec.parts));
      partsPicker.setValue(rec.parts || '');
    }
    renderAnalysis();
  });

  $('#recordBody').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action="delete"]');
    if (!btn) return;
    const id = btn.closest('tr').dataset.id;
    const rec = current().records.find((r) => r.id === id);
    if (!confirm(`${rec.date || '日付なし'}「${rec.content || ''}」の記録を削除しますか？`)) return;
    current().records = current().records.filter((r) => r.id !== id);
    save();
    renderContentOptions();
    renderRecords();
    renderAnalysis();
  });

  // 新規入力行
  const inputRow = $('#inputRow');

  function readInputRow() {
    const rec = {};
    inputRow.querySelectorAll('[data-f]').forEach((i) => {
      rec[i.dataset.f] = i.getValue ? i.getValue() : i.value;
    });
    return rec;
  }

  inputRow.addEventListener('input', () => {
    $('#inputTotal').textContent = yen(A.recordTotal(readInputRow()));
  });

  inputRow.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
      e.preventDefault();
      addRecord();
    }
  });

  $('#addRecordBtn').addEventListener('click', addRecord);

  function addRecord() {
    const rec = readInputRow();
    if (!rec.date) {
      alert('日付を入力してください。');
      inputRow.querySelector('[data-f="date"]').focus();
      return;
    }
    if (!rec.content) {
      alert('メンテナンス内容を選択または入力してください。');
      inputRow.querySelector('[data-f="content"] select').focus();
      return;
    }
    rec.id = uid();
    current().records.push(rec);
    save();
    inputRow.querySelectorAll('[data-f]').forEach((i) => {
      if (i.dataset.f === 'date') return;
      if (i.setValue) i.setValue('');
      else i.value = '';
    });
    $('#inputTotal').textContent = '0';
    renderContentOptions();
    renderRecords();
    renderAnalysis();
    inputRow.querySelector('[data-f="odometer"]').focus();
  }

  // 並び替え・絞り込み
  document.querySelectorAll('#recordTable th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (sort.key === key) sort.dir = sort.dir === 'asc' ? 'desc' : 'asc';
      else sort = { key, dir: key === 'date' ? 'desc' : 'asc' };
      renderRecords();
    });
  });

  $('#sortSelect').addEventListener('change', (e) => {
    const [key, dir] = e.target.value.split(':');
    sort = { key, dir };
    renderRecords();
  });

  $('#filterContent').addEventListener('change', (e) => {
    filter = e.target.value;
    renderRecords();
  });

  // ---------- 間隔分析 ----------
  function today() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function renderIntervalDetail() {
    const box = $('#intervalDetail');
    box.innerHTML = '';
    const content = $('#intervalContent').value;
    if (!content) return;
    const info = A.intervalsFor(current().records, content);

    const stats = el('div', { className: 'stats' });
    const stat = (label, value) => stats.append(el('div', { className: 'stat' }, [
      el('span', { className: 'stat-label', text: label }),
      el('span', { className: 'stat-value', text: value || '—' }),
    ]));
    stat('実施回数', info.count + '回');
    stat('平均間隔（期間）', A.formatDays(info.avgDays));
    stat('平均間隔（距離）', info.avgDistance !== null ? km(info.avgDistance) + ' km' : '');
    stat('最短 / 最長（期間）', info.minDays !== null ? `${info.minDays}日 / ${info.maxDays}日` : '');
    stat('最短 / 最長（距離）', info.minDistance !== null ? `${km(info.minDistance)} / ${km(info.maxDistance)} km` : '');
    stat('費用合計', yen(info.totalCost) + ' 円');
    box.append(stats);

    const table = el('table', { className: 'interval-table' });
    table.append(el('thead', null, [el('tr', null,
      ['#', '日付', '走行距離 (km)', '前回からの期間', '日数', '前回からの距離 (km)', '使用部品', '合計 (円)']
        .map((h) => el('th', { text: h })))]));
    const tb = el('tbody');
    info.rows.forEach((row, i) => {
      const r = row.record;
      tb.append(el('tr', null, [
        el('td', { className: 'num', text: String(i + 1) }),
        el('td', { text: r.date || '' }),
        el('td', { className: 'num', text: km(A.toNumber(r.odometer)) }),
        el('td', { text: i === 0 ? '（初回）' : row.period }),
        el('td', { className: 'num', text: row.days !== null ? row.days + '日' : '' }),
        el('td', { className: 'num', text: row.distance !== null ? km(row.distance) : '' }),
        el('td', { text: r.parts || '' }),
        el('td', { className: 'num', text: yen(A.recordTotal(r)) }),
      ]));
    });
    table.append(tb);
    box.append(el('div', { className: 'table-wrap' }, [table]));
  }

  function renderSummary() {
    const body = $('#summaryBody');
    body.innerHTML = '';
    const rows = A.summarize(current().records, today());
    if (!rows.length) {
      body.append(el('tr', { className: 'empty' }, [el('td', { colspan: '8', text: 'まだ記録がありません。' })]));
      return;
    }
    rows.forEach((s) => {
      const since = [s.sincePeriod, s.sinceDistance !== null ? km(s.sinceDistance) + ' km' : '']
        .filter(Boolean).join(' / ');
      const tr = el('tr', null, [
        el('td', null, [el('a', { href: '#intervalDetail', 'data-content': s.content, text: s.content })]),
        el('td', { className: 'num', text: s.count + '回' }),
        el('td', { text: s.last.date || '' }),
        el('td', { className: 'num', text: km(A.toNumber(s.last.odometer)) }),
        el('td', { text: A.formatDays(s.avgDays) }),
        el('td', { className: 'num', text: s.avgDistance !== null ? km(s.avgDistance) : '' }),
        el('td', { text: since }),
        el('td', { className: 'num', text: yen(s.totalCost) }),
      ]);
      body.append(tr);
    });
  }

  $('#summaryBody').addEventListener('click', (e) => {
    const a = e.target.closest('a[data-content]');
    if (!a) return;
    $('#intervalContent').value = a.dataset.content;
    renderIntervalDetail();
  });

  $('#intervalContent').addEventListener('change', renderIntervalDetail);

  function renderAnalysis() {
    renderIntervalDetail();
    renderSummary();
  }

  // ---------- Excel 出力 ----------
  function toExcelDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : (s || '');
  }

  function numOrBlank(v) {
    const n = A.toNumber(v);
    return n === null ? '' : n;
  }

  function applyFormats(ws, { dateCols = [], numCols = [], fromRow = 0 }) {
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = fromRow; R <= range.e.r; R++) {
      dateCols.forEach((C) => {
        const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
        if (cell && cell.t === 'd') cell.z = 'yyyy/mm/dd';
      });
      numCols.forEach((C) => {
        const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
        if (cell && cell.t === 'n') cell.z = '#,##0';
      });
    }
  }

  function exportExcel() {
    if (typeof XLSX === 'undefined') {
      alert('Excel出力ライブラリ（vendor/xlsx.full.min.js）を読み込めませんでした。');
      return;
    }
    const v = current();
    const label = vehicleLabel(v, state.vehicles.indexOf(v));
    const wb = XLSX.utils.book_new();

    // シート1: 車両情報 + メンテナンス一覧（画面の並び順・絞り込みのまま）
    const aoa = [['自動車メンテナンス履歴'], []];
    VEHICLE_FIELDS.forEach(([key, name]) => {
      let val = v.info[key] ?? '';
      if (key === 'purchaseOdometer') val = numOrBlank(val);
      else if (key === 'purchaseDate' || key === 'inspectionExpiry') val = toExcelDate(val);
      aoa.push([name, val]);
    });
    aoa.push([]);
    if (filter) aoa.push(['絞り込み', filter]);
    const headerRow = aoa.length;
    aoa.push(['日付', '走行距離 (km)', 'メンテナンス内容', '使用部品', '部品代 (円)', '工賃 (円)', '合計 (円)', '備考']);
    const recs = visibleRecords();
    recs.forEach((r) => {
      aoa.push([
        toExcelDate(r.date),
        numOrBlank(r.odometer),
        r.content || '',
        r.parts || '',
        numOrBlank(r.partsCost),
        numOrBlank(r.laborCost),
        A.recordTotal(r),
        r.note || '',
      ]);
    });
    const first = headerRow + 2; // Excel の行番号（1 始まり）
    const last = headerRow + 1 + recs.length;
    const sumRow = recs.length
      ? ['合計', '', '', '', { f: `SUM(E${first}:E${last})` }, { f: `SUM(F${first}:F${last})` }, { f: `SUM(G${first}:G${last})` }, '']
      : ['合計', '', '', '', 0, 0, 0, ''];
    aoa.push(sumRow);

    const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
    // 数式セルに値を入れておく（再計算しないビューアでも表示されるように）
    if (recs.length) {
      const sums = [
        recs.reduce((s, r) => s + (A.toNumber(r.partsCost) || 0), 0),
        recs.reduce((s, r) => s + (A.toNumber(r.laborCost) || 0), 0),
        recs.reduce((s, r) => s + A.recordTotal(r), 0),
      ];
      [4, 5, 6].forEach((C, i) => {
        const cell = ws[XLSX.utils.encode_cell({ r: aoa.length - 1, c: C })];
        cell.t = 'n';
        cell.v = sums[i];
      });
    }
    applyFormats(ws, { dateCols: [0, 1], numCols: [1, 4, 5, 6] });
    ws['!cols'] = [{ wch: 20 }, { wch: 16 }, { wch: 26 }, { wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 24 }];
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: headerRow, c: 0 }, e: { r: headerRow + recs.length, c: 7 } }) };
    XLSX.utils.book_append_sheet(wb, ws, 'メンテナンス履歴');

    // シート2: 内容別の間隔
    const iv = [['メンテナンス内容', '日付', '走行距離 (km)', '前回からの期間', '前回からの日数', '前回からの距離 (km)', '使用部品', '合計 (円)']];
    A.uniqueContents(v.records).forEach((c) => {
      A.intervalsFor(v.records, c).rows.forEach((row) => {
        const r = row.record;
        iv.push([
          c,
          toExcelDate(r.date),
          numOrBlank(r.odometer),
          row.days === null ? '（初回）' : row.period,
          row.days === null ? '' : row.days,
          row.distance === null ? '' : row.distance,
          r.parts || '',
          A.recordTotal(r),
        ]);
      });
    });
    const ws2 = XLSX.utils.aoa_to_sheet(iv, { cellDates: true });
    applyFormats(ws2, { dateCols: [1], numCols: [2, 4, 5, 7], fromRow: 1 });
    ws2['!cols'] = [{ wch: 26 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 28 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws2, '間隔分析');

    // シート3: 内容別サマリー
    const sm = [['メンテナンス内容', '回数', '前回実施日', '前回走行距離 (km)', '平均間隔（日）', '平均間隔（距離 km）', '前回からの経過日数', '前回からの経過距離 (km)', '費用合計 (円)']];
    A.summarize(v.records, today()).forEach((s) => {
      sm.push([
        s.content,
        s.count,
        toExcelDate(s.last.date),
        numOrBlank(s.last.odometer),
        s.avgDays === null ? '' : Math.round(s.avgDays),
        s.avgDistance === null ? '' : Math.round(s.avgDistance),
        s.sinceDays === null ? '' : s.sinceDays,
        s.sinceDistance === null ? '' : s.sinceDistance,
        s.totalCost,
      ]);
    });
    const ws3 = XLSX.utils.aoa_to_sheet(sm, { cellDates: true });
    applyFormats(ws3, { dateCols: [2], numCols: [3, 4, 5, 6, 7, 8], fromRow: 1 });
    ws3['!cols'] = [{ wch: 26 }, { wch: 6 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 20 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws3, '内容別サマリー');

    const safe = label.replace(/[\\/:*?"<>|]/g, '_');
    XLSX.writeFile(wb, `メンテナンス履歴_${safe}_${today()}.xlsx`);
  }

  $('#exportExcelBtn').addEventListener('click', exportExcel);

  // ---------- バックアップ ----------
  $('#backupBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `maintenance-backup_${today()}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  $('#restoreInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || !Array.isArray(data.vehicles) || !data.vehicles.length) throw new Error('形式が正しくありません');
      data.vehicles.forEach((v) => {
        v.id = v.id || uid();
        v.info = v.info || {};
        v.records = Array.isArray(v.records) ? v.records : [];
        v.records.forEach((r) => { r.id = r.id || uid(); });
      });
      if (!confirm('現在のデータをバックアップの内容で置き換えます。よろしいですか？')) return;
      state = { vehicles: data.vehicles, currentId: data.currentId || data.vehicles[0].id };
      filter = '';
      save();
      renderAll();
    } catch (err) {
      alert('復元に失敗しました: ' + err.message);
    }
  });

  // ---------- 初期描画 ----------
  function renderAll() {
    renderVehicleSelect();
    renderVehicleForm();
    renderContentOptions();
    renderRecords();
    renderAnalysis();
  }

  inputRow.querySelector('[data-f="date"]').value = today();
  renderAll();
})();
