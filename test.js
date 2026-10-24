// node test.js で実行する計算ロジックの簡易テスト
const assert = require('assert');
const A = require('./js/analysis.js');

const recs = [
  { id: '1', date: '2023-01-10', odometer: '10000', content: 'エンジンオイル交換', partsCost: '3000', laborCost: '1000' },
  { id: '2', date: '2023-07-15', odometer: '15000', content: 'エンジンオイル交換', partsCost: '3200', laborCost: '' },
  { id: '3', date: '2023-03-01', odometer: '11500', content: 'タイヤ交換', partsCost: '60000', laborCost: '8000' },
  { id: '4', date: '2024-02-20', odometer: '21000', content: ' エンジンオイル交換 ', partsCost: '3500', laborCost: '1100' },
];

assert.strictEqual(A.recordTotal(recs[0]), 4000);
assert.strictEqual(A.recordTotal(recs[1]), 3200);
assert.strictEqual(A.daysBetween('2023-01-10', '2023-07-15'), 186);
assert.deepStrictEqual(A.calendarDiff('2023-01-31', '2023-03-01'), { years: 0, months: 1, days: 1 });
assert.strictEqual(A.formatPeriod('2023-07-15', '2024-02-20'), '7ヶ月5日');
assert.strictEqual(A.formatPeriod('2023-01-10', '2024-01-10'), '1年');

const oil = A.intervalsFor(recs, 'エンジンオイル交換');
assert.strictEqual(oil.count, 3);
assert.deepStrictEqual(oil.rows.map((r) => r.distance), [null, 5000, 6000]);
assert.deepStrictEqual(oil.rows.map((r) => r.days), [null, 186, 220]);
assert.strictEqual(oil.avgDistance, 5500);
assert.strictEqual(oil.totalCost, 4000 + 3200 + 4600);

assert.deepStrictEqual(A.uniqueContents(recs).sort(), ['エンジンオイル交換', 'タイヤ交換'].sort());

const byContent = A.sortRecords(recs, 'content', 'asc').map((r) => r.id);
// 同じ内容は日付順にまとまる
const oilIdx = byContent.filter((id) => id !== '3');
assert.deepStrictEqual(oilIdx, ['1', '2', '4']);
assert.deepStrictEqual(A.sortRecords(recs, 'date', 'desc').map((r) => r.id), ['4', '2', '3', '1']);

const sum = A.summarize(recs, '2024-03-20');
const s = sum.find((x) => x.content === 'エンジンオイル交換');
assert.strictEqual(s.sinceDays, 29);
assert.strictEqual(s.sinceDistance, 0);
const t = sum.find((x) => x.content === 'タイヤ交換');
assert.strictEqual(t.sinceDistance, 9500);

console.log('all tests passed');
