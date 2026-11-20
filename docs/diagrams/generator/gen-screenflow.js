'use strict';
// Screen Flow (SRS 3.1.1): màn hình web theo vai trò (web/src/app/router.tsx, InvestorPortal.tsx) và màn hình mobile (mobile/lib/app/routes.dart).
// Theo Phiếu đăng ký v1.4 và các vòng duyệt:
//  - không vẽ màn hình v1.4 đã bỏ (niêm yết, cửa hàng, giỏ hàng, checkout, quét tem, in tem, ngưỡng nước); chỉ liệt kê "Removed in v1.4 (still in code)";
//  - màn hình «planned» (chưa có route) nét đứt xám; màn hình có sẵn nhưng v1.4 thêm phần mới ghi "v1.4: … «planned»";
//  - số hình theo thứ tự trong SRS: web Figure 3.1a–c (3.1a tách hai phần để in A4 ngang ≥ 5 pt), mobile Figure 3.2;
//  - chiều cao ô màn hình theo số dòng chữ, các ô cùng hàng cao bằng nhau; ghi chú đặt bên phải khi trang đủ hẹp;
//  - thứ tự wizard góp vốn theo code: rủi ro → số tiền → hợp đồng → VietQR → xong.
// Đường nối định tuyến tay (máng dọc cạnh cột, kênh ngang phía trên cho các đường từ Login) nên không cắt nhau, không xuyên màn hình.
const path = require('path');
const { DrawioFile, S, escHtml } = require('./lib');

const META = 'v3.2 · 05/11/2026 · Register v1.4';
const PENDING = 'Design decisions of 05/11/2026 applied here were confirmed by the lead.';
const GREY = '#64748b';
const SW = 236, SH = 62, GAPR = 30; // bề rộng màn hình, chiều cao tối thiểu, khe giữa hai hàng
const TOP_LOGIN = 230, TOP_PLAIN = 130; // y hàng đầu: trang có kênh ngang cho đường từ Login cần chỗ phía trên
const NOTE_W = 430, MAX_W = 1840; // ghi chú bên phải nếu trang vẫn ≤ MAX_W (in A4 ngang, chữ 11 px ≥ 5 pt)
const PLANNED = `dashed=1;dashPattern=6 4;strokeColor=${GREY};fontColor=${GREY};`;
const FLOW = 'edgeStyle=none;rounded=1;html=1;endArrow=open;endFill=0;strokeColor=#334155;fontSize=11;labelBackgroundColor=#ffffff;fontFamily=Segoe UI;';
const FLOW_PLANNED = FLOW + `dashed=1;dashPattern=6 4;strokeColor=${GREY};fontColor=${GREY};`;
const COLW = SW + 64; // bước giữa hai cột trong một nhóm (khe 64 cho máng và cầu nối)

// ---------------- dữ liệu ----------------
// group: {key, title, sub, x (mép trái cột đầu), cols: [[screen...]]}; screen: [id, name, route, {planned, delta}]
// stub: [id, nhãn, x, hàng] = ô chuyển trang (tham chiếu sang hình khác), không phải màn hình
const PAGES = [
  {
    name: 'Web 1 – Public, Customer (1 of 2)', fig: 'Figure 3.1a',
    title: 'Screen Flow: web application – public, Customer and Investor areas (part 1 of 2: public and Customer)',
    groups: [
      { key: 'pub', title: 'Public', sub: 'no login', x: 60, cols: [[
        ['landing', 'Landing', '/'],
        ['login', 'Login', '/dang-nhap'],
        ['map', 'Farm & batch map', 'farms delivering to an address, batches open for pre-order', { planned: true }],
        ['register', 'Register', '/dang-ky'],
        ['qrtrace', 'Order trace by QR', 'opened by scanning the QR on the delivery note', { planned: true }],
      ]] },
      { key: 'cus', title: 'Customer area', sub: 'the menu reaches every screen', x: 420, cols: [[
        ['history', 'Order history', '/lich-su-don-hang'],
        ['addresses', 'Delivery addresses (Customer role only)', '/tai-khoan/dia-chi'],
        ['bulk', 'Bulk pre-order', 'crabs or kg, minimum quantity, delivery address', { planned: true }],
        ['preconfirm', 'Pre-order confirmation · deposit VietQR', '/xac-nhan-dat-truoc'],
        ['tracking', 'Order tracking · receive · balance · complaint · return', '/theo-doi-don-hang/:orderNo', { delta: 'balance = weighed kg × price − deposit' }],
        ['rate', 'Rate order', '/danh-gia-don-hang/:orderNo'],
      ]] },
    ],
    top: TOP_LOGIN,
    stubs: [['toInv', 'Investor portal → Figure 3.1a (2 of 2)', 780, 0], ['toOp', 'Operator workspace → Figure 3.1b', 1060, 0], ['toAdm', 'Admin console → Figure 3.1c', 1340, 0]],
    flows: [
      ['landing', 'login', 'adj', ''], ['landing', 'map', 'gutL', '', { k: 0, ey: 0.62 }], ['landing', 'register', 'gutL', '', { k: 1, ey: 0.38 }],
      ['login', 'toAdm', 'login', 'PlatformAdmin | EvidenceReviewer', { k: 0 }], ['login', 'toOp', 'login', 'OperatorMember', { k: 1 }],
      ['login', 'toInv', 'login', 'Investor', { k: 2 }], ['login', 'history', 'login', 'Customer', { k: 3 }],
      ['map', 'bulk', 'h', 'pre-order'], ['bulk', 'addresses', 'adj', 'add address'], ['bulk', 'preconfirm', 'adj', 'deposit'], ['preconfirm', 'tracking', 'adj', 'deposit paid'], ['tracking', 'rate', 'adj', 'completed'],
      ['history', 'tracking', 'gutR', '', { k: 0, ey: 0.5 }],
    ],
    notes: '<b>Authorization</b> — RequireRole in app/router.tsx: Customer area = Customer | Investor (an Investor may pre-order like a Customer; the delivery-address page is still Customer-only, a gap for investors who pre-order); Investor portal = Investor; Operator workspace = OperatorMember (+ operator_id claim); Admin console = PlatformAdmin | EvidenceReviewer. A 401 from the API logs the user out.'
      + '<br><b>Removed in v1.4 (still in code)</b>: Store · listing detail /cua-hang/:listingId?, Products /san-pham, Trace crab by tag /truy-xuat/:tagCode, Cart /gio-hang, Checkout /thanh-toan, Order confirmation /xac-nhan-don-hang, Pre-order by listing /dat-truoc/:listingId (replaced by Bulk pre-order).'
      + '<br>' + PENDING,
  },
  {
    name: 'Web 1 – Investor portal (2 of 2)', fig: 'Figure 3.1a',
    title: 'Screen Flow: web application – public, Customer and Investor areas (part 2 of 2: Investor portal)',
    groups: [
      { key: 'inv', title: 'Investor portal', sub: 'the menu reaches every screen', x: 380, cols: [[
        ['ihome', 'Portal home · KYC status', '/nha-dau-tu'],
        ['explore', 'Explore offerings', '/nha-dau-tu/kham-pha'],
        ['lot', 'Batch detail · timeline · alerts', '/nha-dau-tu/lo/:code'],
        ['rows', 'Box-row picker', 'free rows of the Batch, one investor per row, capital per row', { planned: true }],
        ['contribute', 'Contribute: disclosure → amount → contract → VietQR → done', '/nha-dau-tu/gop-von/:code', { delta: 'amount = total capital of the chosen rows' }],
        ['contracts', 'Contracts (view, sign)', '/nha-dau-tu/hop-dong'],
      ], [
        ['portfolio', 'Portfolio', '/nha-dau-tu/danh-muc'],
        ['position', 'Position detail', '/nha-dau-tu/danh-muc/:code'],
        ['ownboxes', 'Box details of own rows', 'photos, feeding, health per box', { planned: true }],
        ['settle', 'Settlement statements · feedback', 'portal view "settle"'],
        ['profile', 'Profile · eKYC · payout account', '/nha-dau-tu/ho-so'],
      ]] },
    ],
    top: TOP_PLAIN,
    stubs: [['fromLogin', 'Login (Figure 3.1a, 1 of 2) · Investor', 40, 0]],
    flows: [
      ['fromLogin', 'ihome', 'h', ''],
      ['ihome', 'explore', 'adj', ''], ['explore', 'lot', 'adj', ''], ['lot', 'rows', 'adj', 'reserve'], ['rows', 'contribute', 'adj', ''],
      ['lot', 'contribute', 'gutR', '', { k: 0, ey: 0.5 }], ['contribute', 'contracts', 'adj', 'sign'],
      ['ihome', 'portfolio', 'h', ''], ['ihome', 'profile', 'bridge', '', { gx: 380 + SW + 44, ey: 0.8 }],
      ['portfolio', 'position', 'adj', ''], ['position', 'ownboxes', 'adj', 'own rows'], ['position', 'settle', 'gutR', '', { k: 0, ey: 0.5 }],
    ],
    notes: '<b>Notes</b> — Every screen of the portal is reachable from its menu; arrows show the main task paths only. The notification bell (30 s poll) sits in the portal header. Batch detail → Contribute is the path in code today; v1.4 puts the box-row picker «planned» in between: each box row goes to one investor, the amount is the total capital of the chosen rows and the minimum is one row. The contribute wizard creates the contract before the VietQR transfer; signing does not block payment.'
      + '<br><b>Removed in v1.4 (still in code)</b>: Investor offtake commitments (portal view "offtake").'
      + '<br>' + PENDING,
  },
  {
    name: 'Web 2 – Operator workspace', fig: 'Figure 3.1b',
    title: 'Screen Flow: web application – Operator workspace (role OperatorMember)',
    groups: [
      { key: 'op', title: 'Operator workspace', sub: 'the sidebar menu reaches every screen', x: 380, cols: [[
        ['odash', 'Dashboard', '/operator'],
        ['oreg', 'Operator registration', '/operator/register'],
        ['okyc', 'Profile & eKYC', '/operator/kyc'],
        ['opayout', 'Payout account', '/operator/payout-account'],
        ['omembers', 'Staff members', '/operator/members'],
        ['oboxes', 'Boxes map (numbers, row codes, maintenance)', '/operator/boxes'],
        ['ocreate', 'Create batch · Standard Cost', '/operator/create-batch', { delta: 'box rows, prices, tiers, radius' }],
        ['oprice', 'Sale price range suggestion', 'season and holidays, range with a warning', { planned: true }],
        ['obatches', 'Batch list', '/operator/batch'],
        ['obatch', 'Batch detail · timeline · box events · stocking', '/operator/batch/detail'],
      ], [
        ['olog', 'Daily log', '/operator/log'],
        ['oalerts', 'Alerts', '/operator/alerts'],
        ['oevidence', 'Flagged evidence · explanation', '/operator/evidence/:id'],
        ['ocontract', 'Contracts to sign', '/operator/contract'],
        ['odisb', 'Disbursement tranches', '/operator/disbursements'],
        ['oharvest', 'Harvest sessions (per box)', '/operator/harvest'],
        ['oorders', 'Orders · deliver · returns · complaints', '/operator/orders/:orderNo', { delta: 'weighed kg, delivery note with QR' }],
        ['oinvoice', 'Invoiced sales (low-grade or resold crabs) and final order', 'invoice, floor-price check', { planned: true }],
        ['osettle', 'Settlement statement', '/operator/settlement'],
      ]] },
    ],
    top: TOP_PLAIN,
    stubs: [['fromLogin', 'Login (Figure 3.1a, 1 of 2) · OperatorMember', 40, 0]],
    flows: [
      ['fromLogin', 'odash', 'h', ''],
      ['oreg', 'odash', 'adj', 'approved'], ['oboxes', 'ocreate', 'adj', ''], ['ocreate', 'oprice', 'adj', 'price per kg'], ['ocreate', 'obatches', 'gutL', '', { k: 0, ey: 0.5 }],
      ['obatches', 'obatch', 'adj', ''], ['obatch', 'olog', 'bridge', '', { gx: 380 + SW + 32 }],
      ['olog', 'oalerts', 'adj', 'threshold breach'], ['oalerts', 'oevidence', 'adj', ''], ['oharvest', 'oorders', 'adj', ''], ['oorders', 'oinvoice', 'adj', 'low-grade, resale, final'], ['odisb', 'osettle', 'gutR', '', { k: 0, ey: 0.5 }],
    ],
    notes: '<b>Notes</b> — Every screen of the workspace is reachable from the sidebar menu; arrows show the main task paths only. Operator registration is open to any signed-in user before approval.'
      + '<br><b>Removed in v1.4 (still in code)</b>: Tags · label print · void /operator/tags, Listings · price /operator/listings, tag scanning when packing an order in /operator/orders/:orderNo, water-quality thresholds (pH, temperature, salinity) in Batch detail /operator/batch/detail.'
      + '<br>' + PENDING,
  },
  {
    name: 'Web 3 – Admin console', fig: 'Figure 3.1c',
    title: 'Screen Flow: web application – Admin console (roles PlatformAdmin | EvidenceReviewer)',
    groups: [
      { key: 'adm', title: 'Admin console', sub: 'the sidebar menu reaches every screen', x: 380, cols: [[
        ['adash', 'Dashboard · CSV reports', '/admin'],
        ['ausers', 'Users · KYC queue · operators', '/admin/users'],
        ['auser', 'User detail · lock/unlock · exception', '/admin/users/detail'],
        ['abatches', 'Batches to review', '/admin/batches'],
        ['abatch', 'Batch detail · approve / reject / revision · contracts', '/admin/batches/detail', { delta: 'floor price, tiers' }],
        ['afinance', 'Finance: funding · tranches · instructions · unmatched · settlements', '/admin/finance'],
        ['asettle', 'Settlement detail · calculate · propose · approve · send', '/admin/finance/settlement', { delta: 'revenue types, tiers' }],
      ], [
        ['aalerts', 'Escalated alerts (PlatformAdmin)', '/admin/alerts'],
        ['aevidence', 'Evidence review queue (EvidenceReviewer)', '/admin/evidence'],
        ['aevdetail', 'Evidence detail · verdict', '/admin/evidence/:id'],
        ['adisputes', 'Disputes · resolve', '/admin/disputes'],
        ['asettings', 'Settings · fee tiers', '/admin/settings', { delta: 'deposit ratio, minimums, hold time, limits' }],
        ['aprices', 'Historical price dataset (assumed screen)', 'import for the price module', { planned: true }],
        ['aaudit', 'Audit log · export', '/admin/audit-log'],
      ]] },
    ],
    top: TOP_PLAIN,
    stubs: [['fromLogin', 'Login (Figure 3.1a, 1 of 2) · PlatformAdmin | EvidenceReviewer', 40, 0]],
    flows: [
      ['fromLogin', 'adash', 'h', ''],
      ['ausers', 'auser', 'adj', ''], ['abatches', 'abatch', 'adj', ''], ['afinance', 'asettle', 'adj', ''], ['aevidence', 'aevdetail', 'adj', ''], ['asettings', 'aprices', 'adj', ''],
    ],
    notes: '<b>Notes</b> — Every screen of the console is reachable from the sidebar menu; arrows show the main task paths only. Evidence review pages need the EvidenceReviewer role; users and escalated alerts need PlatformAdmin. The settings page wires only the fee tiers today; minimum contribution and deposit ratio are set per Batch, the hold time in the server configuration (appsettings). Who imports the historical price dataset is an assumption to confirm.'
      + '<br><b>Removed in v1.4 (still in code)</b>: Storefront moderation /admin/storefront (product listings).',
  },
  {
    name: 'Mobile screen flow', fig: 'Figure 3.2',
    title: 'Screen Flow: Flutter app (go_router, StatefulShellRoute per role)',
    groups: [
      { key: 'mpub', title: 'Entry', sub: 'no login', x: 60, cols: [[
        ['onb', 'Onboarding', '/onboarding'],
        ['mlogin', 'Login (demo accounts)', '/login'],
        ['unsup', 'Unsupported role', '/unsupported'],
        ['mscan', 'Scan order QR', 'camera, no login', { planned: true }],
        ['mtrace', 'Order trace result', 'farm, Batch, harvest record', { planned: true }],
      ]] },
      { key: 'minv', title: 'Investor tabs', sub: 'the tab bar reaches every screen', x: 420, cols: [[
        ['mhome', 'Home · KYC banner · positions', '/i/home'],
        ['mbatches', 'Explore batches', '/i/batches'],
        ['mbatch', 'Batch detail · timeline · contribute link', '/batches/:code'],
        ['mpos', 'Portfolio position', '/i/portfolio/:code'],
        ['mownboxes', 'Box details of own rows', 'photos, feeding, health per box', { planned: true }],
        ['mnotif', 'Notifications', '/i/notifications'],
        ['macc', 'Account', '/i/account'],
        ['mkyc', 'eKYC camera', '/i/kyc'],
        ['mpayout', 'Payout account', '/account/payout-account'],
      ]] },
      { key: 'mop', title: 'Operator tabs', sub: 'the tab bar reaches every screen', x: 780, cols: [[
        ['mtoday', 'Today · capture requests · active batches', '/o/today'],
        ['mcapture', 'Capture photo (box)', '/o/capture?slot='],
        ['mslot', 'Box events (molt, mortality, restock, relocate)', '/o/slot-events/:batchCode'],
        ['mlogs', 'Daily logs', '/o/logs'],
        ['mlognew', 'New daily log', '/o/log/new?batch='],
        ['mharvest', 'Harvest session · record per box', '/o/harvest/:batchCode'],
      ], [
        ['mpack', 'Orders to deliver', '/o/pack'],
        ['mdeliver', 'Deliver order · ship · delivered', '/o/pack/:orderNo', { delta: 'weighed kg' }],
        ['malerts', 'Alerts · acknowledge', '/o/alerts'],
        ['mflag', 'Flagged evidence', '/o/evidence'],
        ['mexplain', 'Evidence explanation', '/o/evidence/:id'],
        ['moacc', 'Account', '/o/account'],
      ]] },
    ],
    top: TOP_LOGIN,
    stubs: [],
    flows: [
      ['onb', 'mlogin', 'adj', ''], ['mlogin', 'unsup', 'adj', 'other role'], ['mscan', 'mtrace', 'adj', ''],
      ['mlogin', 'mtoday', 'login', 'OperatorMember', { k: 0 }], ['mlogin', 'mhome', 'login', 'Investor', { k: 1 }],
      ['mhome', 'mbatches', 'adj', ''], ['mbatches', 'mbatch', 'adj', ''], ['mhome', 'mnotif', 'gutR', '', { k: 0, ey: 0.5 }], ['onb', 'mscan', 'gutL', '', { k: 0, ey: 0.5 }], ['mhome', 'mpos', 'gutL', '', { k: 0, ey: 0.62 }], ['mhome', 'mkyc', 'gutL', 'verify', { k: 1, ey: 0.38 }],
      ['mpos', 'mownboxes', 'adj', 'own rows'], ['macc', 'mkyc', 'adj', ''], ['macc', 'mpayout', 'gutR', '', { k: 0, ey: 0.5 }],
      ['mtoday', 'mcapture', 'adj', 'capture request'], ['mslot', 'mcapture', 'adj', 'evidence'], ['mtoday', 'mslot', 'gutL', '', { k: 0, ey: 0.5 }],
      ['mtoday', 'mharvest', 'gutL', '', { k: 1, ey: 0.3 }],
      ['mlogs', 'mlognew', 'adj', ''], ['mpack', 'mdeliver', 'adj', ''], ['mflag', 'mexplain', 'adj', ''],
      ['mtoday', 'mpack', 'h', ''], ['mtoday', 'malerts', 'bridge', 'bell', { gx: 780 + SW + 32, ey: 0.75 }], ['malerts', 'mflag', 'adj', ''],
    ],
    notes: '<b>Notes</b> — Camera-only capture (image_picker, no gallery) for evidence and eKYC; the Investor and Operator shells are chosen by the JWT role after login; every tab screen is reachable from the bottom tab bar; scanning the order QR needs no login. The farm devices and cameras are simulated by a separate tool, not an app screen.'
      + '<br><b>Removed in v1.4 (still in code)</b>: Scan QR of crab tags /scan → trace /trace/:tagCode (replaced by the order QR), Tags · activate /o/tags, tag photos in /o/capture?tagCode=, tag scanning when packing /o/pack/:orderNo, water-quality thresholds and readings (pH, temperature, salinity) in New daily log /o/log/new.',
  },
];

// ---------------- vẽ ----------------
const nameLines = (t) => Math.ceil(t.length / 30); // chữ đậm 12 px trong ô 236 px
const subLines = (t) => Math.ceil(t.length / 36);  // chữ 11 px
function boxH(s) {
  const [, name, route, opts = {}] = s;
  const subs = [opts.planned ? `«planned» · ${route}` : route, ...(opts.delta && !opts.planned ? [`v1.4: ${opts.delta} «planned»`] : [])];
  return Math.max(SH, 16 + 15 * nameLines(name) + 14 * subs.reduce((n, t) => n + subLines(t), 0));
}

/** Hàng có chiều cao chung (ô cao nhất của hàng đó trên mọi cột), để đường ngang giữa các cột luôn thẳng. */
function layout(page) {
  const rows = [];
  for (const g of page.groups) for (const col of g.cols) col.forEach((s, r) => { rows[r] = Math.max(rows[r] ?? SH, boxH(s)); });
  const Y = [page.top];
  for (let r = 1; r <= rows.length; r++) Y[r] = Y[r - 1] + rows[r - 1] + GAPR;
  const P = {};
  for (const g of page.groups) g.cols.forEach((col, c) => col.forEach(([id, name, route, opts = {}], r) => {
    P[id] = { id, name, route, opts, g, c, r, x: g.x + c * COLW, y: Y[r], w: SW, h: rows[r] };
  }));
  for (const [id, label, x, r] of page.stubs) P[id] = { id, name: label, route: '', opts: { stub: true }, x, y: Y[r] + (rows[r] - 54) / 2, w: SW - 10, h: 54 };
  return { P, rows, Y };
}

function drawGroups(d, page, L) {
  const { P, rows, Y } = L;
  for (const g of page.groups) {
    const n = Math.max(...g.cols.map(c => c.length));
    const gx = g.x - 40, gw = g.cols.length * COLW - 64 + 80;
    const bottom = Y[n - 1] + rows[n - 1] + 26;
    d.vertex(`<b>${g.title}</b>${g.sub ? `<br><font style="font-size:11px" color="#475569">${g.sub}</font>` : ''}`, S.group + 'fontSize=13;fontStyle=0;', gx, page.top - 50, gw, bottom - (page.top - 50), { key: g.key, raw: true });
  }
  for (const s of Object.values(P)) {
    if (s.opts.stub) {
      d.vertex(`<i>${s.name}</i>`, `rounded=1;whiteSpace=wrap;html=1;arcSize=40;fillColor=#f8fafc;strokeColor=${GREY};dashed=1;dashPattern=2 3;fontSize=12;fontColor=#334155;fontFamily=Segoe UI;`, s.x, s.y, s.w, s.h, { key: s.id, raw: true });
      continue;
    }
    const sub = s.opts.planned
      ? `<br><font style="font-size:11px" color="${GREY}">«planned» · ${s.route}</font>`
      : `<br><font style="font-size:11px" color="${GREY}">${s.route}</font>${s.opts.delta ? `<br><font style="font-size:11px" color="${GREY}">v1.4: ${s.opts.delta} «planned»</font>` : ''}`;
    d.vertex(`<b>${s.name}</b>${sub}`, S.screen + 'fontSize=12;' + (s.opts.planned ? PLANNED : ''), s.x, s.y, s.w, s.h, { key: s.id, raw: true });
  }
}

const pt = (s, fx, fy) => [s.x + s.w * fx, s.y + s.h * fy];
/** Đường thẳng từng đoạn với cổng ra/vào cố định; trả về polyline để đặt nhãn. */
function route(P, [a, b, kind, , o = {}]) {
  const s = P[a], t = P[b];
  if (!s || !t) throw new Error(`flow ${a}->${b}: unknown screen`);
  if (kind === 'adj') {
    const down = s.y < t.y;
    return { ex: [0.5, down ? 1 : 0], en: [0.5, down ? 0 : 1], pts: [] };
  }
  if (kind === 'h') {
    if (Math.abs((s.y + s.h / 2) - (t.y + t.h / 2)) > 0.5) throw new Error(`h-route not level ${a}->${b}`);
    const right = t.x > s.x; return { ex: [right ? 1 : 0, 0.5], en: [right ? 0 : 1, 0.5], pts: [] };
  }
  if (kind === 'gutL' || kind === 'gutR') {
    const L = kind === 'gutL';
    const gx = L ? s.x - 12 - 10 * o.k : s.x + s.w + 12 + 10 * o.k;
    const sy = s.y + s.h * o.ey, ty = t.y + t.h / 2;
    return { ex: [L ? 0 : 1, o.ey], en: [L ? 0 : 1, 0.5], pts: [[gx, sy], [gx, ty]] };
  }
  if (kind === 'bridge') {
    const ey = o.ey ?? 0.5, sy = s.y + s.h * ey, ty = t.y + t.h / 2;
    return { ex: [1, ey], en: [0, 0.5], pts: [[o.gx, sy], [o.gx, ty]] };
  }
  if (kind === 'login') { // ra cạnh phải Login, lên máng phải, chạy kênh ngang phía trên, xuống đỉnh màn hình đầu của nhóm (ở 0,9 bề rộng, tránh tiêu đề nhóm)
    const ey = 0.2 + 0.2 * o.k, gx = s.x + s.w + 14 + 10 * o.k, cy = 96 + 17 * o.k, dx = t.x + t.w * 0.9;
    return { ex: [1, ey], en: [0.9, 0], pts: [[gx, s.y + s.h * ey], [gx, cy], [dx, cy], [dx, t.y]] };
  }
  throw new Error('unknown route ' + kind);
}

function drawFlows(d, P, flows) {
  for (const f of flows) {
    const [a, b, kind, label] = f;
    const s = P[a], t = P[b];
    const r = route(P, f);
    const poly = [pt(s, ...r.ex), ...r.pts, pt(t, ...r.en)];
    // nhãn: giữa đoạn dài nhất (đường login: trên kênh ngang, gần chỗ rẽ xuống)
    const lens = poly.slice(1).map((p, i) => Math.hypot(p[0] - poly[i][0], p[1] - poly[i][1]));
    const total = lens.reduce((x, y) => x + y, 0);
    let at;
    if (kind === 'login') at = lens[0] + lens[1] + lens[2] - 60 - 6.5 * label.length / 2;
    else { const i = lens.indexOf(Math.max(...lens)); at = lens.slice(0, i).reduce((x, y) => x + y, 0) + lens[i] / 2; }
    const gx = total ? (2 * at / total - 1).toFixed(4) : 0;
    const planned = s.opts.planned || t.opts.planned;
    const style = (planned ? FLOW_PLANNED : FLOW) + `exitX=${r.ex[0]};exitY=${r.ex[1]};exitDx=0;exitDy=0;exitPerimeter=0;entryX=${r.en[0]};entryY=${r.en[1]};entryDx=0;entryDy=0;entryPerimeter=0;`;
    const pts = r.pts.map(([x, y]) => `<mxPoint x="${Math.round(x * 100) / 100}" y="${Math.round(y * 100) / 100}"/>`).join('');
    d.cells.push(`<mxCell id="${d.id()}" value="${escHtml(label)}" style="${style}" edge="1" parent="1" source="${d.id(a)}" target="${d.id(b)}"><mxGeometry x="${gx}" relative="1" as="geometry">${pts ? `<Array as="points">${pts}</Array>` : ''}</mxGeometry></mxCell>`);
  }
}

const LEGEND = '<b>Legend</b> (not UML; routes as in web/src/app/router.tsx and mobile/lib/app/routes.dart on develop @ 420a379) — box = screen (name, route); dashed grey with «planned» = screen in Register v1.4 with no route on develop; grey line "v1.4: … «planned»" = the screen exists, the v1.4 additions are not built yet; dotted rounded box = link to another figure or part.';

function noteHeight(text, width) {
  const plain = text.replace(/<br>/g, '\n').replace(/<[^>]+>/g, '');
  const lines = plain.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / Math.floor((width - 20) / 5.9))), 0);
  return lines * 15 + 22;
}

function run(out) {
  const f = new DrawioFile();
  for (const page of PAGES) {
    const d = f.page(page.name);
    d.text(`<b>${page.fig} – ${page.title}</b><br><font style="font-size:11px" color="${GREY}">${META}</font>`, 20, 10, 1040, 46, 'fontSize=15;');
    const L = layout(page);
    drawGroups(d, page, L);
    drawFlows(d, L.P, page.flows);
    const boxes = Object.values(L.P);
    const right = Math.max(...boxes.map(s => s.x + s.w), ...page.groups.map(g => g.x - 40 + g.cols.length * COLW + 16));
    const bottom = Math.max(...boxes.map(s => s.y + s.h)) + 26;
    const text = `${page.notes}<br>${LEGEND}`;
    let nx, ny, nw, nh, pageW, pageH;
    if (right + 30 + NOTE_W + 20 <= MAX_W) { // ghi chú bên phải
      nx = right + 30; ny = page.top - 50; nw = NOTE_W; nh = noteHeight(text, nw);
      pageW = nx + nw + 20; pageH = Math.max(bottom, ny + nh) + 30;
    } else { // ghi chú bên dưới
      nx = 20; ny = bottom + 24; nw = Math.max(right - 20, 980); nh = noteHeight(text, nw);
      pageW = nx + nw + 40; pageH = ny + nh + 30;
    }
    d.vertex(text, S.legend + 'fontSize=12;', nx, ny, nw, nh, { raw: true });
    const toXml = d.toXml.bind(d);
    d.toXml = () => cleanStyles(toXml().replace('pageWidth="1654"', `pageWidth="${Math.ceil(pageW / 10) * 10}"`).replace('pageHeight="1169"', `pageHeight="${Math.ceil(pageH / 10) * 10}"`));
  }
  f.write(path.join(out, 'CrabShare_Screen_Flow.drawio'));
  console.log('Screen flow done');
}

/** Gộp khoá trùng trong style (khoá sau thắng, như draw.io áp dụng), để XML chỉ còn một cỡ chữ cho mỗi ô. */
function cleanStyles(xml) {
  return xml.replace(/style="([^"]*)"/g, (m, st) => {
    const bare = [], keys = new Map();
    for (const tok of st.split(';').filter(Boolean)) {
      const i = tok.indexOf('=');
      if (i < 0) { if (!bare.includes(tok)) bare.push(tok); } else keys.set(tok.slice(0, i), tok.slice(i + 1));
    }
    return `style="${[...bare, ...[...keys].map(([k, v]) => `${k}=${v}`)].join(';')};"`;
  });
}
if (require.main === module) run(process.argv[2] ?? path.join(__dirname, 'out'));
module.exports = { run, PAGES };
