// 計算・集計ロジック（DOM に依存しない純粋関数）
(function (root) {
  'use strict';

  const DAY_MS = 24 * 60 * 60 * 1000;

  function toNumber(v) {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function recordTotal(r) {
    return (toNumber(r.partsCost) || 0) + (toNumber(r.laborCost) || 0);
  }

  function parseDate(s) {
    if (!s) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  }

  function daysBetween(a, b) {
    const da = parseDate(a);
    const db = parseDate(b);
    if (!da || !db) return null;
    return Math.round((db - da) / DAY_MS);
  }

  // a から b までの暦上の年・月・日の差
  function calendarDiff(a, b) {
    const da = parseDate(a);
    const db = parseDate(b);
    if (!da || !db || db < da) return null;
    // a に n ヶ月足した日（月末は丸める。例: 1/31 + 1ヶ月 = 2/28）
    const addMonths = (n) => {
      const y = da.getUTCFullYear();
      const m = da.getUTCMonth() + n;
      const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      return new Date(Date.UTC(y, m, Math.min(da.getUTCDate(), lastDay)));
    };
    let months = (db.getUTCFullYear() - da.getUTCFullYear()) * 12 + (db.getUTCMonth() - da.getUTCMonth());
    if (addMonths(months) > db) months -= 1;
    const days = Math.round((db - addMonths(months)) / DAY_MS);
    return { years: Math.floor(months / 12), months: months % 12, days };
  }

  function formatPeriod(a, b) {
    const diff = calendarDiff(a, b);
    if (!diff) return '';
    const parts = [];
    if (diff.years) parts.push(diff.years + '年');
    if (diff.months) parts.push(diff.months + 'ヶ月');
    if (diff.days || parts.length === 0) parts.push(diff.days + '日');
    return parts.join('');
  }

  // 日数を「約 n 年 m ヶ月」のような概算表記に
  function formatDays(days) {
    if (days === null || days === undefined || !Number.isFinite(days)) return '';
    const totalMonths = Math.round(days / 30.4375);
    if (totalMonths < 1) return Math.round(days) + '日';
    const y = Math.floor(totalMonths / 12);
    const m = totalMonths % 12;
    return '約' + (y ? y + '年' : '') + (m ? m + 'ヶ月' : '') + '（' + Math.round(days) + '日）';
  }

  function compareRecordsChronologically(a, b) {
    const da = a.date || '';
    const db = b.date || '';
    if (da !== db) return da < db ? -1 : 1;
    return (toNumber(a.odometer) || 0) - (toNumber(b.odometer) || 0);
  }

  function normalizeContent(s) {
    return String(s || '').trim();
  }

  // 同じメンテナンス内容の記録を時系列に並べ、前回からの期間・距離を付ける
  function intervalsFor(records, content) {
    const key = normalizeContent(content);
    const list = records
      .filter((r) => normalizeContent(r.content) === key)
      .slice()
      .sort(compareRecordsChronologically);

    const rows = list.map((r, i) => {
      const prev = i > 0 ? list[i - 1] : null;
      const odo = toNumber(r.odometer);
      const prevOdo = prev ? toNumber(prev.odometer) : null;
      return {
        record: r,
        days: prev ? daysBetween(prev.date, r.date) : null,
        period: prev ? formatPeriod(prev.date, r.date) : '',
        distance: prev && odo !== null && prevOdo !== null ? odo - prevOdo : null,
      };
    });

    const dayVals = rows.map((x) => x.days).filter((v) => v !== null);
    const distVals = rows.map((x) => x.distance).filter((v) => v !== null);
    const avg = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null);

    return {
      content: key,
      rows,
      count: list.length,
      avgDays: avg(dayVals),
      minDays: dayVals.length ? Math.min(...dayVals) : null,
      maxDays: dayVals.length ? Math.max(...dayVals) : null,
      avgDistance: avg(distVals),
      minDistance: distVals.length ? Math.min(...distVals) : null,
      maxDistance: distVals.length ? Math.max(...distVals) : null,
      totalCost: list.reduce((s, r) => s + recordTotal(r), 0),
      last: list.length ? list[list.length - 1] : null,
    };
  }

  function uniqueContents(records) {
    const set = new Set();
    records.forEach((r) => {
      const c = normalizeContent(r.content);
      if (c) set.add(c);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ja'));
  }

  // 指定した内容で過去に使った部品（新しく使った順）。content が空なら全部品
  function partsFor(records, content) {
    const key = normalizeContent(content);
    const list = records
      .filter((r) => normalizeContent(r.parts) && (!key || normalizeContent(r.content) === key))
      .sort((a, b) => -compareRecordsChronologically(a, b));
    const seen = new Set();
    const out = [];
    list.forEach((r) => {
      const p = normalizeContent(r.parts);
      if (!seen.has(p)) {
        seen.add(p);
        out.push(p);
      }
    });
    return out;
  }

  function latestOdometer(records) {
    let max = null;
    records.forEach((r) => {
      const v = toNumber(r.odometer);
      if (v !== null && (max === null || v > max)) max = v;
    });
    return max;
  }

  function summarize(records, today) {
    const currentOdo = latestOdometer(records);
    return uniqueContents(records).map((c) => {
      const info = intervalsFor(records, c);
      const lastOdo = info.last ? toNumber(info.last.odometer) : null;
      return Object.assign(info, {
        sinceDays: info.last ? daysBetween(info.last.date, today) : null,
        sincePeriod: info.last ? formatPeriod(info.last.date, today) : '',
        sinceDistance: currentOdo !== null && lastOdo !== null ? currentOdo - lastOdo : null,
      });
    });
  }

  const SORTERS = {
    date: (a, b) => compareRecordsChronologically(a, b),
    odometer: (a, b) => (toNumber(a.odometer) ?? -1) - (toNumber(b.odometer) ?? -1),
    content: (a, b) =>
      normalizeContent(a.content).localeCompare(normalizeContent(b.content), 'ja') ||
      compareRecordsChronologically(a, b),
    parts: (a, b) => String(a.parts || '').localeCompare(String(b.parts || ''), 'ja'),
    partsCost: (a, b) => (toNumber(a.partsCost) || 0) - (toNumber(b.partsCost) || 0),
    laborCost: (a, b) => (toNumber(a.laborCost) || 0) - (toNumber(b.laborCost) || 0),
    total: (a, b) => recordTotal(a) - recordTotal(b),
    note: (a, b) => String(a.note || '').localeCompare(String(b.note || ''), 'ja'),
  };

  function sortRecords(records, key, dir) {
    const cmp = SORTERS[key] || SORTERS.date;
    const sign = dir === 'desc' ? -1 : 1;
    // 内容で並べた場合も、同じ内容の中は日付の古い順を維持する
    if (key === 'content') {
      return records.slice().sort((a, b) =>
        sign * normalizeContent(a.content).localeCompare(normalizeContent(b.content), 'ja') ||
        compareRecordsChronologically(a, b));
    }
    return records.slice().sort((a, b) => sign * cmp(a, b) || compareRecordsChronologically(a, b));
  }

  const api = {
    toNumber,
    recordTotal,
    daysBetween,
    calendarDiff,
    formatPeriod,
    formatDays,
    intervalsFor,
    uniqueContents,
    partsFor,
    latestOdometer,
    summarize,
    sortRecords,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Analysis = api;
})(this);
