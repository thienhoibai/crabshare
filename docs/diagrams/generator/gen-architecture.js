'use strict';
// Report 4 mục 1: Component Diagram (System Overview), Deployment Diagram (CI/CD), Package Diagrams (backend, web, mobile).
// v3.0 (04/11/2026): vẽ theo Phiếu v1.4, code develop @ 420a379.
// - Phần v1.4 có mà code chưa có: «planned» = nét đứt xám #64748b, luôn kèm nhãn «planned» (G-02, brief 9.4).
// - Phần code còn mà v1.4 bỏ (Catalog, Offtake, tem cua, cửa hàng / giỏ hàng, job PreorderBalance): không vẽ, chỉ ghi trong Notes.
// - Bảng giải thích khối, node, package và phụ thuộc nằm ở trang "Table 4.x" riêng, caption đặt trên bảng, để chép sang Word
//   (AR-02, AR-05). Hình chỉ giữ mã [C…]/[N…] và số trên mũi tên để tra.
// - Đợt 2 (brief mục 9–10): chữ nhỏ nhất 11 px; trang nào thu vừa A4 ngang mà chữ dưới 5 pt thì tách thành nhiều phần, giữ số
//   hình, caption ghi "(1/2)" — Component 4.1 tách phía client/API và phía dữ liệu/dịch vụ ngoài; Table 4.1 và 4.5 tách theo.
//   D2: hàng hộp (BoxRow) thuộc Batch; D8: đơn có hoá đơn gộp thành InvoicedSale; 9.2: "Device & Camera Simulator".
// - Đề xuất gỡ phụ thuộc vòng (AR-01) là bảng "Planned refactoring" ở trang bảng của từng Package Diagram; hình vẫn vẽ đúng code.
// Ngoài file .drawio, run() ghi thêm Component.mmd và Deployment.mmd (Mermaid flowchart) vào cùng thư mục ra.
const fs = require('fs');
const path = require('path');
const { DrawioFile, S, FONT } = require('./lib');

const META = 'v3.2 · 05/11/2026 · Register v1.4 · code: develop @ 420a379';
const PENDING = 'Design decisions of 05/11/2026 applied here were confirmed by the lead';
const SIM = 'Device &amp; Camera Simulator'; // tên thay cho thiết bị thật (brief 9.2), trong nhãn HTML

// ---------- Kiểu dáng riêng (chữ nhỏ nhất 11 px) ----------
const PLANNED = 'dashed=1;dashPattern=6 4;strokeColor=#64748b;fontColor=#475569;fillColor=#f8fafc;';
const E_PLANNED = 'dashed=1;dashPattern=6 4;strokeColor=#64748b;fontColor=#475569;';
const E_RED = 'strokeColor=#b91c1c;fontColor=#b91c1c;';
const LBL = 'labelBackgroundColor=#ffffff;fontSize=11;';
const STRAIGHT = 'edgeStyle=none;';
const conn = S.connector + LBL;                       // đường truyền có giao thức (nét liền)
const connStraight = S.connector + LBL + STRAIGHT;
const dep = S.dep + LBL;                              // phụ thuộc / sử dụng (nét đứt)
const depStraight = S.dep + LBL + STRAIGHT;
const LEGEND = S.legend + 'fontSize=11;';
const NOTE = S.note + 'fontSize=11;';
const sm = (t, c = '#475569') => `<font style="font-size:11px;font-weight:normal" color="${c}">${t}</font>`;
const PL = '<font style="font-size:11px" color="#64748b"><i>«planned»</i></font>';
const ST = { sandbox: '<font color="#b45309">external</font> · <font color="#64748b"><i>sandbox «planned»</i></font>', live: '<font color="#047857">code</font>', sim: '<font color="#b45309">code · simulated</font>', part: '<font color="#1d4ed8">code + «planned» parts</font>', plan: '<font color="#64748b"><i>«planned»</i></font>', ext: '<font color="#b45309">external</font>' };
const RED = (t) => `<font color="#b91c1c">${t}</font>`;

/** Caption trang hình (chữ phụ 11 px; lib.caption dùng 10 px). */
function cap(d, fig, title, meta, w = 1300) {
  d.text(`<b>${fig} – ${title}</b><br><font style="font-size:11px" color="#64748b">${meta}</font>`, 20, 10, w, 46, 'fontSize=14;overflow=visible;');
}

// ---------- Trang có kiểm tra bố cục (khoá trùng, cạnh trỏ tới khoá lạ, cạnh cắt qua khối, khối chồng nhau) ----------
const WARN = [];
function page(f, name) {
  const d = f.page(name);
  const geo = {}, edges = [], used = new Set();
  const v = d.vertex.bind(d), e = d.edge.bind(d);
  d.geo = geo;
  d.vertex = (value, style, x, y, w, h, opts = {}) => {
    if (opts.key) { if (used.has(opts.key)) throw new Error(`${name}: duplicate key ${opts.key}`); used.add(opts.key); }
    const id = v(value, style, x, y, w, h, opts);
    if (opts.key && !opts.parent) geo[opts.key] = { x, y, w, h, container: !!opts.container };
    return id;
  };
  d.edge = (a, b, style, opts = {}) => {
    for (const k of [a, b]) if (!used.has(k)) throw new Error(`${name}: edge ${a} → ${b} uses unknown key ${k}`);
    const pts = opts.points ?? [];
    if (!/orthogonalEdgeStyle/.test(style) || pts.length) edges.push({ a, b, pts, style });
    return e(a, b, style, opts);
  };
  const num = (style, k) => { const m = style.match(new RegExp(`(?:^|;)${k}=([0-9.]+)`)); return m ? +m[1] : null; };
  const anchor = (g, style, p) => {
    const ax = num(style, p + 'X'), ay = num(style, p + 'Y');
    return [ax === null ? g.x + g.w / 2 : g.x + g.w * ax, ay === null ? g.y + g.h / 2 : g.y + g.h * ay];
  };
  d.check = () => {
    const solid = Object.entries(geo).filter(([, g]) => !g.container);
    const inside = (g, x, y, m = 2) => x > g.x + m && x < g.x + g.w - m && y > g.y + m && y < g.y + g.h - m;
    for (const { a, b, pts, style } of edges) {
      const ga = geo[a], gb = geo[b];
      if (!ga || !gb) continue;
      const P = [anchor(ga, style, 'exit'), ...pts, anchor(gb, style, 'entry')];
      const hit = new Set();
      for (let i = 0; i < P.length - 1; i++) {
        const [x1, y1] = P[i], [x2, y2] = P[i + 1];
        const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 3));
        for (let k = 0; k <= n; k++) {
          const x = x1 + (x2 - x1) * k / n, y = y1 + (y2 - y1) * k / n;
          for (const [key, g] of solid) if (key !== a && key !== b && inside(g, x, y)) hit.add(key);
        }
      }
      if (hit.size) WARN.push(`${name}: edge ${a} → ${b} crosses ${[...hit].join(', ')}`);
    }
    for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
      const [ka, A] = solid[i], [kb, B] = solid[j];
      if (A.x < B.x + B.w - 1 && B.x < A.x + A.w - 1 && A.y < B.y + B.h - 1 && B.y < A.y + A.h - 1) WARN.push(`${name}: ${ka} overlaps ${kb}`);
    }
  };
  return d;
}

/** Lưới gói cho Package Diagram: put() đặt gói vào ô (c, r); link() nối thẳng hai ô, tự chọn cạnh ra/vào đối diện nhau. */
function grid(d, x0, y0, w, h, dx, dy, baseStyle) {
  const cell = {};
  return {
    cell,
    put(key, label, c, r, extra = '') { cell[key] = { c, r }; return d.vertex(label, baseStyle + extra, x0 + c * dx, y0 + r * dy, w, h, { key, raw: true }); },
    link(a, b, style, label = '', off = 0) {
      const A = cell[a], B = cell[b];
      const sc = Math.sign(B.c - A.c), sr = Math.sign(B.r - A.r);
      let ex, ey, nx, ny;
      if (sr === 0) { ex = sc > 0 ? 1 : 0; nx = 1 - ex; ey = ny = 0.5 + off; }
      else if (sc === 0) { ey = sr > 0 ? 1 : 0; ny = 1 - ey; ex = nx = 0.5 + off; }
      else { ex = sc > 0 ? 0.85 : 0.15; nx = 1 - ex; ey = sr > 0 ? 1 : 0; ny = 1 - ey; }
      return d.edge(a, b, style + STRAIGHT + `exitX=${ex};exitY=${ey};entryX=${nx};entryY=${ny};fontSize=11;`, { label, raw: true });
    },
  };
}

// ---------- Trang bảng: caption trên bảng, chữ 11 px (bảng để chép sang Word, AR-02, AR-05) ----------
const TFS = 11;
const TABLE_STYLE = `text;html=1;whiteSpace=wrap;align=left;verticalAlign=top;overflow=visible;spacing=0;fontSize=${TFS};${FONT}`;
function htmlTable(cols, rows, fs = TFS) {
  const th = cols.map(([t, w]) => `<th style="border:1px solid #94a3b8;background:#e2e8f0;padding:3px 5px;text-align:left;vertical-align:top;width:${w}px;">${t}</th>`).join('');
  const body = rows.map(r => r.section
    ? `<tr><td colspan="${cols.length}" style="border:1px solid #cbd5e1;background:#f1f5f9;padding:3px 5px;font-weight:bold;">${r.section}</td></tr>`
    : `<tr>${r.map(c => `<td style="border:1px solid #cbd5e1;padding:3px 5px;vertical-align:top;">${c}</td>`).join('')}</tr>`).join('');
  return `<table style="border-collapse:collapse;width:100%;font-size:${fs}px;line-height:1.3;"><tr>${th}</tr>${body}</table>`;
}
/** Ước lượng chiều cao bảng (px): ~0,5·cỡ chữ mỗi ký tự, dòng cao 1,3·cỡ chữ, mỗi hàng thêm 7 px đệm (ước hơi dư để khung xuất không cắt chữ). */
function tableHeight(cols, rows, fs = TFS) {
  const plain = (s) => String(s).replace(/<br>/g, '\n').replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, 'x');
  const lh = fs * 1.3, cw = fs * 0.5;
  const lines = (r) => Math.max(1, ...r.map((c, i) => {
    const per = Math.max(6, Math.floor((cols[i][1] - 12) / cw * 0.95));
    return plain(c).split('\n').reduce((s, part) => s + Math.max(1, Math.ceil(part.length / per)), 0);
  }));
  let h = lines(cols.map(c => c[0])) * lh + 7;
  for (const r of rows) h += (r.section ? 1 : lines(r)) * lh + 7;
  return Math.ceil(h + 6);
}
/** Một trang "Table x.y – …": caption trên bảng; parts = [{title?, cols, rows, note?}] xếp dọc. pageName không chứa '/'. */
function tablePage(f, label, pageName, title, meta, parts) {
  const d = f.page(pageName);
  d.text(`<b>${label} – ${title}</b><br><font style="font-size:11px" color="#64748b">${meta}</font>`, 20, 10, 1280, 46, 'fontSize=14;overflow=visible;');
  let y = 66;
  for (const p of parts) {
    const w = p.cols.reduce((s, c) => s + c[1], 0);
    if (p.title) { d.text(`<b>${p.title}</b>`, 20, y, w, 20, 'fontSize=12;'); y += 24; }
    const h = tableHeight(p.cols, p.rows);
    d.vertex(htmlTable(p.cols, p.rows), TABLE_STYLE, 20, y, w, h, { raw: true });
    y += h + 12;
    if (p.note) { const nh = 16 * Math.ceil(p.note.replace(/<[^>]+>/g, '').length / 230); d.text(p.note, 20, y, w, nh, 'fontSize=11;'); y += nh + 4; }
    y += 18;
  }
  return d;
}

// =====================================================================================================
// Figure 4.1 (1/2) – Component Diagram: clients and the API
const comp = (d) => (key, label, x, y, w, h, extra = '') => d.vertex(label, S.component + 'fontSize=12;spacingLeft=14;spacingRight=4;' + extra, x, y, w, h, { key, raw: true });
const ext = (d) => (key, label, x, y, w, h, extra = '') => d.vertex(label, S.external + 'fontSize=12;spacingLeft=14;spacingRight=4;' + extra, x, y, w, h, { key, raw: true });
const box = (d) => (key, label, x, y, w, h) => d.vertex(label, S.subsystem + 'fontSize=13;', x, y, w, h, { key, raw: true, container: true });
const ball = (d) => (key, cx, cy) => d.vertex('', S.iface, cx - 7, cy - 7, 14, 14, { key });

function componentClient(f) {
  const d = page(f, 'Component Diagram (1 of 2) – clients and API');
  cap(d, 'Figure 4.1 (1/2)', 'Component Diagram: System overview – clients and the API (sub-systems, interfaces and protocols)', META + ' · [C…], [X…], [I…] = row of Table 4.1 (1/2) · data stores and external services: Figure 4.1 (2/2)', 1360);
  const C = comp(d), E = ext(d), B = box(d), O = ball(d);

  // ----- Khách: web, mobile, simulator, map tiles -----
  E('x6', `«external system» <b>[X6] Map tile service</b> ${PL}<br>${sm('base map for the farm map · provider not chosen yet')}`, 20, 70, 380, 56, PLANNED);
  E('x7', `«external system» <b>[X7] Static web resources</b><br>${sm('Google Fonts · stock photos (images.pexels.com) on the landing page')}`, 430, 70, 360, 60);
  B('web', '«subsystem» [C1] Web App (React SPA on Vercel)', 20, 146, 380, 522);
  const webC = [
    ['c13', `<b>[C1.3] Farm map</b> ${PL}<br>${sm('farms whose delivery radius covers the address (UC25)')}`, PLANNED],
    ['c12', `<b>[C1.2] Customer orders</b><br>${sm('bulk pre-order by crab count «planned» · VietQR deposit and balance · tracking · returns · rating')}`],
    ['c14', `<b>[C1.4] Investor portal</b><br>${sm('explore · reserve box rows «planned» · pay · sign · portfolio · own-row boxes «planned» · statement')}`],
    ['c15', `<b>[C1.5] Operator workspace</b><br>${sm('Batch by box rows · price suggestion, floor price, tiers «planned» · logs · evidence · harvest')}`],
    ['c16', `<b>[C1.6] Admin console</b><br>${sm('approvals · KYC · finance · evidence review · alerts · disputes · parameters · audit log')}`],
    ['c17', `<b>[C1.7] Public trace page</b><br>${sm('farm, Batch and harvest record by order QR code «planned»')}`],
    ['c11', `<b>[C1.1] Auth and session</b><br>${sm('Zustand store · axios interceptor adds JWT, 401 → logout')}`],
  ];
  webC.forEach(([k, l, x], i) => C(k, l, 36, 182 + i * 68, 348, 60, x ?? ''));
  B('mob', '«subsystem» [C2] Mobile App (Flutter, Android)', 20, 690, 380, 316);
  const mobC = [
    ['c21', `<b>[C2.1] Auth and session</b><br>${sm('Dio interceptor adds JWT · flutter_secure_storage')}`],
    ['c22', `<b>[C2.2] Investor tabs</b><br>${sm('home · Batches · portfolio · eKYC · notifications · own-row box details «planned»')}`],
    ['c23', `<b>[C2.3] Operator tabs</b><br>${sm('logs · box events · camera-only evidence with GPS · capture requests · harvest · weighing «planned»')}`],
    ['c24', `<b>[C2.4] QR scan</b><br>${sm('opens the trace result · order QR «planned»')}`],
  ];
  mobC.forEach(([k, l], i) => C(k, l, 36, 726 + i * 68, 348, 60));
  E('x5', `«external system» <b>[X5] ${SIM}</b> ${PL}<br>${sm('stands in for IoT hardware and cameras: photos · feeding · box events · daily logs (UC52)')}`, 20, 1030, 380, 78, PLANNED);

  // ----- API (x 580–1400) -----
  B('api', '«subsystem» [C3] CrabShare API — ASP.NET Core (.NET 10) modular monolith on Azure App Service', 580, 146, 820, 794);
  O('i_rest', 580, 204);
  d.text('<font style="font-size:11px"><b>[I1] REST API /api/*</b></font>', 420, 172, 152, 26, 'align=right;verticalAlign=bottom;');
  O('i_ingest', 580, 896);
  d.text(`<font style="font-size:11px"><b>[I2] /api/ingest/v1/*</b> ${PL}</font>`, 400, 852, 172, 36, 'align=right;verticalAlign=bottom;');
  C('ctrl', `<b>[C3.1] REST controllers</b> — ${sm('51 classes in 49 files, all [ApiController] · [Authorize] role policies · rate limiter · CORS (Vercel origins) · errors as ProblemDetails (RFC 9457)')}`, 600, 182, 780, 50);
  B('feat', '[C3.2] Feature modules — one vertical slice per module (Dtos · Service · Controller)', 600, 254, 780, 392);
  const mods = [
    ['Auth', 'login · register · JWT · roles'], ['Accounts', 'eKYC · payout account · addresses'], ['Operators', 'farm registration · members'], ['Boxes', 'box numbering (UC44)'],
    ['Batches', 'create · approve · box rows, farm map «planned»'], ['Funding', 'reserve · close · refund · rows «planned»'], ['Contracts', 'sequential signing (UC14)'], ['Payments', 'VietQR · webhook · refunds · payouts'],
    ['Settlement', 'UC35–39 · revenue lines, tiers «planned»'], ['Portfolio', 'portfolio · notifications'], ['Production', 'daily logs · box events · timeline'], ['Evidence', 'capture · random requests · review'],
    ['Alerts', 'raise · acknowledge · escalate'], ['Harvest', 'harvest per box (UC22) · trace'], ['Orders', 'pre-orders · invoiced sales, QR «planned»'], ['Admin', 'dashboards · audit log · exports'],
    ['Health', 'live · ready · version'], ['Price Module', 'price range + MAPE (UC49)', true], ['Ingestion', 'simulator messages (UC52)', true],
  ];
  mods.forEach(([m, sub, planned], i) => C('f_' + m.replace(/ /g, ''), `<b>${m}</b>${planned ? ' ' + PL : ''}<br>${sm(sub)}`, 612 + (i % 4) * 190, 284 + Math.floor(i / 4) * 70, 182, 62, planned ? PLANNED : ''));
  // hàng dưới: mỗi khối nối thẳng với C3.2 bằng một đường dọc
  C('jobs', `<b>[C3.3] Background jobs</b><br>${sm('hosted, every 1 min to 6 h: FundingClose · ReservationExpiry · TrancheSchedule · OrderCompletion · ComplaintEscalation · AlertJob · CaptureRequest · AuditChainCheck · final-order reminder «planned»')}`, 600, 680, 190, 154);
  C('common', `<b>[C3.4] Common</b><br>${sm('JWT auth and role policies · ICurrentUser · IAuditLog (hash chain) · IAlertRaiser · AppException → ProblemDetails · paging · CSV export · demo clock «planned»')}`, 800, 680, 190, 154);
  C('engine', `<b>[C3.5] «library» SettlementEngine</b><br>${sm('used by Settlement · pure, no database: SettlementCalculator · LargestRemainderAllocator · remuneration tier cut «planned»')}`, 1000, 680, 190, 154);
  C('infra', `<b>[C3.6] Infrastructure</b><br>${sm('ports and adapters: persistence (EF Core 10), storage, payments, signing, eKYC (in-process Fake adapters), crab detection, security · detail: Figure 4.1 (2/2)')}`, 1200, 680, 180, 154);
  C('devonly', `<b>[C3.7] Development-only endpoints</b><br>${sm('/api/dev/payments (simulated transfer through the webhook path) · /api/dev/preorders · /api/dev/settlements · OpenAPI + /scalar — 404 outside Development')}`, 600, 852, 780, 66);

  // ----- Kết nối -----
  d.edge('c11', 'i_rest', connStraight + 'exitX=1;exitY=0.5;', { label: 'HTTPS · JSON · Bearer JWT', raw: true });
  d.edge('c21', 'i_rest', connStraight + 'exitX=1;exitY=0.5;', { label: 'HTTPS · JSON · Bearer JWT', raw: true });
  d.edge('x5', 'i_ingest', connStraight + E_PLANNED + 'exitX=1;exitY=0.5;', { label: 'HTTPS POST · X-Api-Key<br>«planned»', raw: true });
  d.edge('c13', 'x6', connStraight + E_PLANNED + 'exitX=0.977;exitY=0;entryX=0.9368;entryY=1;', { label: 'HTTPS<br>«planned»', raw: true });
  d.edge('web', 'x7', connStraight + 'exitX=0.97;exitY=0;entryX=0;entryY=0.8;', { label: 'HTTPS GET', raw: true });
  d.edge('ctrl', 'feat', depStraight + 'exitX=0.5;exitY=1;entryX=0.5;entryY=0;', { label: 'calls', raw: true });
  d.edge('jobs', 'feat', depStraight + 'exitX=0.5;exitY=0;entryX=0.1218;entryY=1;', { label: 'invoke', raw: true });
  d.edge('feat', 'common', depStraight + 'exitX=0.3782;exitY=1;entryX=0.5;entryY=0;', { label: 'use', raw: true });
  d.edge('feat', 'engine', depStraight + 'exitX=0.6346;exitY=1;entryX=0.5;entryY=0;', { label: 'use', raw: true });
  d.edge('feat', 'infra', depStraight + 'exitX=0.8846;exitY=1;entryX=0.5;entryY=0;', { label: 'use ports', raw: true });

  // ----- Chú giải + ghi chú (dưới khối API) -----
  d.vertex('<b>Legend</b><br>Blue = CrabShare component · amber = external system (outside the team boundary).<br>○ on the API border = provided interface; the arrow comes from the component that requires it.<br>Solid arrow = communication path with its protocol · dashed arrow = dependency / use.<br>Grey dashed outline or line, labelled «planned» = in Register v1.4, not in code yet.', LEGEND, 580, 960, 400, 150, { raw: true });
  d.vertex(`<b>Notes</b><br>• Register v1.4 (section 3.2c) lists "farm systems" as external; they are represented by the ${SIM} [X5] through the one common Ingestion API [I2]. Per-farm integration is out of scope, so no Farm Management System is drawn.<br>• Removed in v1.4, still in code, not drawn: Catalog (listings, price history, store, cart, checkout, retail orders), Offtake (commitments, priority window), per-crab tags (tag printing, packing and trace by tag code) and the PreorderBalance job.<br>• ${PENDING} (box rows, forfeited deposits, weighed-kg balance, InvoicedSale).`, NOTE, 1000, 960, 400, 196, { raw: true });
  d.check();
}

// Figure 4.1 (2/2) – Component Diagram: infrastructure adapters, data stores and external services
function componentData(f) {
  const d = page(f, 'Component Diagram (2 of 2) – data and external services');
  cap(d, 'Figure 4.1 (2/2)', 'Component Diagram: System overview – infrastructure adapters, data stores and external services', META + ' · [C…], [S…], [X…], [I…], [M…] = row of Table 4.1 (2/2) · clients and feature modules: Figure 4.1 (1/2)', 1390);
  const C = comp(d), E = ext(d), B = box(d), O = ball(d);
  B('api', '«subsystem» [C3] CrabShare API (continued)', 20, 70, 560, 760);
  C('feat', `<b>[C3.2] Feature modules</b> — ${sm('19 modules, Figure 4.1 (1/2)')}`, 40, 106, 520, 56);
  B('infra', '[C3.6] Infrastructure — ports and adapters', 40, 200, 520, 612);
  const adapters = [
    ['a_db', '<b>Persistence</b><br>' + sm('EF Core 10 AppDbContext scaffolded from the database (database-first)'), 236, 56],
    ['a_store', '<b>Storage</b> — IFileStorage<br>' + sm('LocalFileStorage: contract PDFs, older files<br>CloudinaryFileStorage when Storage:Provider = Cloudinary'), 300, 122],
    ['a_pay', '<b>Payments</b><br>' + sm('IPaymentGateway · IBatchAccountProvisioner → FakePaymentGateway'), 440, 56],
    ['a_sign', '<b>Signing</b><br>' + sm('IDigitalSigningService → FakeSigningService'), 536, 56],
    ['a_ekyc', '<b>eKYC</b><br>' + sm('IEkycProvider · IBankNameMatcher → Fake adapters'), 604, 56],
    ['a_det', '<b>Crab detection</b><br>' + sm('ICrabDetector → NoopCrabDetector ("unknown"); checks only whether a crab is present'), 672, 56],
    ['a_sec', '<b>Security</b><br>' + sm('DataProtection keys · payout account protection · HTTPS and forwarded headers'), 740, 56],
  ];
  adapters.forEach(([k, l, y, h]) => C(k, l, 56, y, 488, h));
  O('i_hook', 580, 506);

  // ----- Dữ liệu và hệ thống ngoài (x 800–1100), mỗi khối thẳng hàng với adapter của nó -----
  d.vertex(`<b>[S1] SQL Server</b><br>${sm('Azure SQL (production) · LocalDB (dev)<br>60 tables · migrations V001–V017 (DbUp)')}`, S.dbShape + 'fontSize=12;', 800, 226, 300, 76, { key: 'sql', raw: true });
  d.vertex(`<b>[S2] File storage</b><br>${sm('/home/data/storage (App Service disk)')}`, S.dbShape + 'fontSize=12;', 800, 306, 300, 56, { key: 'files', raw: true });
  E('x4', `«external system» <b>[X4] Cloudinary</b><br>${sm('authenticated image storage (evidence photos)')}`, 800, 372, 300, 56);
  E('x1', `«external system» <b>[X1] Payment intermediary</b><br>${sm('VietQR collection · Batch accounts · payouts · refunds<br>in-process Fake today · sandbox «planned»')}`, 800, 440, 300, 84);
  E('x2', `«external system» <b>[X2] Viettel digital signing</b><br>${sm('sequential contract signing<br>in-process Fake today · sandbox «planned»')}`, 800, 532, 300, 64);
  E('x3', `«external system» <b>[X3] eKYC provider</b><br>${sm('identity check, result only<br>in-process Fake today · sandbox «planned»')}`, 800, 600, 300, 64);
  d.vertex(`«artifact» <b>[M1] Crab detection model</b> ${PL}<br>${sm('trained on labelled box photos, loaded in-process')}`, S.artifact + PLANNED + 'fontSize=12;', 800, 672, 300, 56, { key: 'm1', raw: true });

  d.edge('feat', 'infra', depStraight + 'exitX=0.5;exitY=1;entryX=0.5;entryY=0;', { label: 'use ports', raw: true });
  d.edge('a_db', 'sql', connStraight + 'exitX=1;exitY=0.5;entryX=0;entryY=0.5;', { label: 'TDS 1433 · TLS<br>Managed Identity', raw: true });
  d.edge('a_store', 'files', connStraight + 'exitX=1;exitY=0.2787;entryX=0;entryY=0.5;', { label: 'file I/O', raw: true });
  d.edge('a_store', 'x4', connStraight + 'exitX=1;exitY=0.8197;entryX=0;entryY=0.5;', { label: 'HTTPS Upload API<br>signed URL 120 s', raw: true });
  d.edge('a_pay', 'x1', connStraight + E_PLANNED + 'exitX=1;exitY=0.5;entryX=0;entryY=0.3333;', { label: 'REST/HTTPS sandbox<br>«planned»', raw: true });
  d.edge('x1', 'i_hook', connStraight + E_PLANNED + 'exitX=0;exitY=0.7857;', { label: '[I3] webhook «planned»<br>HTTPS POST · HMAC', raw: true });
  d.edge('a_sign', 'x2', connStraight + E_PLANNED + 'exitX=1;exitY=0.5;entryX=0;entryY=0.5;', { label: 'REST/HTTPS sandbox<br>«planned»', raw: true });
  d.edge('a_ekyc', 'x3', connStraight + E_PLANNED + 'exitX=1;exitY=0.5;entryX=0;entryY=0.5;', { label: 'REST/HTTPS sandbox<br>«planned»', raw: true });
  d.edge('a_det', 'm1', depStraight + E_PLANNED + 'exitX=1;exitY=0.5;entryX=0;entryY=0.5;', { label: 'loads in-process<br>«planned»', raw: true });

  d.vertex('<b>Legend</b><br>Blue = CrabShare component · amber = external system (outside the team boundary) · cylinder = data store.<br>○ on the API border = provided interface; the arrow comes from the component that requires it.<br>Solid arrow = communication path with its protocol · dashed arrow = dependency / use.<br>Grey dashed outline or line, labelled «planned» = in Register v1.4, not in code yet.<br>"Fake" adapter = in-process simulation of a provider (no production accounts, Register v1.4, section 4).', LEGEND, 1130, 70, 300, 206, { raw: true });
  d.vertex('<b>Notes</b><br>• Payment, signing and eKYC run today as in-process Fake adapters (code); calls to the providers\' sandboxes and the provider webhook are «planned».<br>• The crab detection module only checks whether a crab is present; it never rejects evidence alone.<br>• Removed in v1.4, still in code, not drawn: listing images on Cloudinary.', NOTE, 1130, 292, 300, 170, { raw: true });
  d.check();
}

/** Table 4.1 – giải thích từng khối của Figure 4.1, tách theo hai phần của hình (AR-05). */
function componentTable(f) {
  const cols = [['ID', 56], ['Block', 190], ['Explanation', 884], ['Status', 150]];
  const rows1 = [
    { section: 'Clients and simulator' },
    ['C1', 'Web App', 'React 19 + Vite + TypeScript single-page app on Vercel; browser client for all four roles (Customer, Investor, Operator, Platform Administrator). Calls the API only through shared/api/http.ts; role gating in app/router.tsx.', ST.part],
    ['C1.1', 'Auth and session', 'Login and registration; Zustand session store; the axios interceptor attaches the JWT and logs out on HTTP 401.', ST.live],
    ['C1.2', 'Customer orders', 'Bulk pre-order by number of crabs (or kg) from the minimum quantity, VietQR deposit, balance on the weighed kg, tracking, return, complaint, rating (UC27–UC34); cancel a bulk pre-order (UC55); a deposit is forfeited when the customer walks away (UC54). Ordering by crab count and the weighed balance are planned.', ST.part],
    ['C1.3', 'Farm map', 'Customer picks on a map a farm that delivers to the address: farms and Batches open for pre-order whose delivery radius covers it (UC25).', ST.plan],
    ['C1.4', 'Investor portal', 'Explore Batches, reserve box rows and commit capital (UC10), pay by VietQR, sign the contract, portfolio, box details of own rows only (UC53), settlement statement and feedback.', ST.part],
    ['C1.5', 'Operator workspace', 'Create a Batch by box rows with Standard Cost, price per kg with the price suggestion (UC49), floor price, survival threshold and remuneration tiers, delivery radius, sales window (UC07); boxes, logs, evidence, harvest per box, delivery, invoiced sales (UC50 Record Invoiced Sale) and the final order (UC51).', ST.part],
    ['C1.6', 'Admin console', 'Approve operators, Batches, cost versions, floor prices and tiers; KYC queue; finance and reconciliation; evidence review; alerts; disputes; platform parameters (UC41; only fee tiers are wired today); audit log.', ST.part],
    ['C1.7', 'Public trace page', 'Anonymous page showing farm, Batch and harvest record; in v1.4 it is opened from the QR code of a delivered order (UC33).', ST.part],
    ['C2', 'Mobile App', 'Flutter 3 + Riverpod + go_router + Dio app for Android, used by Investor and Operator. Each feature has a repository interface with a Mock and an Api implementation (one Riverpod provider line switches them).', ST.part],
    ['C2.1', 'Auth and session', 'Dio interceptor attaches the JWT; token kept in flutter_secure_storage (Android Keystore).', ST.live],
    ['C2.2', 'Investor tabs', 'Home, Batches, portfolio, eKYC, notifications; box details of own rows (UC53) is planned.', ST.part],
    ['C2.3', 'Operator tabs', 'Daily logs, box events, live camera-only evidence with server time, GPS and visible box number, random capture requests, harvest per box; delivery with weighing (UC29) is planned.', ST.part],
    ['C2.4', 'QR scan', 'Scans a QR code and opens the trace result through the REST API; the order QR code is planned.', ST.part],
    ['X5', 'Device &amp; Camera Simulator', 'External tool in place of IoT hardware and cameras (out of scope). Posts only meaningful data — photos, feeding, box events, daily logs; no temperature or salinity — through the Ingestion API (UC52 Submit Farm Device and Camera Data).', ST.plan],
    ['X6', 'Map tile service', 'Base map tiles for the farm map, fetched by the browser over HTTPS. Provider not chosen yet.', ST.plan],
    ['X7', 'Static web resources', 'Third-party files the browser loads directly: Google Fonts (index.css, landing.css, UI kit) and stock photos from images.pexels.com on the landing page. No user data is sent.', ST.ext],
    { section: 'API' },
    ['I1', 'REST API /api/*', 'HTTPS, JSON, Bearer JWT with role policies; /api/trace/{code} and /api/health/live, ready, version are anonymous. OpenAPI and Scalar only in Development.', ST.live],
    ['I2', 'Ingestion API', 'POST /api/ingest/v1/* over HTTPS: JSON (and the photo), X-Api-Key issued to the Operator, idempotent by (Operator, client message id); stored as IngestionMessage.', ST.plan],
    ['C3', 'CrabShare API', 'One ASP.NET Core (.NET 10) process: controllers, feature services, background jobs and adapters in one deployable (modular monolith).', ST.part],
    ['C3.1', 'REST controllers', '51 controller classes in 49 files, all marked [ApiController] (DashboardControllers.cs holds two classes; PaymentWebhookController.cs also holds DevPaymentsController). DTO validation → 400; AppException → ProblemDetails {code, detail}; rate limiter on login; CORS for the Vercel origins.', ST.live],
    ['C3.2', 'Feature modules', '17 modules kept by v1.4 plus two planned ones: Price Module (seasonal and holiday price range from 2–3 years of prices, backtest MAPE, shown as a range with a warning, never as a return) and Ingestion (simulator messages → logs, box events, photos). Planned parts: box rows and the farm map query in Batches, row allocation in Funding, pre-order quota and 15-minute holds, invoiced sales, the final order and the order QR in Orders, revenue lines and remuneration tiers in Settlement.', ST.part],
    ['C3.3', 'Background jobs', 'Eight hosted jobs kept by v1.4 (six RecurringJob, two timer workers): reservation expiry, funding close with refunds, tranche schedule, order completion, complaint escalation (each 1 min), capture requests (5 min), alerts (15 min), audit hash-chain check (6 h). The final-order reminder when the sales window closes is planned.', ST.part],
    ['C3.4', 'Common', 'Cross-cutting code: JWT auth and policies, ICurrentUser, IAuditLog with hash chain (append-only), IAlertRaiser, error handling, paging, CSV export. The simulated demo clock (Register v1.4, section 3.2e) is planned; code uses TimeProvider.System.', ST.part],
    ['C3.5', 'SettlementEngine', 'Pure library without database: Revenue Pool, operator remuneration, pro-rata payouts with largest-remainder rounding, loss cap; property-based tests (FsCheck). Remuneration cut by survival tier is planned.', ST.part],
    ['C3.7', 'Development-only endpoints', 'Simulated bank transfer through the real webhook path, demo pre-orders, ending the settlement feedback window, OpenAPI and Scalar; 404 outside Development.', ST.live],
  ];
  const rows2 = [
    ['C3.6', 'Infrastructure', 'Ports (interfaces) and adapters. External providers are registered as in-process Fake adapters in DependencyInjection.cs; storage is chosen by Storage:Provider. Persistence = EF Core 10, database-first.', ST.sim],
    ['I3', 'Payment webhook', 'POST /api/webhooks/payment-provider: HMAC-SHA256 signature in X-Signature, idempotent by providerTxnId (a repeated webhook is recorded once). Today only the simulated transfer of the development endpoint calls it; calls from the provider are planned.', ST.sim],
    ['S1', 'SQL Server', 'Azure SQL (Basic) in production, LocalDB in development; 60 tables, 9 views, triggers for append-only and locked rows; migrations V001–V017 run by DbUp (DbMigrator). Money is DECIMAL(18,0) VND.', ST.live],
    ['S2', 'File storage', 'App Service persistent disk /home/data/storage for contract PDFs and older uploads; storage/ folder in development.', ST.live],
    ['X1', 'Payment intermediary', 'Holds each Batch\'s dedicated account, VietQR collection, payouts and refunds, transaction webhook. CrabShare never holds money. Today an in-process Fake adapter (FakePaymentGateway) stands in for it; calls to its sandbox are planned.', ST.sandbox],
    ['X2', 'Viettel digital signing', 'Sequential signing of investment contracts (Operator, then Investor). Today an in-process Fake adapter (FakeSigningService); calls to its sandbox are planned.', ST.sandbox],
    ['X3', 'eKYC provider', 'Identity verification; only the result is stored. Today in-process Fake adapters (FakeEkycProvider, FakeBankNameMatcher); calls to its sandbox are planned.', ST.sandbox],
    ['X4', 'Cloudinary', 'Real account: authenticated upload of evidence photos over HTTPS, read back through signed URLs valid 120 s; used when Storage:Provider = Cloudinary.', ST.ext],
    ['M1', 'Crab detection model', 'Trained on labelled box photos; loaded in-process by the detection adapter. Precision ≥ 0.85 and recall ≥ 0.80 on a held-out set, otherwise only a weak signal in the risk score.', ST.plan],
  ];
  tablePage(f, 'Table 4.1 (1/2)', 'Table 4.1 (1 of 2) – Component blocks, clients and API', 'Component Diagram blocks of Figure 4.1 (1/2): clients, simulator and the API', META + ' · one row per block code', [{ cols, rows: rows1, note: PENDING + ' (C1.2, C1.4, C1.5 and C3.2: box rows, forfeited deposits, weighed-kg balance, InvoicedSale).' }]);
  tablePage(f, 'Table 4.1 (2/2)', 'Table 4.1 (2 of 2) – Component blocks, data and external services', 'Component Diagram blocks of Figure 4.1 (2/2): adapters, data stores and external services', META + ' · one row per block code', [{ cols, rows: rows2 }]);
}

// =====================================================================================================
// Figure 4.4 – Deployment Diagram (environments, CI/CD)
function deploymentPage(f) {
  const d = page(f, 'Deployment Diagram – Environments and CI-CD');
  cap(d, 'Figure 4.4', 'Deployment Diagram: Environments and CI/CD – local, preview (develop) and production', META + ' · .github/workflows, docs/deploy.md · [N…] = row of Table 4.4', 1620);
  const node = (key, label, x, y, w, h, extra = '') => d.vertex(label, S.node3d + 'fontSize=11;' + extra, x, y, w, h, { key, raw: true, container: true });
  const art = (key, label, x, y, w, h, extra = '') => d.vertex(label, S.artifact + 'fontSize=11;align=left;spacingLeft=4;' + extra, x, y, w, h, { key, raw: true });
  const group = (key, label, x, y, w, h) => d.vertex(label, S.group, x, y, w, h, { key, raw: true, container: true });
  const EXT = 'fillColor=#fef3c7;strokeColor=#b45309;';

  // ----- Thiết bị người dùng -----
  node('n1', '<b>[N1] «device» User PC</b><br>«executionEnvironment» web browser', 20, 100, 280, 120);
  art('a_spa', '«artifact» web SPA bundle (index.html + assets/*.js) loaded from Vercel', 36, 170, 248, 42);
  node('n14', `<b>[N14] «external» Map tile service</b> ${PL}<br>${sm('farm map tiles · provider not chosen')}`, 20, 260, 280, 80, EXT + 'dashed=1;dashPattern=6 4;strokeColor=#64748b;fontColor=#475569;');
  node('n2', '<b>[N2] «device» Android phone</b><br>«executionEnvironment» Flutter runtime · camera · GPS', 20, 460, 280, 150);
  art('a_apk', '«artifact» CrabShare APK (release, signed)<br>API_URL = https://crabshare-api.azurewebsites.net<br>installed from GitHub Releases [N11]', 36, 544, 248, 60);
  node('n3', `<b>[N3] «device» demo machine</b> ${PL}<br>«executionEnvironment» ${SIM}`, 20, 640, 280, 100, PLANNED);

  // ----- Preview / staging -----
  group('g_prev', 'Preview / staging (develop) — web only', 380, 70, 640, 160);
  node('n8', '<b>[N8] «cloud» Vercel Preview deployments</b><br>push develop → alias https://crabshare-develop-nguyn1hien.vercel.app<br>pull request → one preview URL, posted as a PR comment', 400, 100, 600, 90);
  d.text(sm('No separate staging API or database: previews call the production API [N5] (CORS pattern https://crabshare-*-nguyn1hien.vercel.app).', '#334155'), 400, 194, 600, 34);

  // ----- Production -----
  group('g_prod', 'Production — Azure region East Asia, resource group crabshare-rg (Azure for Students)', 380, 240, 640, 520);
  node('n4', '<b>[N4] «cloud» Vercel — project crabshare</b><br>Production: https://crabshare.vercel.app (from main)', 400, 280, 280, 116);
  art('a_web', '«artifact» web build (Vite dist/)<br>VITE_API_URL baked in at build time', 416, 354, 248, 34);
  node('n5', '<b>[N5] «cloud» App Service crabshare-api</b><br>Linux B1 · HTTPS only · Production<br>«executionEnvironment» .NET 10', 400, 410, 280, 330);
  art('a_api', '«artifact» CrabShare.Api.dll + CrabShare.SettlementEngine.dll<br>dotnet publish, SourceRevisionId = SHA', 416, 492, 248, 52);
  art('a_disk', '«artifact» /home/data/storage (uploads, contract PDFs) · /home/data/keys (DataProtection) — persistent', 416, 550, 248, 50);
  art('a_fake', '«artifact» in-process Fake providers: payment / VietQR, Viettel signing, eKYC', 416, 606, 248, 34, 'fillColor=#fffbeb;');
  art('a_cfg', 'App settings (names only): ConnectionStrings__Default, Jwt__SigningKey, Storage__RootPath, Cors__Origins / OriginPatterns, Security__DataProtectionKeyPath, Seed__Enabled=false', 416, 646, 248, 88);
  node('n6', '<b>[N6] «cloud» Azure SQL</b><br>crabshare-sql / crabshare (Basic)<br>Entra sign-in, no SQL passwords', 780, 410, 220, 150);
  art('a_schema', '«artifact» schema V001–V017 + dbo.SchemaVersions (DbUp)', 796, 500, 188, 46);

  // ----- CI/CD -----
  group('g_ci', 'CI/CD — GitHub (thienhoibai/crabshare)', 1080, 70, 580, 640);
  node('n9', '<b>[N9] «cloud» GitHub repository</b><br>main = production web · develop = integration (API + preview web) · feature branches → PR into develop', 1100, 100, 540, 76);
  node('n10', '<b>[N10] «executionEnvironment» GitHub Actions runner (ubuntu-latest)</b>', 1100, 200, 540, 410);
  art('w_ci', '<b>ci.yml</b> — PR, push main/develop: API and migrator Docker images · dotnet build + test (Category!=Database) · web build + Playwright KYC test · flutter analyze + test', 1116, 252, 508, 44);
  art('w_be', '<b>deploy-backend.yml</b> — push develop touching backend/, database/, deploy/: build + test → azure/login (OIDC, identity crabshare-github-deploy) → dotnet publish → check app settings without printing secrets → stop app → DbMigrator (new V*.sql only, never --reset) → azure/webapps-deploy → start → /api/health/ready → deploy/smoke.py → evidence artifact', 1116, 302, 508, 90);
  art('w_web', '<b>deploy-web.yml</b> — push main → production; push develop → preview + fixed alias (Vercel REST API); PR touching web/ → preview + PR comment: vercel pull → vercel build → vercel deploy --prebuilt (secret VERCEL_TOKEN). Vercel Git integration is off (web/vercel.json).', 1116, 398, 508, 76);
  art('w_mob', '<b>release-mobile.yml</b> — manual, develop only: signed release APK with API_URL and WEB_URL → draft GitHub prerelease', 1116, 480, 508, 46);
  art('w_acc', '<b>acceptance-tools.yml</b> — PR touching tools/acceptance: safety tests of the acceptance scripts', 1116, 532, 508, 38);
  node('n11', '<b>[N11] «cloud» GitHub Releases</b> — draft prerelease with the signed demo APK (published after two-device acceptance)', 1100, 630, 540, 66);

  // ----- Dịch vụ ngoài -----
  group('g_ext', 'External services (outside the team boundary)', 1080, 740, 580, 190);
  node('n7', '<b>[N7] «cloud» Cloudinary</b><br>authenticated images: crabshare/evidence/*<br>used when Storage__Provider = Cloudinary', 1100, 776, 270, 130, EXT);
  node('n13', '<b>[N13] «external» sandbox providers</b><br>payment intermediary (VietQR), Viettel signing, eKYC — no production accounts; in-process Fake adapters inside [N5] today, sandbox calls «planned»', 1390, 776, 250, 130, EXT);

  // ----- Phát triển (máy từng thành viên) -----
  group('g_dev', 'Local development — each member\'s PC', 20, 780, 1000, 250);
  node('n12', '<b>[N12] «device» Developer PC (Windows)</b>', 36, 806, 968, 214);
  const devA = [
    ['d_vite', '«executionEnvironment» Vite dev server http://localhost:5173 — web/ (VITE_API_URL = http://localhost:5233)'],
    ['d_api', '«executionEnvironment» dotnet run :5233 / :7199 — CrabShare.Api in Development: demo seed, Fake providers, /scalar, /api/dev/*'],
    ['d_db', '«executionEnvironment» SQL Server LocalDB — CrabShareDev, schema by DbMigrator (--reset allowed only on LocalDB)'],
    ['d_flutter', '«executionEnvironment» Flutter debug — Android emulator (API_URL = http://10.0.2.2:5233) or Chrome on :8080'],
    ['d_docker', '«executionEnvironment» Docker Compose — SQL Server 2022 for machines without LocalDB (optional)'],
    ['d_secrets', '«artifact» .NET User Secrets — Cloudinary credentials, outside the repository'],
  ];
  devA.forEach(([k, l], i) => art(k, l, 52 + (i % 3) * 318, 862 + Math.floor(i / 3) * 78, 306, 66));

  // ----- Đường truyền (giao thức trên từng đường) -----
  d.edge('n1', 'n8', connStraight + 'exitX=1;exitY=0.333;entryX=0;entryY=0.444;', { label: 'HTTPS GET', raw: true });
  d.edge('n1', 'n4', conn + 'exitX=1;exitY=0.667;entryX=0;entryY=0.3448;', { label: 'HTTPS GET<br>(CDN)', raw: true, points: [[365, 180], [365, 320]] });
  d.edge('n1', 'n5', conn + 'exitX=1;exitY=0.875;entryX=0;entryY=0.091;', { label: 'HTTPS · JSON<br>JWT · CORS', raw: true, points: [[345, 205], [345, 440]] });
  d.edge('n1', 'n14', connStraight + E_PLANNED + 'exitX=0.5;exitY=1;entryX=0.5;entryY=0;', { label: 'HTTPS tiles «planned»', raw: true });
  d.edge('n2', 'n5', connStraight + 'exitX=1;exitY=0.4;entryX=0;entryY=0.333;', { label: 'HTTPS · JSON<br>JWT', raw: true });
  d.edge('n3', 'n5', connStraight + E_PLANNED + 'exitX=1;exitY=0.4;entryX=0;entryY=0.818;', { label: 'HTTPS POST<br>X-Api-Key<br>«planned»', raw: true });
  d.edge('n5', 'n6', connStraight + 'exitX=1;exitY=0.121;entryX=0;entryY=0.267;', { label: 'TDS 1433<br>TLS · Managed<br>Identity', raw: true });
  d.edge('n5', 'n7', conn + 'exitX=1;exitY=0.879;entryX=0;entryY=0.338;', { label: 'HTTPS Upload API<br>signed URL', raw: true, points: [[1040, 700], [1040, 820]] });
  d.edge('n5', 'n13', conn + E_PLANNED + 'exitX=1;exitY=0.939;entryX=0.5;entryY=1;', { label: 'REST/HTTPS<br>sandbox<br>«planned»', raw: true, points: [[1055, 720], [1055, 920], [1515, 920]] });
  d.edge('n9', 'n10', connStraight + 'exitX=0.5;exitY=1;entryX=0.5;entryY=0;', { label: 'push / pull_request triggers', raw: true });
  d.edge('n10', 'n8', conn + 'exitX=0;exitY=0.0244;entryX=1;entryY=0.444;', { label: 'Vercel CLI · alias<br>via REST API', raw: true, points: [[1050, 210], [1050, 140]] });
  d.edge('n10', 'n4', connStraight + 'exitX=0;exitY=0.2927;entryX=1;entryY=0.3448;', { label: 'Vercel CLI --prod (token)', raw: true });
  d.edge('n10', 'n6', connStraight + 'exitX=0;exitY=0.6098;entryX=1;entryY=0.2667;', { label: 'DbMigrator<br>TDS/TLS<br>Entra token', raw: true });
  d.edge('n10', 'n5', connStraight + 'exitX=0;exitY=0.9512;entryX=1;entryY=0.5455;', { label: 'OIDC · zip deploy · stop/start · smoke HTTPS', raw: true });
  d.edge('n10', 'n11', connStraight + 'exitX=0.5;exitY=1;entryX=0.5;entryY=0;', { label: 'gh release create --draft', raw: true });
  d.edge('n12', 'n9', conn + 'exitX=0.5;exitY=1;entryX=1;entryY=0.5;', { label: 'git push · pull request (HTTPS)', raw: true, points: [[520, 1050], [1680, 1050], [1680, 135]] });

  // ----- Chú giải + ghi chú (đáy trang) -----
  d.vertex('<b>Legend</b> — 3D box = node («device», «cloud» or «executionEnvironment») · white box = «artifact» deployed on the node · dashed rounded frame = environment · solid arrow = communication path labelled with its protocol · dashed arrow = dependency · amber = external service · grey dashed, labelled «planned» = in Register v1.4, not in code yet.', LEGEND, 20, 1072, 1000, 56, { raw: true });
  d.vertex('<b>Notes</b> — Payment, signing and eKYC run today as in-process Fake adapters inside [N5] (code); calls to the providers\' sandboxes [N13] are «planned». App settings are shown by name only, never their values. Removed in v1.4, still in code, not drawn: listing images (crabshare/listings/*) on Cloudinary [N7].', NOTE, 1080, 1072, 580, 86, { raw: true });
  d.check();
}

/** Table 4.4 – môi trường và node của Figure 4.4 (AR-05). */
function deploymentTable(f) {
  const env = [['Environment', 190], ['Web', 280], ['API', 330], ['Database', 180], ['Deployed by', 300]];
  const envRows = [
    ['<b>Local / development</b>', 'Vite dev server on each PC', 'dotnet run, ASPNETCORE_ENVIRONMENT = Development (demo seed, Fake providers)', 'LocalDB CrabShareDev', 'manual'],
    ['<b>Preview / staging (develop)</b>', 'Vercel Preview: fixed develop alias + one URL per pull request', 'shared with production (crabshare-api)', 'shared with production', 'deploy-web.yml on push develop and on PRs touching web/'],
    ['<b>Production</b>', 'Vercel Production https://crabshare.vercel.app', 'Azure App Service crabshare-api, deployed from develop', 'Azure SQL crabshare', 'deploy-web.yml on push main; deploy-backend.yml on push develop'],
    ['<b>Optional container</b>', '—', 'backend/Dockerfile + deploy/compose.yml + Caddy (template only, never deployed)', 'an existing SQL Server', 'manual (docs/deploy.md)'],
  ];
  const cols = [['ID', 56], ['Node', 220], ['Explanation', 854], ['Status', 150]];
  const rows = [
    ['N1', 'User PC (browser)', 'Any desktop browser of Customer, Investor, Operator or Administrator; downloads the SPA from Vercel, calls the API directly (CORS) and loads Google Fonts and the landing-page photos from their CDNs.', ST.live],
    ['N2', 'Android phone', 'Investor and Operator app; release APK built with API_URL and WEB_URL; uses the camera and GPS for live evidence.', ST.live],
    ['N3', 'Demo machine with simulator', 'Runs the Device &amp; Camera Simulator that posts photos, feeding, box events and logs to the Ingestion API.', ST.plan],
    ['N4', 'Vercel production', 'Static hosting and CDN for the web build of main; VITE_API_URL is fixed at build time, so changing it needs a redeploy.', ST.live],
    ['N5', 'Azure App Service crabshare-api', 'Single API instance for production and previews, deployed from develop. Persistent /home/data keeps uploads and DataProtection keys; system-assigned managed identity for SQL; external providers run as in-process Fake adapters; no demo seeding outside Development.', ST.live],
    ['N6', 'Azure SQL crabshare', 'Basic tier database; the API logs in as [crabshare-api] (read/write only) and the deploy identity runs migrations; DbMigrator refuses --reset outside LocalDB.', ST.live],
    ['N7', 'Cloudinary', 'Third-party storage for evidence photos, used through the Storage adapter. Whether Storage__Provider = Cloudinary is set on Azure cannot be verified from the repository.', ST.ext],
    ['N8', 'Vercel Preview', 'Preview builds of develop (fixed alias) and of each pull request; this is the only staging environment and it shares the production API and database.', ST.live],
    ['N9', 'GitHub repository', 'Source of truth; PRs into develop are reviewed and must pass CI; the leader merges develop into main.', ST.live],
    ['N10', 'GitHub Actions', 'Runs the five workflows shown; Azure login by OIDC (no stored password), Vercel by repository secrets; deploy-backend stops the app during migration and smoke-tests the deployed commit.', ST.live],
    ['N11', 'GitHub Releases', 'Draft prerelease that carries the signed demo APK and its release evidence.', ST.live],
    ['N12', 'Developer PC', 'Each member runs web, API, LocalDB and Flutter locally; secrets stay in User Secrets.', ST.live],
    ['N13', 'Sandbox providers', 'Payment intermediary, Viettel signing and eKYC; Register v1.4 keeps them in sandbox or simulated. Today in-process Fake adapters inside N5 (code) stand in for them, so no call leaves N5; calls to their sandboxes over REST/HTTPS are planned.', ST.sandbox],
    ['N14', 'Map tile service', 'Tiles for the farm map, loaded by the browser.', ST.plan],
  ];
  tablePage(f, 'Table 4.4', 'Table 4.4 – Environments and nodes', 'Deployment Diagram environments and nodes (Figure 4.4)', META + ' · .github/workflows, docs/deploy.md', [
    { title: '(a) Environments', cols: env, rows: envRows },
    { title: '(b) Nodes — one row per node code of Figure 4.4', cols, rows },
  ]);
}

// =====================================================================================================
// Figure 4.5–4.7 – Package Diagrams (vẽ đúng code; phần v1.4 bỏ chỉ ghi trong Notes)
const FP = S.pkg + 'fontSize=12;tabWidth=40;tabHeight=12;';
function packageBackend(f) {
  const d = page(f, 'Package Diagram – Backend');
  cap(d, 'Figure 4.5', 'Package Diagram: Backend – backend/CrabShare.sln; every cross-module dependency checked in code', META + ' · arrow number = row of Table 4.5 (2/2), part (b)', 1060);
  const pkg = (key, label, x, y, w, h, extra = '', container = false) => d.vertex(label, S.pkg + 'fontSize=12;' + extra, x, y, w, h, { key, raw: true, container });
  const use = (a, b, label, style, pts) => d.edge(a, b, style + 'fontSize=11;', { label, raw: true, points: pts });

  pkg('api', '«package» CrabShare.Api', 20, 70, 1060, 820, '', true);
  pkg('program', `Program.cs · Common/FeatureRegistry.cs — ${sm('composition root: registers every service')}`, 40, 108, 460, 46);
  pkg('feat', 'Features — 17 modules kept by v1.4 + 2 «planned» modules (Register v1.4)', 40, 180, 1020, 560, '', true);
  const g = grid(d, 60, 220, 150, 64, 205, 104, FP);
  g.put('Contracts', `Contracts<br>${sm('template · PDF · signing')}`, 0, 0);
  g.put('Funding', `Funding<br>${sm('reserve · close · refund · rows «planned»')}`, 1, 0);
  g.put('Auth', `Auth<br>${sm('login · JWT')}`, 2, 0);
  g.put('Accounts', `Accounts<br>${sm('eKYC · payout · addresses')}`, 3, 0);
  g.put('Operators', `Operators<br>${sm('registration · review')}`, 4, 0);
  g.put('Orders', `Orders<br>${sm('pre-orders · invoiced sales «planned»')}`, 0, 1);
  g.put('Payments', `Payments<br>${sm('VietQR · refunds · webhook · payouts')}`, 1, 1);
  g.put('Settlement', `Settlement<br>${sm('calculate · payout · tiers «planned»')}`, 2, 1);
  g.put('Portfolio', `Portfolio<br>${sm('portfolio · notifications')}`, 3, 1);
  g.put('Admin', `Admin<br>${sm('dashboards · audit log')}`, 4, 1);
  g.put('Harvest', `Harvest<br>${sm('records per box · trace')}`, 1, 2);
  g.put('Batches', `Batches<br>${sm('create · box rows, farm map «planned»')}`, 2, 2);
  g.put('Pricing', `Price Module ${PL}<br>${sm('suggestion + MAPE (UC49)')}`, 3, 2, PLANNED);
  g.put('Health', `Health<br>${sm('live · ready · version')}`, 4, 2);
  g.put('Alerts', `Alerts<br>${sm('AlertService · AlertJob')}`, 0, 3);
  g.put('Production', `Production<br>${sm('stocking · logs · box events · timeline')}`, 1, 3);
  g.put('Boxes', `Boxes<br>${sm('box numbering (UC44)')}`, 2, 3);
  g.put('Evidence', `Evidence<br>${sm('capture · requests · review')}`, 1, 4);
  g.put('Ingestion', `Ingestion ${PL}<br>${sm('/api/ingest/v1 (UC52)')}`, 2, 4, PLANNED);

  // Phụ thuộc giữa các module: số trên mũi tên = dòng của Table 4.5 (2/2) (b)
  const call = dep, cyc = dep + E_RED, plan = dep + E_PLANNED;
  g.link('Funding', 'Payments', call, '1');
  g.link('Funding', 'Contracts', call, '2');
  g.link('Orders', 'Payments', call, '3');
  g.link('Harvest', 'Batches', call, '4');
  g.link('Production', 'Batches', call, '5');
  g.link('Production', 'Alerts', call, '6');
  g.link('Production', 'Boxes', call, '7');
  g.link('Production', 'Evidence', call, '8');
  g.link('Evidence', 'Alerts', call, '9');
  g.link('Payments', 'Batches', call, '10');
  g.link('Payments', 'Settlement', cyc, '11', 0.2);
  g.link('Settlement', 'Payments', cyc, '12', -0.2);
  g.link('Ingestion', 'Production', plan, 'P1 «planned»');
  g.link('Orders', 'Alerts', plan, 'P2 «planned»');

  // Tầng dùng chung (đáy gói CrabShare.Api)
  pkg('common', `Common<br>${sm('Auth (JWT, policies, ICurrentUser) · Auditing (IAuditLog, hash chain) · Alerts (IAlertRaiser → AlertServiceRaiser) · Errors (AppException, ProblemDetails) · Jobs (RecurringJob) · Paging · Exports')}`, 40, 770, 490, 100);
  pkg('infra', `Infrastructure<br>${sm('Persistence (AppDbContext, Entities scaffolded, not edited by hand) · Payments · Signing · Ekyc · Detection · Storage · Security · DependencyInjection')}`, 570, 770, 490, 100);
  use('program', 'feat', '«import»', depStraight + 'exitX=0.4348;exitY=1;entryX=0.196;entryY=0;');
  use('feat', 'common', 'all modules', depStraight + 'exitX=0.2402;exitY=1;entryX=0.5;entryY=0;');
  use('feat', 'infra', 'all modules (AppDbContext, ports)', depStraight + 'exitX=0.7059;exitY=1;entryX=0.3878;entryY=0;');
  use('infra', 'common', '15', depStraight + 'exitX=0;exitY=0.3;entryX=1;entryY=0.3;');
  use('common', 'infra', '15', depStraight + 'exitX=1;exitY=0.7;entryX=0;entryY=0.7;');
  use('common', 'Alerts', '13', depStraight + E_RED + 'exitX=0.1327;exitY=0;entryX=0.3;entryY=1;');
  use('infra', 'feat', '14', depStraight + E_RED + 'exitX=0.75;exitY=0;entryX=0.8799;entryY=1;');

  // Gói ngoài CrabShare.Api
  pkg('migrator', `«package» tools/CrabShare.DbMigrator<br>${sm('DbUp runner for database/migrations/V*.sql')}`, 20, 920, 250, 80);
  pkg('load', `«package» tools/CrabShare.Load<br>${sm('concurrent API / settlement load runner')}`, 285, 920, 250, 80);
  pkg('tests', `«package» tests<br>${sm('CrabShare.Api.Tests (WebApplicationFactory, [Category=Database]) · CrabShare.SettlementEngine.Tests (xUnit + FsCheck)')}`, 550, 920, 265, 80);
  pkg('engine', `«package» CrabShare.SettlementEngine<br>${sm('SettlementCalculator · LargestRemainderAllocator — no database, no framework')}`, 830, 920, 250, 80);
  use('Settlement', 'engine', '«import»', dep + 'exitX=0.5;exitY=0;entryX=0.96;entryY=0;', [[545, 304], [1070, 304], [1070, 920]]);
  use('tests', 'engine', '', depStraight + 'exitX=1;exitY=0.5;entryX=0;entryY=0.5;');
  use('tests', 'api', '', depStraight + 'exitX=0.5;exitY=0;entryX=0.6245;entryY=1;');

  // Chú giải + ghi chú (cột phải); bảng mô tả, bảng phụ thuộc và đề xuất refactor ở Table 4.5
  d.vertex('<b>Legend</b><br>Folder = package · dashed arrow = «use» dependency, numbered as in Table 4.5 (2/2) part (b) · red arrow = cycle or layer breach in code · grey dashed, labelled «planned» = in Register v1.4, not in code yet (P1, P2).', LEGEND, 1100, 70, 420, 86, { raw: true });
  d.vertex('<b>Notes</b><br>• Features <b>do</b> call each other\'s services directly where a flow crosses modules (Table 4.5). The v2.0 sentence "Features never reference each other\'s services directly" was wrong.<br>• Payment confirmations come back through the IPaymentPurposeHandler interface (implemented in Funding and Orders), so Payments does not depend on those modules.<br>• Red = cycle or layer breach in code: Payments ⇄ Settlement (11, 12), Common → Alerts (13), Infrastructure → Alerts and Evidence (14). Table 4.5 (2/2) part (c) proposes how to remove them; not done yet.<br>• Box rows and the farm map query (UC25) are planned parts of Batches; the pre-order quota and holds are planned parts of Orders. They add no module dependency.<br>• Removed in v1.4, still in code, not drawn: the Catalog and Offtake modules with their dependencies (Orders ⇄ Catalog, Catalog → Alerts, Offtake → Payments, Orders and Funding, Harvest → Catalog); tags in Harvest (TagsController, TagsService); PreorderBalanceJob and PreorderBalanceService in Orders.<br>• Infrastructure/Persistence/Entities is generated by EF scaffold and not edited by hand.<br>• ' + PENDING + ' (Batch opening condition, box rows, forfeited deposits, InvoicedSale).', NOTE, 1100, 170, 420, 370, { raw: true });
  d.check();
}

/** Table 4.5 – package backend (1/2); phụ thuộc chéo và đề xuất gỡ vòng (2/2) (AR-01, AR-02). */
function backendTable(f) {
  const cols = [['Package', 180], ['Responsibility', 430], ['Main classes / folders', 520], ['Owner', 150]];
  const rows = [
    ['Program.cs · Common/FeatureRegistry.cs', 'Composition root: builds the pipeline (authentication, CORS, rate limiter, ProblemDetails) and registers every feature service, payment-purpose handler and job', 'Program, FeatureRegistry', 'Thiện'],
    ['Auth', 'Login, registration, JWT, roles (UC01)', 'AuthController, AuthService', 'Thiện'],
    ['Accounts', 'eKYC, payout accounts, delivery addresses, user administration (UC02, UC03, UC06)', 'AccountsController, AccountService, PaymentProfilesController, PaymentProfileService, AdminAccountsController, AdminAccountService', 'Khôi'],
    ['Operators', 'Farm registration, members, admin review (UC04, UC05)', 'OperatorsController, OperatorService, AdminOperatorsController, OperatorReviewService', 'Viên'],
    ['Boxes', 'Box numbering and registration (UC44)', 'BoxesController, BoxService', 'Viên'],
    ['Batches', 'Create a Batch, lock the Standard Cost, admin approval, explore, fee tiers, tranche schedule (UC07–UC09); box rows of the Batch (boxes grouped by row code) and the farm map query within the delivery radius «planned» (UC25)', 'BatchesController, BatchService, BatchReviewService, BatchExploreService, FeeTiersController, FeeTierService, FundingReadiness, TrancheScheduleJob; BoxRow, FarmMapController, FarmMapService «planned»', 'Viên; farm map: Khôi'],
    ['Funding', 'Reservation (30 minutes) and contribution, funding close when the minimum viable capital and the pre-order ratio are reached, refunds otherwise (UC10–UC12); contribution by box rows with row allocation «planned»', 'FundingController, FundingService, FundingCloseService, FundingCloseJob, FundingAdminService, ContributionPaymentHandler; RowAllocation «planned»', 'Thiện'],
    ['Contracts', 'Contract template, PDF, sequential signing (UC14, UC15)', 'ContractsController, ContractService, ContractVoiding', 'Thiện'],
    ['Payments', 'VietQR payment requests, idempotent webhook, refunds, disbursement tranches, payouts (UC18, UC40)', 'PaymentsController, PaymentRequestService, PaymentWebhookController, PaymentWebhookService, IPaymentPurposeHandler, RefundService, DisbursementService, PayoutSendService', 'Thiện'],
    ['Settlement', 'Settlement calculation, review, feedback and payout (UC35–UC39); revenue lines and remuneration tiers «planned»', 'SettlementsController, SettlementService, SettlementReviewService, SettlementPayoutService, AdminSettlementsController', 'Thiện'],
    ['Portfolio', 'Investor portfolio and notifications (UC16)', 'PortfolioController, PortfolioService, NotificationsController, NotificationService', 'Khôi'],
    ['Production', 'Stocking, daily logs, box events, Batch timeline (UC17, UC21)', 'ProductionLogsController, ProductionLogService, SlotEventsController, SlotEventService, StockingService, TimelineService', 'Viên'],
    ['Evidence', 'Live capture, random capture requests, explanations, flagged-evidence review (UC45, UC47, UC48)', 'EvidenceController, EvidenceService, CaptureRequestService, CaptureRequestWorker, EvidenceReviewService, EvidenceExplanationService', 'Khôi'],
    ['Alerts', 'Raise, acknowledge and escalate alerts (UC19, UC20)', 'AlertsController, AdminAlertsController, AlertService, AlertJobWorker', 'Khôi'],
    ['Harvest', 'Harvest record per box (UC22) and public trace (UC33)', 'HarvestController, HarvestService, TraceController, TraceService', 'Viên'],
    ['Orders', 'Pre-orders with deposit, delivery, return, complaints, rating (UC27–UC34); bulk pre-order by crab count with the pre-order quota and 15-minute holds, weighing, forfeited deposits, invoiced sales (low grade or resale after a forfeit), the final order and the order QR «planned» (UC50, UC51, UC54)', 'PreordersController, PreorderService, OrdersController, OrderQueryService, OperatorOrdersController, OrderFulfilmentService, OrderReturnService, ComplaintService, OrderRatingService, ReservationExpiryJob, OrderCompletionJob, ComplaintEscalationJob; PreOrderQuota, PreOrderHold, InvoicedSaleService, FinalOrderReminderJob «planned»', 'Nhân'],
    ['Admin', 'Dashboards, audit log viewer, exports (UC41–UC43)', 'DashboardControllers (two classes), DashboardService, AuditLogController', 'Khôi; UC41: Thiện'],
    ['Health', 'Liveness, readiness and version endpoints', 'HealthController', 'Thiện'],
    [`Price Module ${PL}`, 'Price range per kg from 2–3 years of prices with backtest MAPE, shown as a range with a warning (UC49)', 'PriceSuggestionsController, PriceSuggestionService, SeasonalPriceModel, PriceBacktester', 'Nhân'],
    [`Ingestion ${PL}`, 'One common API for the Device &amp; Camera Simulator: logs, box events and photos, idempotent per message (UC52)', 'IngestionController, IngestionService, IngestionEnvelope', 'Viên'],
    ['Common', 'Cross-cutting code: JWT auth and role policies, ICurrentUser, audit log with hash chain, alert port, errors as ProblemDetails, recurring jobs, paging, CSV export', 'Auth, Auditing (IAuditLog, AuditLogService, AuditChainCheckJob), Alerts (IAlertRaiser, AlertServiceRaiser), Errors, Jobs (RecurringJob), Paging, Exports', 'all; audit log and jobs: Thiện'],
    ['Infrastructure', 'Ports and adapters: persistence (EF Core 10, database-first), storage, payment, signing, eKYC, crab detection, security', 'Persistence (AppDbContext, Entities), Storage (LocalFileStorage, CloudinaryFileStorage), Payments, Signing, Ekyc (Fake adapters), Detection (ICrabDetector), Security, DependencyInjection', 'all; detection: Nhân'],
    ['CrabShare.SettlementEngine', 'Pure settlement library without database or framework', 'SettlementCalculator, LargestRemainderAllocator', 'Thiện; research tests: Viên'],
    ['tests', 'API integration tests and settlement-engine property tests', 'CrabShare.Api.Tests (WebApplicationFactory, [Category=Database]), CrabShare.SettlementEngine.Tests (xUnit + FsCheck)', 'all; engine tests: Viên'],
    ['tools/CrabShare.DbMigrator', 'Runs database/migrations/V*.sql with DbUp; refuses --reset outside LocalDB', 'DbMigrator (DbUp)', 'Khôi'],
    ['tools/CrabShare.Load', 'Concurrent API and settlement load runner', 'Load runner', 'Nhân'],
  ];
  const dcols = [['#', 44], ['From → To', 220], ['Code reference (class or member)', 836], ['Kind', 180]];
  const drows = [
    ['1', 'Funding → Payments', 'FundingService(PaymentRequestService); FundingCloseService(RefundService); ContributionPaymentHandler : IPaymentPurposeHandler', 'service call'],
    ['2', 'Funding → Contracts', 'ContractVoiding.VoidUnsignedAsync in FundingService and FundingCloseService', 'static helper'],
    ['3', 'Orders → Payments', 'PreorderService, OrderQueryService(PaymentRequestService); ComplaintService, OrderCancellationService, OrderReturnService(RefundService); PreOrderDepositHandler, PreOrderBalanceHandler : IPaymentPurposeHandler', 'service call'],
    ['4', 'Harvest → Batches', 'BatchService.Validate', 'static helper'],
    ['5', 'Production → Batches', 'BatchService.Validate; FundingReadiness in StockingService', 'static helper'],
    ['6', 'Production → Alerts', 'ProductionLogService(AlertService), SlotEventService(AlertService)', 'service call'],
    ['7', 'Production → Boxes', 'BoxRangeRequest in StockingDtos', 'DTO'],
    ['8', 'Production → Evidence', 'TimelineService(EvidenceImageReader)', 'service call'],
    ['9', 'Evidence → Alerts', 'CaptureRequestJob(AlertService)', 'service call'],
    ['10', 'Payments → Batches', 'FundingReadiness.ReadyAt in DisbursementService', 'static helper'],
    ['11', 'Payments → Settlement', 'SettlementClosing.CloseIfPaidAsync in PayoutSendService', RED('cycle with 12')],
    ['12', 'Settlement → Payments', 'SettlementPayoutService(PayoutSendService)', RED('cycle with 11')],
    ['13', 'Common → Alerts', 'AlertServiceRaiser forwards IAlertRaiser to Features/Alerts AlertService; IAlertRaiser takes AlertType and AlertSeverity from Features/Alerts', RED('layer breach')],
    ['14', 'Infrastructure → Alerts, Evidence', 'DependencyInjection registers AlertJobWorker, CaptureRequestWorker and their options', RED('layer breach')],
    ['15', 'Common ⇄ Infrastructure', 'AuditLogService, AuditChain use AppDbContext; DependencyInjection, SecuritySetup use Common', 'mutual'],
    ['P1', 'Ingestion → Production', 'IngestionService uses ProductionLogService and SlotEventService for simulator logs and box events (UC52); photos go through IFileStorage', ST.plan],
    ['P2', 'Orders → Alerts', 'FinalOrderReminderJob raises FinalOrderDue through AlertService when the sales window closes (UC51)', ST.plan],
  ];
  const rcols = [['#', 44], ['Cycle or breach in code', 260], ['Proposal (decision for the team, not done)', 740], ['Result', 236]];
  const rrows = [
    ['1', 'Payments ⇄ Settlement (11, 12)', 'Add a payout-completed port in Common (for example IPayoutCompletedHandler), as IPaymentPurposeHandler already does for incoming payments. Settlement implements it to close the settlement when every payout is paid; PayoutSendService calls the port instead of SettlementClosing.', 'removes 11; only Settlement → Payments stays'],
    ['2', 'Common → Alerts (13)', 'Move AlertType and AlertSeverity next to IAlertRaiser in Common/Alerts, and move AlertServiceRaiser into Features/Alerts, registered by FeatureRegistry.', 'Common no longer references Features'],
    ['3', 'Infrastructure → Alerts, Evidence (14)', 'Register AlertJobWorker and CaptureRequestWorker (and their options) in FeatureRegistry, like the other feature jobs.', 'Infrastructure no longer references Features'],
    ['4', 'Common ⇄ Infrastructure (15)', 'Move the AppDbContext-based parts of Common/Auditing (AuditLogService, AuditChain, AuditChainCheckJob) into Infrastructure; Common keeps the IAuditLog interface.', 'only Infrastructure → Common stays'],
  ];
  const meta = META + ' · owners from docs/feature-map.md and the task packages of Register v1.4';
  tablePage(f, 'Table 4.5 (1/2)', 'Table 4.5 (1 of 2) – Backend packages', 'Backend packages of Figure 4.5', meta, [{ title: '(a) Packages', cols, rows, note: PENDING + ' (Funding: Batch opening condition and box rows; Batches: box rows; Orders: forfeited deposits, weighed-kg balance, InvoicedSale).' }]);
  tablePage(f, 'Table 4.5 (2/2)', 'Table 4.5 (2 of 2) – Backend dependencies and refactoring', 'Backend cross-module dependencies and planned refactoring (Figure 4.5)', meta, [
    { title: '(b) Cross-module dependencies — the number is the label of the arrow in Figure 4.5', cols: dcols, rows: drows,
      note: 'Removed in v1.4, still in code, not drawn: Orders ⇄ Catalog (OrderService(LowStockMonitor), CatalogService.SellUntil; OrderRatingService.ExtractForListing), Catalog → Alerts (LowStockMonitor), Offtake → Payments, Orders, Funding (OfftakeService, OfftakeDepositHandler, OrderService.LineAmount, FundingOptions) and Harvest → Catalog (HarvestService(CatalogService)). They disappear when the Catalog and Offtake modules are deleted.' },
    { title: '(c) Planned refactoring — decision proposal; the figure changes only after the code changes', cols: rcols, rows: rrows },
  ]);
}

function packageWeb(f) {
  const d = page(f, 'Package Diagram – Web');
  cap(d, 'Figure 4.6', 'Package Diagram: Web – web/src (React 19 + Vite + TypeScript)', META + ' · arrow number = row of Table 4.6, part (b)', 1340);
  const pkg = (key, label, x, y, w, h, extra = '', container = false) => d.vertex(label, S.pkg + 'fontSize=12;' + extra, x, y, w, h, { key, raw: true, container });
  const use = (a, b, label, style, pts) => d.edge(a, b, style + 'fontSize=11;', { label, raw: true, points: pts });

  pkg('app', `app<br>${sm('router.tsx: lazy routes per role, RequireRole · providers.tsx (TanStack Query)')}`, 20, 80, 290, 74);
  pkg('shared', 'shared', 20, 190, 300, 370, '', true);
  const sh = [['s_api', 'api', 'http.ts: axios + JWT, 401 → logout'], ['s_auth', 'auth', 'session store, RequireRole'], ['s_ui', 'ui · kit', 'UI kit, dialogs, breadcrumbs'], ['s_lib', 'lib', 'format, money'], ['s_contracts', 'contracts', 'ContractViewer'], ['s_settlement', 'settlement', 'SettlementStatement'], ['s_payments', 'payments', 'VietQrBox, simulated transfer'], ['s_layout', 'layout', 'SiteChrome']];
  sh.forEach(([k, n, s], i) => d.vertex(`${n}<br>${sm(s)}`, FP, 36 + (i % 2) * 140, 226 + Math.floor(i / 2) * 82, 128, 70, { key: k, raw: true }));
  pkg('feat', 'features — by area / role', 360, 80, 1010, 470, '', true);
  const g = grid(d, 380, 120, 200, 96, 245, 150, FP);
  g.put('accounts', `accounts<br>${sm('KYC · payout account · addresses')}`, 0, 0);
  g.put('trace', `trace<br>${sm('TracePage · order QR «planned»')}`, 1, 0);
  g.put('reports', `reports<br>${sm('dashboardApi')}`, 2, 0);
  g.put('landing', `landing<br>${sm('landing page, settle() demo')}`, 3, 0);
  g.put('investor', `investor<br>${sm('batches · funding (box rows «planned») · contracts · portfolio · own-row box details «planned» · settlement')}`, 0, 1);
  g.put('operator', `operator<br>${sm('batches · cost · boxes · logs · evidence · harvest · orders · price suggestion, tiers «planned»')}`, 1, 1);
  g.put('admin', `admin<br>${sm('users · operators · batches · finance · evidence · alerts · disputes · settings · audit')}`, 2, 1);
  g.put('auth', `auth<br>${sm('login · register · demo accounts')}`, 3, 1);
  g.put('timeline', `timeline<br>${sm('BatchTimeline, evidence media')}`, 0, 2);
  g.put('orders', `orders<br>${sm('pre-order · tracking · rating · complaints · bulk pre-order «planned»')}`, 1, 2);
  g.put('alerts', `alerts<br>${sm('alerts api')}`, 2, 2);
  g.put('farmmap', `farm map ${PL}<br>${sm('customer map of farms (UC25)')}`, 3, 2, PLANNED);
  // Phụ thuộc đo từ import tương đối trong web/src (số file)
  const call = dep, red = dep + E_RED;
  g.link('admin', 'operator', call, '1', 0.2);
  g.link('operator', 'admin', call, '8', -0.2);
  g.link('admin', 'orders', call, '2');
  g.link('admin', 'alerts', call, '3');
  g.link('admin', 'reports', call, '4');
  g.link('investor', 'operator', call, '5');
  g.link('investor', 'timeline', call, '6');
  g.link('investor', 'accounts', call, '7');
  g.link('operator', 'orders', call, '9', -0.2);
  g.link('operator', 'accounts', call, '10');
  g.link('operator', 'reports', call, '12');
  g.link('operator', 'timeline', call, '13');
  g.link('trace', 'operator', call, '15');
  use('operator', 'alerts', '11', dep + 'exitX=1;exitY=0.85;entryX=0;entryY=0.15;', [[847, 352], [847, 434]]);
  use('orders', 'accounts', '14', dep + 'exitX=0.1;exitY=1;entryX=0;entryY=0.5;', [[645, 532], [370, 532], [370, 168]]);
  use('app', 'feat', '«import»', depStraight + 'exitX=1;exitY=0.5;entryX=0;entryY=0.0787;');
  use('feat', 'shared', 'all features', depStraight + 'exitX=0;exitY=0.6277;entryX=1;entryY=0.5;');
  use('app', 'shared', '', depStraight + 'exitX=0.5172;exitY=1;entryX=0.5;entryY=0;');
  use('s_ui', 'landing', '16', red + 'exitX=0;exitY=0.3;entryX=0.5;entryY=0;', [[26, 329], [26, 172], [345, 172], [345, 72], [1215, 72]]);
  d.vertex('<b>Legend</b> — folder = package · dashed arrow = import dependency, numbered as in Table 4.6 part (b) · red arrow = breaks the layering rule · grey dashed, labelled «planned» = in Register v1.4, not in code yet.', LEGEND, 20, 580, 1350, 40, { raw: true });
  d.vertex('<b>Notes</b><br>• Features call the API only through shared/api/http.ts (token attached, 401 → logout); role gating is in app/router.tsx with RequireRole.<br>• Features <b>do</b> import each other (Table 4.6 part (b)): most imports go to operator, which holds the Batch, box and harvest API clients.<br>• Red: shared/ui/kit imports features/landing (settle()), so the v2.0 rule "shared UI never imports from features" does not hold; Table 4.6 part (c) proposes a fix (not done).<br>• Removed in v1.4, still in code, not drawn: features/store (StorePage, listings), shared/cart, the orders checkout, investor offtake, operator tags and listings, and their imports orders → store (7 files), store → operator (2) and shared/auth → shared/cart.', NOTE, 20, 630, 1350, 110, { raw: true });
  d.check();
}

/** Table 4.6 – package web, import chéo và đề xuất (AR-01, AR-02). */
function webTable(f) {
  const cols = [['Package', 190], ['Responsibility', 460], ['Main files', 480], ['Owner', 150]];
  const rows = [
    ['app', 'Router with lazy routes per role (RequireRole) and the TanStack Query provider', 'router.tsx, providers.tsx, index.css', 'all'],
    ['shared/api', 'The only HTTP client: axios with the JWT header, 401 → logout', 'http.ts', 'Thiện'],
    ['shared/auth', 'Session store and role guard', 'authStore.ts, session.tsx, RequireRole.tsx', 'Thiện'],
    ['shared/ui · kit', 'UI kit, dialogs, breadcrumbs', 'kit/, ActionDialog.tsx, Breadcrumbs.tsx', 'all'],
    ['shared/lib', 'Formatting and money (integer VND)', 'format.ts, money.ts', 'all'],
    ['shared/contracts', 'Contract viewer and its API client', 'ContractViewer.tsx, contractsApi.ts', 'Thiện'],
    ['shared/settlement', 'Settlement statement and feedback list', 'SettlementStatement.tsx, SettlementFeedbackList.tsx, settlementApi.ts', 'Thiện'],
    ['shared/payments', 'VietQR box and the simulated-transfer button', 'VietQrBox.tsx, SimulatePaymentButton.tsx, paymentsApi.ts', 'Thiện, Nhân'],
    ['shared/layout', 'Site chrome', 'SiteChrome.tsx', 'all'],
    ['features/accounts', 'KYC, payout account, delivery addresses', 'KycVerification.tsx, PayoutAccountForm.tsx, CustomerAddresses.tsx', 'Khôi'],
    ['features/trace', 'Public trace page; opened by the order QR «planned»', 'TracePage.tsx, traceApi.ts', 'Viên'],
    ['features/reports', 'Dashboard API client', 'dashboardApi.ts', 'Khôi'],
    ['features/landing', 'Landing page with the settlement demo', 'Landing.tsx, HeroGL.tsx, settlement.ts', 'Thiện'],
    ['features/investor', 'Investor portal: Batches, funding, contracts, portfolio, notifications, settlement; box rows and own-row box details «planned»', 'InvestorPortal.tsx, batches/, funding/, contracts/, portfolio/, notifications/, settlement/', 'Thiện, Khôi'],
    ['features/operator', 'Operator workspace: create Batch, cost, boxes, logs, evidence, harvest, orders, disbursements, settlement; price suggestion, floor price and tiers «planned»', 'OperatorCreateBatch.tsx, CostScheduleEditor.tsx, OperatorBatchDetail.tsx, OperatorDailyLog.tsx, OperatorEvidence.tsx, HarvestResultPanel.tsx, …', 'Viên, Nhân, Khôi'],
    ['features/admin', 'Admin console: users, operators, Batches, finance, evidence, alerts, disputes, settings, audit log', 'AdminDashboard.tsx, AdminBatches.tsx, AdminFinance.tsx, AdminEvidence.tsx, AdminDisputes.tsx, AdminAuditLog.tsx, …', 'Khôi, Thiện'],
    ['features/auth', 'Login, registration, demo accounts', 'LoginPage.tsx, RegisterPage.tsx, demoAccounts.ts', 'Thiện'],
    ['features/timeline', 'Batch timeline with evidence media', 'BatchTimeline.tsx, EvidenceMedia.tsx, timelineApi.ts', 'Viên'],
    ['features/orders', 'Customer pre-order, tracking, rating, complaints; bulk pre-order by crab count «planned»', 'PreorderPage.tsx, OrderTrackingPage.tsx, OrderHistoryPage.tsx, RateOrderPage.tsx, ordersApi.ts, complaintsApi.ts', 'Nhân'],
    ['features/alerts', 'Alerts API client', 'api.ts', 'Khôi'],
    [`features/farm map ${PL}`, 'Customer map of farms whose delivery radius covers the address (UC25)', '—', 'Khôi'],
  ];
  const dcols = [['#', 44], ['From → To', 260], ['Why (number of files)', 976]];
  const drows = [
    ['1', 'admin → operator', 'operator API clients and UI pieces (7)'], ['2', 'admin → orders', 'complaints API (1)'], ['3', 'admin → alerts', 'alerts API (1)'], ['4', 'admin → reports', 'dashboard API (1)'],
    ['5', 'investor → operator', 'shared Batch API client (1)'], ['6', 'investor → timeline', 'BatchTimeline (2)'], ['7', 'investor → accounts', 'KYC (1)'],
    ['8', 'operator → admin', 'admin API client (1)'], ['9', 'operator → orders', 'order fulfilment (2)'], ['10', 'operator → accounts', 'KYC, payout account (2)'], ['11', 'operator → alerts', 'alerts API (1)'], ['12', 'operator → reports', 'dashboard API (1)'], ['13', 'operator → timeline', 'BatchTimeline (1)'],
    ['14', 'orders → accounts', 'delivery addresses (2)'], ['15', 'trace → operator', 'harvest API (1)'],
    ['16', 'shared/ui/kit → landing', RED('settle() in kit.tsx and mock-data.ts (2): shared imports a feature')],
  ];
  const rcols = [['#', 44], ['Breach in code', 260], ['Proposal (decision for the team, not done)', 740], ['Result', 236]];
  const rrows = [
    ['1', 'shared/ui/kit → features/landing (16)', 'Move settle() from features/landing/settlement.ts to shared/lib (or keep the demo calculation in landing and pass its result to the kit).', 'shared no longer imports features'],
  ];
  tablePage(f, 'Table 4.6', 'Table 4.6 – Web packages', 'Web packages, cross-feature imports and planned refactoring (Figure 4.6)', META + ' · imports measured in web/src; owners from docs/feature-map.md and git history', [
    { title: '(a) Packages', cols, rows },
    { title: '(b) Cross-feature imports — the number is the label of the arrow in Figure 4.6', cols: dcols, rows: drows,
      note: 'Removed in v1.4, still in code, not drawn: orders → store (listings, cart; 7 files), store → operator (listings API; 2 files) and shared/auth → shared/cart.' },
    { title: '(c) Planned refactoring — decision proposal; the figure changes only after the code changes', cols: rcols, rows: rrows },
  ]);
}

function packageMobile(f) {
  const d = page(f, 'Package Diagram – Mobile');
  cap(d, 'Figure 4.7', 'Package Diagram: Mobile – mobile/lib (Flutter 3 + Riverpod 3 + go_router + Dio)', META + ' · packages described in Table 4.7', 1060);
  const pkg = (key, label, x, y, w, h, extra = '', container = false) => d.vertex(label, S.pkg + 'fontSize=12;' + extra, x, y, w, h, { key, raw: true, container });
  const use = (a, b, label, style, pts) => d.edge(a, b, style + 'fontSize=11;', { label, raw: true, points: pts });

  pkg('app', `app<br>${sm('app.dart · router.dart (role-based StatefulShellRoute) · routes.dart · theme/')}`, 20, 80, 280, 80);
  pkg('shared', `shared<br>${sm('models · widgets (gauge, cards, nav)')}`, 20, 240, 280, 80);
  pkg('core', `core<br>${sm('api (ApiClient: Dio + JWT) · auth (session, secure storage) · format — api and auth import each other')}`, 20, 400, 280, 80);
  pkg('feat', 'features — repository interface + Mock and Api implementation per feature', 400, 80, 700, 520, '', true);
  const g = grid(d, 420, 120, 200, 110, 225, 150, FP);
  g.put('m_auth', `auth<br>${sm('login · demo accounts')}`, 0, 0);
  g.put('m_onb', `onboarding<br>${sm('onboarding page')}`, 1, 0);
  g.put('m_account', `account<br>${sm('account · payout account')}`, 2, 0);
  g.put('m_investor', `investor<br>${sm('home · batches · portfolio · kyc · notifications · own-row box details «planned»')}`, 0, 1);
  g.put('m_operator', `operator<br>${sm('today · logs · slot_events · evidence (camera only) · harvest per box · alerts')}`, 1, 1);
  g.put('m_trace', `trace<br>${sm('scan · trace result · code parser · order QR «planned»')}`, 2, 1);
  g.put('m_common', `common<br>${sm('unsupported role page')}`, 0, 2);
  g.put('m_deliv', `delivery ${PL}<br>${sm('weigh on delivery, transit loss (UC29)')}`, 1, 2, PLANNED);
  g.link('m_deliv', 'm_operator', dep + E_PLANNED, 'part of «planned»');
  use('app', 'feat', '«import»', depStraight + 'exitX=1;exitY=0.4;entryX=0;entryY=0.0615;');
  use('feat', 'app', 'routes, theme', depStraight + E_RED + 'exitX=0;exitY=0.1154;entryX=1;entryY=0.75;');
  use('feat', 'shared', 'widgets', depStraight + 'exitX=0;exitY=0.3846;entryX=1;entryY=0.5;');
  use('feat', 'core', 'api, auth', depStraight + 'exitX=0;exitY=0.6923;entryX=1;entryY=0.5;');
  use('shared', 'app', 'theme', depStraight + E_RED + 'exitX=0.3;exitY=0;entryX=0.3;entryY=1;');
  use('shared', 'core', 'api', depStraight + 'exitX=0.5;exitY=1;entryX=0.5;entryY=0;');
  d.vertex('<b>Legend</b> — folder = package · dashed arrow = import dependency · red arrow = cycle between folders · grey dashed, labelled «planned» = in Register v1.4, not in code yet.', LEGEND, 20, 620, 1080, 40, { raw: true });
  d.vertex('<b>Notes</b><br>• Each feature exposes a repository interface with a Mock and an Api implementation; switching is one Riverpod provider line.<br>• Evidence is captured with the camera only (image_picker, no gallery) and carries GPS (geolocator); QR scan uses mobile_scanner.<br>• Red: features and shared import app/routes.dart and app/theme while app/router.dart imports the feature pages, so app ⇄ features is a folder-level cycle; core/api and core/auth also import each other. Table 4.7 part (b) proposes a fix (not done).<br>• Removed in v1.4, still in code, not drawn: operator/tags and operator/packing (packing by tag code).', NOTE, 20, 670, 1080, 110, { raw: true });
  d.check();
}

/** Table 4.7 – package mobile và đề xuất gỡ vòng (AR-01, AR-02). */
function mobileTable(f) {
  const cols = [['Package', 210], ['Responsibility', 470], ['Main files', 450], ['Owner', 150]];
  const rows = [
    ['app', 'App shell: role-based StatefulShellRoute router, route names, theme', 'app.dart, router.dart, routes.dart, theme/app_theme.dart, theme/app_images.dart', 'Khôi'],
    ['shared', 'Shared models and widgets (gauge, cards, navigation shell)', 'models/batch_enums.dart, widgets/app_ui.dart, widgets/nav_shell.dart, widgets/segmented_gauge.dart', 'Khôi'],
    ['core', 'API client (Dio + JWT), session and secure storage, formatting', 'api/api_client.dart, auth/session.dart, auth/auth_repository.dart, format/dates.dart, format/money.dart', 'Khôi, Thiện'],
    ['features/auth', 'Login and demo accounts', 'login_page.dart, demo_accounts.dart', 'Thiện'],
    ['features/onboarding', 'Onboarding page', 'onboarding_page.dart', 'Thiện'],
    ['features/account', 'Account and payout account', 'account_page.dart, payout_account_page.dart, data/payout_repository.dart', 'Khôi'],
    ['features/investor', 'Home, Batches, portfolio, eKYC, notifications; own-row box details «planned» (UC53)', 'home/, batches/, portfolio/, kyc/, notifications/, data/', 'Khôi, Viên'],
    ['features/operator', 'Today, daily logs, box events, camera-only evidence, harvest per box, alerts', 'today/, logs/, slot_events/, evidence/, harvest/, alerts/, data/', 'Viên, Khôi'],
    ['features/trace', 'QR scan and trace result; order QR «planned»', 'scan_page.dart, trace_result_page.dart, trace_code_parser.dart, trace_repository.dart', 'Viên'],
    ['features/common', 'Page for an unsupported role', 'unsupported_role_page.dart', 'Thiện'],
    [`features/operator delivery ${PL}`, 'Weighing on delivery and transit loss (UC29)', '—', 'Nhân'],
  ];
  const rcols = [['#', 44], ['Cycle in code', 260], ['Proposal (decision for the team, not done)', 740], ['Result', 236]];
  const rrows = [
    ['1', 'app ⇄ features, shared → app', 'Move the route names (app/routes.dart) and the theme (app/theme) into core, for example core/routing and core/theme; app keeps only app.dart and router.dart.', 'features and shared import only core'],
    ['2', 'core/api ⇄ core/auth', 'Move session.dart (token store) out of core/auth into its own folder, so core/api reads the token from it and core/auth depends on core/api and the session.', 'no cycle inside core'],
  ];
  tablePage(f, 'Table 4.7', 'Table 4.7 – Mobile packages', 'Mobile packages and planned refactoring (Figure 4.7)', META + ' · owners from docs/feature-map.md and git history', [
    { title: '(a) Packages', cols, rows, note: 'Removed in v1.4, still in code, not described: operator/tags and operator/packing.' },
    { title: '(b) Planned refactoring — decision proposal; the figure changes only after the code changes', cols: rcols, rows: rrows },
  ]);
}

// =====================================================================================================
// Mermaid (R2: sơ đồ lưu dạng mã nguồn) — cùng nội dung với Figure 4.1 (1/2, 2/2) và 4.4, rút gọn
const MERMAID_COMPONENT = `%% CrabShare – System Overview: Component Diagram (Figure 4.1, parts 1/2 and 2/2) · v3.2 · 05/11/2026 · Register v1.4
%% Code: develop @ 420a379. Dashed outline or line = «planned» (in Register v1.4, not in code yet).
%% Removed in v1.4 but still in code, not drawn: Catalog (listings, store, cart, checkout), Offtake, per-crab tags, PreorderBalance job.
%% Design decisions of 05/11/2026 applied here were confirmed by the lead (box rows, forfeited deposits, weighed-kg balance, InvoicedSale).
flowchart LR
  classDef comp fill:#eff6ff,stroke:#1d4ed8,color:#0f172a
  classDef ext fill:#fef3c7,stroke:#b45309,color:#0f172a
  classDef data fill:#f1f5f9,stroke:#1e293b,color:#0f172a
  classDef planned fill:#f8fafc,stroke:#64748b,stroke-dasharray:6 4,color:#475569

  subgraph C1["[C1] Web App · React 19 + Vite (Vercel)"]
    C11["[C1.1] Auth and session<br/>axios + JWT"]:::comp
    C12["[C1.2] Customer orders<br/>bulk pre-order, tracking, returns"]:::comp
    C13["[C1.3] Farm map «planned»"]:::planned
    C14["[C1.4] Investor portal<br/>box rows «planned»"]:::comp
    C15["[C1.5] Operator workspace"]:::comp
    C16["[C1.6] Admin console"]:::comp
    C17["[C1.7] Public trace page<br/>by order QR «planned»"]:::comp
  end
  subgraph C2["[C2] Mobile App · Flutter (Android)"]
    C21["[C2.1] Auth and session<br/>Dio + JWT"]:::comp
    C22["[C2.2] Investor tabs"]:::comp
    C23["[C2.3] Operator tabs<br/>live evidence, harvest per box"]:::comp
    C24["[C2.4] QR scan<br/>order QR «planned»"]:::comp
  end
  X5["[X5] Device & Camera Simulator «planned»"]:::planned
  X6["[X6] Map tile service «planned»"]:::planned
  X7["[X7] Static web resources<br/>Google Fonts · Pexels photos"]:::ext

  subgraph C3["[C3] CrabShare API · ASP.NET Core .NET 10 (Azure App Service)"]
    I1(("[I1] REST /api/*"))
    I2(("[I2] /api/ingest/v1/* «planned»")):::planned
    I3(("[I3] payment webhook"))
    CTRL["[C3.1] REST controllers<br/>51 classes in 49 files, all ApiController"]:::comp
    FEAT["[C3.2] Feature modules<br/>Auth · Accounts · Operators · Boxes · Batches · Funding · Contracts · Payments · Settlement · Portfolio · Production · Evidence · Alerts · Harvest · Orders · Admin · Health<br/>planned parts: box rows, farm map query, row allocation, pre-order quota and holds, invoiced sales, final order, order QR, revenue lines, tiers"]:::comp
    PRICE["Price Module «planned»"]:::planned
    INGEST["Ingestion «planned»"]:::planned
    JOBS["[C3.3] Background jobs<br/>8 hosted jobs · final-order reminder «planned»"]:::comp
    COMMON["[C3.4] Common<br/>auth, audit hash chain, errors"]:::comp
    ENGINE["[C3.5] SettlementEngine library"]:::comp
    INFRA["[C3.6] Infrastructure adapters<br/>Persistence · Storage · Payments · Signing · eKYC · Crab detection · Security"]:::comp
  end

  S1[("[S1] SQL Server<br/>Azure SQL / LocalDB")]:::data
  S2[("[S2] File storage<br/>/home/data/storage")]:::data
  X1["[X1] Payment intermediary (VietQR)<br/>in-process Fake today · sandbox «planned»"]:::ext
  X2["[X2] Viettel digital signing<br/>in-process Fake today · sandbox «planned»"]:::ext
  X3["[X3] eKYC provider<br/>in-process Fake today · sandbox «planned»"]:::ext
  X4["[X4] Cloudinary<br/>evidence photos"]:::ext
  M1["[M1] Crab detection model «planned»"]:::planned

  C11 -->|"HTTPS · JSON · Bearer JWT"| I1
  C21 -->|"HTTPS · JSON · Bearer JWT"| I1
  C13 -.->|"HTTPS tiles «planned»"| X6
  C1 -->|"HTTPS GET"| X7
  X5 -.->|"HTTPS POST · X-Api-Key «planned»"| I2
  X1 -.->|"HTTPS POST · HMAC-SHA256 «planned»"| I3
  I1 --> CTRL
  I2 -.-> INGEST
  I3 --> CTRL
  CTRL -.->|calls| FEAT
  JOBS -.->|invoke| FEAT
  FEAT -.->|use| COMMON
  FEAT -.->|"Settlement uses"| ENGINE
  FEAT -.->|"use ports"| INFRA
  FEAT -.- PRICE
  FEAT -.- INGEST
  INFRA -->|"TDS 1433 · TLS · Managed Identity"| S1
  INFRA -->|"file I/O"| S2
  INFRA -->|"HTTPS Upload API · signed URL"| X4
  INFRA -.->|"REST/HTTPS sandbox «planned» (in-process Fake today)"| X1
  INFRA -.->|"REST/HTTPS sandbox «planned» (in-process Fake today)"| X2
  INFRA -.->|"REST/HTTPS sandbox «planned» (in-process Fake today)"| X3
  INFRA -.->|"loads in-process «planned»"| M1
`;

const MERMAID_DEPLOYMENT = `%% CrabShare – System Overview: Deployment / CI-CD Diagram (Figure 4.4) · v3.2 · 05/11/2026 · Register v1.4
%% Sources: .github/workflows/*.yml and docs/deploy.md on develop @ 420a379. Dashed = «planned».
flowchart LR
  classDef node fill:#f8fafc,stroke:#1e293b,color:#0f172a
  classDef ext fill:#fef3c7,stroke:#b45309,color:#0f172a
  classDef planned fill:#f8fafc,stroke:#64748b,stroke-dasharray:6 4,color:#475569

  N1["[N1] User PC · browser"]:::node
  N2["[N2] Android phone · CrabShare APK"]:::node
  N3["[N3] demo machine · Device & Camera Simulator «planned»"]:::planned
  N14["[N14] Map tile service «planned»"]:::planned

  subgraph PREVIEW["Preview / staging (develop) · web only"]
    N8["[N8] Vercel Preview<br/>develop alias + one URL per PR"]:::node
  end
  subgraph PROD["Production · Azure East Asia · crabshare-rg"]
    N4["[N4] Vercel Production<br/>crabshare.vercel.app (main)"]:::node
    N5["[N5] Azure App Service crabshare-api<br/>Linux B1 · .NET 10 · deployed from develop"]:::node
    N6[("[N6] Azure SQL crabshare<br/>V001–V017")]:::node
  end
  subgraph CICD["CI/CD · GitHub"]
    N9["[N9] GitHub repository<br/>main · develop · feature branches"]:::node
    N10["[N10] GitHub Actions<br/>ci.yml · deploy-backend.yml · deploy-web.yml · release-mobile.yml · acceptance-tools.yml"]:::node
    N11["[N11] GitHub Releases<br/>draft demo APK"]:::node
  end
  subgraph EXT["External services"]
    N7["[N7] Cloudinary<br/>evidence photos"]:::ext
    N13["[N13] Sandbox providers<br/>VietQR intermediary · Viettel · eKYC<br/>in-process Fake today · sandbox «planned»"]:::ext
  end
  subgraph DEV["Local development · each member's PC"]
    N12["[N12] Developer PC<br/>Vite :5173 · dotnet run :5233 · LocalDB · Flutter"]:::node
  end

  N1 -->|"HTTPS GET (preview)"| N8
  N1 -->|"HTTPS GET static · CDN"| N4
  N1 -->|"HTTPS · JSON · Bearer JWT (CORS)"| N5
  N1 -.->|"HTTPS tiles «planned»"| N14
  N2 -->|"HTTPS · JSON · Bearer JWT"| N5
  N3 -.->|"HTTPS POST /api/ingest/v1 «planned»"| N5
  N8 -.->|"previews call the production API"| N5
  N5 -->|"TDS 1433 · TLS · Managed Identity"| N6
  N5 -->|"HTTPS Upload API · signed URL"| N7
  N5 -.->|"REST/HTTPS sandbox «planned» (in-process Fake today)"| N13
  N12 -->|"git push · pull request"| N9
  N9 -->|"push / pull_request triggers"| N10
  N10 -->|"Vercel CLI --prod"| N4
  N10 -->|"Vercel CLI preview · alias"| N8
  N10 -->|"OIDC · zip deploy · smoke test"| N5
  N10 -->|"DbMigrator · TDS/TLS"| N6
  N10 -->|"gh release create --draft"| N11
  N11 -->|"APK download"| N2
`;

function run(out) {
  const f = new DrawioFile();
  componentClient(f); componentData(f); componentTable(f);
  deploymentPage(f); deploymentTable(f);
  packageBackend(f); backendTable(f);
  packageWeb(f); webTable(f);
  packageMobile(f); mobileTable(f);
  f.write(path.join(out, 'CrabShare_Architecture.drawio'));
  fs.writeFileSync(path.join(out, 'Component.mmd'), MERMAID_COMPONENT, 'utf8');
  fs.writeFileSync(path.join(out, 'Deployment.mmd'), MERMAID_DEPLOYMENT, 'utf8');
  if (WARN.length) console.warn('LAYOUT WARNINGS (architecture):\n  ' + WARN.join('\n  '));
  WARN.length = 0;
  console.log('Architecture diagrams done');
}
if (require.main === module) run(process.argv[2] ?? path.join(__dirname, 'out'));
module.exports = { run };
