'use strict';
// Sinh 3 file ERD: Conceptual (SRS 3.1.5), Logical (Report 4 mục 2), Physical (khớp V001–V017).
const path = require('path');
const { DrawioFile, S, stackBox } = require('./lib');
const { loadSchema, sqlType, pascal, AREAS, areaOf, CONCEPT, LOGICAL_ONLY, CONCEPT_RELS } = require('./schema');

const META = (v) => `Version 2.0 · 22/10/2026 · Register v1.3 · migrations V001–V017 · crow's foot · ${v}`;
const ACTOR_COLS = new Set(['approved_by', 'created_by', 'actor_id', 'actor_user_id', 'reviewed_by', 'resolved_by', 'recorded_by', 'printed_by', 'scanned_by', 'changed_by', 'hidden_by', 'declared_by', 'completed_by', 'acknowledged_by', 'signer_user_id', 'reviewer_id', 'user_id', 'customer_id', 'owner_user_id']);

/** Xếp các hộp vào `cols` cột, hộp kế tiếp vào cột thấp nhất. Trả về map key → {x,y}. */
function pack(items, cols, x0, y0, colW, gapY = 40) {
  const heights = Array(cols).fill(y0);
  const pos = {};
  for (const it of items) {
    let c = 0; for (let i = 1; i < cols; i++) if (heights[i] < heights[c]) c = i;
    pos[it.key] = { x: x0 + c * colW, y: heights[c] };
    heights[c] += it.h + gapY;
  }
  return pos;
}

function card(c) { // bản số → mũi tên crow's foot của draw.io
  return { '1': 'ERmandOne', '0..1': 'ERzeroToOne', '0..N': 'ERzeroToMany', '1..N': 'ERoneToMany', '0..2': 'ERzeroToMany' }[c] ?? 'ERmandOne';
}

function legend(d, x, y, lines) {
  d.vertex(`<b>Legend</b><br>${lines.join('<br>')}`, S.legend, x, y, 330, 18 + lines.length * 15, { raw: true });
}

// ---------- Conceptual ----------
function conceptual(schema, out) {
  const f = new DrawioFile();
  const d = f.page('Conceptual ERD');
  const entities = [];
  d.caption('Figure 3.1', 'Conceptual ERD – CrabShare business entities', META(`SRS 3.1.5 · ${Object.keys(CONCEPT).length} business entities in 6 areas`));
  for (const a of AREAS) for (const t of a.tables) {
    if (LOGICAL_ONLY.has(t) || !CONCEPT[t]) continue;
    const c = CONCEPT[t];
    const rows = c.attrs.map(x => ({ text: x }));
    entities.push({ key: c.name, title: `<b>${c.name}</b><br><font style="font-size:9px" color="#475569">${c.vi}</font>`, rows, area: a, h: 32 + rows.length * 16 + 4 });
  }
  // Bố cục theo vùng: mỗi vùng một khối cột
  const colW = 215, x0 = 20, y0 = 70;
  let col = 0;
  const pos = {};
  const perArea = { A1: 3, A2: 4, A3: 3, A4: 3, A5: 2, A6: 3 };
  for (const a of AREAS) {
    const items = entities.filter(e => e.area === a);
    const n = perArea[a.key];
    const p = pack(items, n, x0 + col * colW, y0 + 40, colW, 36);
    const maxY = Math.max(...items.map(e => p[e.key].y + e.h));
    d.vertex(`<b>${a.key} · ${a.title}</b>`, `rounded=0;whiteSpace=wrap;html=1;fillColor=none;strokeColor=${a.stroke};dashed=1;align=left;verticalAlign=top;spacingLeft=6;fontSize=11;`, x0 + col * colW - 8, y0, n * colW - 8, maxY - y0 + 20, { raw: true });
    Object.assign(pos, p);
    col += n;
  }
  for (const e of entities) {
    const p = pos[e.key];
    stackBox(d, e.key, e.title, e.rows, p.x, p.y, 185, S.entity(e.area.fill, e.area.stroke), 16, { headerH: 32 });
  }
  const known = new Set(entities.map(e => e.key));
  for (const [a, verb, b, ca, cb] of CONCEPT_RELS) {
    if (!known.has(a) || !known.has(b)) { console.warn('conceptual: unknown', a, b); continue; }
    const self = a === b;
    d.edge(a, b, S.erEdge(card(ca), card(cb), self ? 'edgeStyle=orthogonalEdgeStyle;' : ''), { label: verb, points: self ? [[pos[a].x + 220, pos[a].y - 20]] : [] });
  }
  legend(d, 20, 1320, ['Entity = business concept (EN) with Vietnamese gloss; attributes are identifying/business attributes only.', 'Crow\'s foot: | one · O zero · &lt; many. Relationship label read from the first entity to the second.', 'Many-to-many kept as relationships here (acknowledges, capital share, offtake price); decomposed in the Logical ERD.', 'Technical tables (idempotency requests, price checks, event details) appear only from the Logical level.']);
  f.write(path.join(out, 'CrabShare_Conceptual_ERD.drawio'));
}

// ---------- Logical / Physical (chung một bộ dựng, khác cách ghi thuộc tính) ----------
function buildRelational(schema, out, level) {
  const f = new DrawioFile();
  const { tables, fks } = schema;
  const W = level === 'physical' ? 250 : 215;
  const rowOf = (t, c) => {
    const tags = [];
    if (c.pk) tags.push('PK'); if (c.fk) tags.push('FK'); if (c.uq && !c.pk) tags.push('U');
    const tag = tags.length ? `<font color="#b91c1c"><b>${tags.join(',')}</b></font> ` : '';
    if (level === 'physical') {
      const nn = c.nullable ? '' : ' <font color="#64748b">NOT NULL</font>';
      return { text: `${tag}${c.name}: ${sqlType(c)}${nn}`, style: c.pk ? S.attr + 'fontStyle=1;' : S.attr };
    }
    return { text: `${tag}${pascal(c.name)}${c.nullable ? ' [0..1]' : ''}`, style: c.pk ? S.attr + 'fontStyle=1;' : S.attr };
  };
  const boxFor = (t) => {
    const tb = tables[t];
    const cols = level === 'physical' ? tb.cols : tb.cols.filter(c => !['created_at', 'updated_at'].includes(c.name));
    const title = level === 'physical' ? `<b>${t}</b>` : `<b>${pascal(t)}</b><br><font style="font-size:9px" color="#475569">${t}</font>`;
    const rows = cols.map(c => rowOf(t, c));
    return { key: t, title, rows, h: (level === 'physical' ? 26 : 32) + rows.length * 16 + 4 };
  };
  const drawPage = (d, tableNames, colsPerArea, allMode) => {
    const pos = {};
    let col = 0;
    const colW = W + 30;
    for (const a of AREAS) {
      const items = a.tables.filter(t => tableNames.includes(t)).map(boxFor);
      if (!items.length) continue;
      const n = colsPerArea[a.key] ?? 2;
      const p = pack(items, n, 20 + col * colW, 110, colW, 36);
      const maxY = Math.max(...items.map(e => p[e.key].y + e.h));
      d.vertex(`<b>${a.key} · ${a.title}</b>`, `rounded=0;whiteSpace=wrap;html=1;fillColor=none;strokeColor=${a.stroke};dashed=1;align=left;verticalAlign=top;spacingLeft=6;fontSize=11;`, 12 + col * colW, 70, n * colW - 10, maxY - 70 + 20, { raw: true });
      for (const e of items) stackBox(d, e.key, e.title, e.rows, p[e.key].x, p[e.key].y, W, S.entity(a.fill, a.stroke), 16, { headerH: level === 'physical' ? 26 : 32 });
      Object.assign(pos, p);
      col += n;
    }
    const seen = new Set();
    for (const fk of fks) {
      if (!pos[fk.child] || !pos[fk.parent]) continue;
      const key = `${fk.child}>${fk.parent}:${fk.cols.map(c => c[0]).join('+')}`;
      if (seen.has(key)) continue; seen.add(key);
      const childCol = tables[fk.child].cols.find(c => c.name === fk.cols[0][0]);
      const unique = tables[fk.child].uniques.some(u => u.cols.length === 1 && u.cols[0] === childCol.name) || (tables[fk.child].pk.length === 1 && tables[fk.child].pk[0] === childCol.name);
      const parentEnd = childCol.nullable ? 'ERzeroToOne' : 'ERmandOne';
      const childEnd = unique ? 'ERzeroToOne' : 'ERzeroToMany';
      const actor = ACTOR_COLS.has(childCol.name) && fk.parent === 'app_user';
      const style = S.erEdge(childEnd, parentEnd, actor ? 'strokeColor=#94a3b8;dashed=1;' : '') + (fk.child === fk.parent ? 'edgeStyle=orthogonalEdgeStyle;' : '');
      const label = level === 'physical' ? fk.cols.map(c => c[0]).join(', ') : pascal(fk.cols[0][0]).replace(/Id$/, '');
      d.edge(fk.child, fk.parent, style, { label: allMode && actor ? '' : label, points: fk.child === fk.parent ? [[pos[fk.child].x + W + 40, pos[fk.child].y - 16]] : [] });
    }
  };
  const perArea = { A1: 3, A2: 4, A3: 3, A4: 3, A5: 2, A6: 2 };
  const n = Object.keys(tables).length;
  const all = f.page(level === 'physical' ? `Physical – all ${n} tables` : `Logical – all ${n} entities`);
  all.caption(level === 'physical' ? 'Figure 4.3' : 'Figure 4.2', level === 'physical' ? 'Physical Database Design – all tables' : 'Logical ERD – all entities (3NF)', META(level === 'physical' ? `SQL Server · ${n} tables · dashed grey = actor references to app_user` : `${n} EF Core entities · surrogate keys shown as PK, business keys marked U`));
  drawPage(all, Object.keys(tables), perArea, true);
  legend(all, 20, 40, level === 'physical'
    ? ['PK primary key · FK foreign key · U unique index · NOT NULL as in V001–V017 scripts.', 'Crow\'s foot: parent end | or O| (nullable FK); child end O&lt; or O| (unique FK = one-to-one). Dashed grey edges = audit/actor references to app_user.']
    : ['Entity = EF Core entity (PascalCase); attributes without DBMS types; [0..1] = optional.', 'PK identifier · FK reference · U business key (unique). Many-to-many decomposed into AppUserRole, RiskAcknowledgement, CapitalShare, BatchOfftakePrice.']);
  for (const a of AREAS) {
    const d = f.page(`${a.key} · ${a.title}`);
    d.caption(level === 'physical' ? `Figure 4.3.${a.key.slice(1)}` : `Figure 4.2.${a.key.slice(1)}`, `${level === 'physical' ? 'Physical' : 'Logical'} ERD – ${a.title}`, META('page of area; cross-area references drawn to tables shown on this page only'));
    // bảng của vùng + bảng cha được tham chiếu ở vùng khác (để không mất quan hệ)
    const extra = new Set();
    for (const t of a.tables) for (const fk of tables[t].fks) if (!a.tables.includes(fk.parent) && fk.parent !== 'app_user') extra.add(fk.parent);
    const names = [...a.tables, ...extra];
    const cols = { ...Object.fromEntries(AREAS.map(x => [x.key, 1])), [a.key]: perArea[a.key] };
    drawPage(d, names, cols, false);
  }
  f.write(path.join(out, level === 'physical' ? 'CrabShare_Physical_ERD.drawio' : 'CrabShare_Logical_ERD.drawio'));
}

function run(out) {
  const schema = loadSchema();
  conceptual(schema, out);
  buildRelational(schema, out, 'logical');
  buildRelational(schema, out, 'physical');
  console.log('ERD done:', Object.keys(schema.tables).length, 'tables,', schema.fks.length, 'FKs');
}
if (require.main === module) run(process.argv[2] ?? path.join(__dirname, 'out'));
module.exports = { run };
