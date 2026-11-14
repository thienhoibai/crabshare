#!/usr/bin/env node
// CrabShare — dựng dữ liệu mẫu ở nhiều bước của quy trình, chỉ qua API công khai (không chạm cơ sở dữ liệu).
// Cách chạy:  node demo-flows.mjs <apiBaseUrl> [--yes]
// Chạy lại an toàn: bước nào đang có bản ghi đúng giai đoạn thì bỏ qua; giai đoạn đã bị người thử đi tiếp thì tạo bản mới.
// Xem README.md cùng thư mục.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const startedAt = Date.now();
const argv = process.argv.slice(2);
const BASE = (argv.find((a) => !a.startsWith('--')) ?? '').replace(/\/+$/, '');
if (!/^https?:\/\/[^/]+(\/.*)?$/.test(BASE)) {
  console.error('Cách chạy: node demo-flows.mjs <apiBaseUrl> [--yes]   ví dụ: node demo-flows.mjs http://localhost:5298');
  process.exit(2);
}
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(BASE);
if (!LOCAL && !argv.includes('--yes')) {
  console.error(`Máy chủ ${BASE} không phải máy local. Script sẽ tạo đơn, khoản góp, hợp đồng, khiếu nại... bằng các tài khoản mẫu.`);
  console.error('Chạy lại với --yes nếu chắc chắn muốn ghi dữ liệu mẫu lên máy chủ này.');
  process.exit(2);
}

// ---------------------------------------------------------------- cấu hình
const T1 = 'CS-2611-T1';          // lô T đang nhận đặt trước: chuỗi nguồn cua, phân hạng, giao hàng, khiếu nại
const FUND = 'CS-2610-03';        // lô P đang gọi vốn: khoản góp và hợp đồng
const VOTE_BATCH = 'CS-2610-01';  // lô P đang nuôi, bốn nhà đầu tư: biểu quyết tập thể
const VISIT_BATCH = 'CS-2611-P1'; // lô P đang nuôi: việc thăm trại
const STATION = { code: process.env.STATION_CODE || 'ST-NC-01', key: process.env.STATION_KEY || 'dk_demo_station_namcan_2026' };
const FARM_COORDS = { latitude: 8.7601, longitude: 105.0503 }; // trại Năm Căn, trùng trạm kiểm phẩm TKP-NC-01
const DOMAIN = 'crabshare.local';

const scriptDir = dirname(fileURLToPath(import.meta.url));
function demoPassword() {
  if (process.env.DEMO_PASSWORD) return process.env.DEMO_PASSWORD;
  const file = resolve(scriptDir, '../../web/src/features/auth/demoAccounts.ts');
  if (!existsSync(file)) throw new Error('Không thấy web/src/features/auth/demoAccounts.ts; đặt biến môi trường DEMO_PASSWORD.');
  const m = /const password = '([^']+)'/.exec(readFileSync(file, 'utf8'));
  if (!m) throw new Error('Không đọc được mật khẩu mẫu trong demoAccounts.ts; đặt biến môi trường DEMO_PASSWORD.');
  return m[1];
}
const PASSWORD = demoPassword();

// ---------------------------------------------------------------- tiện ích
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const vnd = (n) => `${Math.round(Number(n) || 0).toLocaleString('vi-VN')} đ`;
const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
const vnDate = (days = 0) => new Date(Date.now() + 7 * 3600e3 + days * 86400e3).toISOString().slice(0, 10);
const vnTime = (iso) => (iso ? new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '?');
const isLive = (iso) => Boolean(iso) && new Date(iso).getTime() > Date.now() + 30e3;
const code6 = () => Array.from({ length: 6 }, () => '0123456789ABCDEFGHJKMNPQRSTVWXYZ'[Math.floor(Math.random() * 32)]).join('');
const plain = (s) => s.replace(' [demo]', '');

const counters = { created: 0, kept: 0, warnings: 0 };
const log = {
  step: (t) => console.log(`\n== ${t}`),
  made: (t) => { counters.created++; console.log(`  [tạo]      ${t}`); },
  keep: (t) => { counters.kept++; console.log(`  [có sẵn]   ${t}`); },
  info: (t) => console.log(`  [..]       ${t}`),
  warn: (t) => { counters.warnings++; console.log(`  [cảnh báo] ${t}`); },
  fail: (t) => { counters.warnings++; console.log(`  [lỗi]      ${t}`); },
};

class ApiError extends Error {
  constructor(method, path, status, body) {
    const code = body && typeof body === 'object' ? (body.code ?? body.title) : undefined;
    const detail = body && typeof body === 'object' ? (body.detail ?? JSON.stringify(body.errors ?? body)) : String(body ?? '');
    super(`${method} ${path} → ${status} ${code ?? ''} ${detail ?? ''}`.trim());
    Object.assign(this, { method, path, status, code, detail, body });
  }
}

async function http(method, path, { token, json, form, headers = {} } = {}) {
  for (let attempt = 0; ; attempt++) {
    const init = { method, headers: { accept: 'application/json', ...headers } };
    if (token) init.headers.authorization = `Bearer ${token}`;
    if (json !== undefined) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(json); }
    if (form) init.body = form();
    let res;
    try {
      res = await fetch(BASE + path, init);
    } catch (e) {
      if (method === 'GET' && attempt < 3) { await sleep(1500 * (attempt + 1)); continue; }
      throw new ApiError(method, path, 0, { detail: e.cause?.message ?? e.message });
    }
    if ((res.status === 429 || res.status === 503) && attempt < 4) {
      const wait = Math.min(Number(res.headers.get('retry-after')) || 15, 65);
      log.info(`máy chủ báo bận (${res.status}), chờ ${wait} giây rồi thử lại`);
      await sleep(wait * 1000);
      continue;
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) throw new ApiError(method, path, res.status, data);
    return data;
  }
}

// Tài khoản mẫu: đăng nhập một lần, giữ token.
const ACCOUNTS = ['admin', 'operator', 'customer', 'investor1', 'investor2', 'investor3', 'investor4', 'qc1', 'qc2'];
const sessions = {};
async function login(name, email = `${name}@${DOMAIN}`) {
  if (sessions[name]) return sessions[name];
  const r = await http('POST', '/api/auth/login', { json: { email, password: PASSWORD } });
  sessions[name] = { name, email, token: r.accessToken, me: r.user };
  return sessions[name];
}
function as(name) {
  const call = async (method, path, opts = {}) => http(method, path, { ...opts, token: (await login(name)).token });
  return {
    get: (p) => call('GET', p),
    post: (p, json) => call('POST', p, json === undefined ? {} : { json }),
    put: (p, json) => call('PUT', p, { json }),
    form: (p, build) => call('POST', p, { form: build }),
  };
}
function formOf(fields, files = {}) {
  return () => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) f.append(k, String(v));
    for (const [k, [key, name]] of Object.entries(files)) f.append(k, new Blob([Buffer.from(demoImages()[key], 'base64')], { type: 'image/jpeg' }), name);
    return f;
  };
}
async function device(method, path, { messageId, form } = {}) {
  const headers = { 'X-Device-Key': STATION.key };
  if (messageId) headers['Idempotency-Key'] = messageId;
  return http(method, path, { headers, form });
}
async function pages(fetchPage) {
  const all = [];
  for (let page = 1; page < 50; page++) {
    const r = await fetchPage(page);
    all.push(...r.items);
    if (r.items.length === 0 || all.length >= r.total) break;
  }
  return all;
}

// Bảng kết quả cuối
const rows = [];
const missing = [];
const row = (stage, role, account, path, code, note = '') => rows.push({ stage, role, account, path, code: code || '—', note });
const notPossible = (stage, reason) => missing.push({ stage, reason });

// Chạy từng luồng độc lập: lỗi ở một luồng không chặn luồng khác.
async function flow(title, fn) {
  log.step(title);
  try { await fn(); } catch (e) {
    log.fail(e instanceof ApiError ? e.message : (e.stack ?? String(e)));
    notPossible(title, e instanceof ApiError ? `${e.method} ${e.path} trả ${e.status} ${e.code ?? ''}: ${e.detail ?? ''}` : e.message);
  }
}

// ---------------------------------------------------------------- dữ liệu mẫu
// Địa chỉ giao của khách, mỗi giai đoạn một nhà hàng ở TP.HCM; "[demo]" nằm trong tên địa điểm.
// target: vị trí đơn cần dừng lại (xem stageIndex).
const STAGES = {
  A: { site: 'DEMO-KHIEU-NAI', name: 'Nhà hàng Hải sản Bờ Kè [demo]', address: '38 Hoàng Diệu, phường Xóm Chiếu, TP. Hồ Chí Minh', lat: 10.7588, lng: 106.704, contact: 'Chị Ngọc Hân (quản lý bếp)', phone: '0908112201', lines: [['FAT-L-SPECIAL', 6], ['FAT-M-G1', 4]], due: 3, target: 7 },
  E: { site: 'DEMO-KN-ADMIN', name: 'Quán Cua Biển Năm Căn [demo]', address: '112 Nguyễn Gia Trí, phường Thạnh Mỹ Tây, TP. Hồ Chí Minh', lat: 10.8033, lng: 106.7151, contact: 'Anh Phúc (chủ quán)', phone: '0908112202', lines: [['FAT-L-SPECIAL', 10]], due: 4, target: 9 },
  B: { site: 'DEMO-NGHIEM-THU', name: 'Nhà hàng Hương Biển [demo]', address: '25 Lê Thánh Tôn, phường Sài Gòn, TP. Hồ Chí Minh', lat: 10.7797, lng: 106.7036, contact: 'Anh Khoa (bếp trưởng)', phone: '0908112203', lines: [['FAT-XL-SPECIAL', 5], ['FAT-L-SPECIAL', 5]], due: 5, target: 4 },
  B2: { site: 'DEMO-DANG-GIAO', name: 'Bếp Cua Cà Mau [demo]', address: '18 Võ Văn Ngân, phường Thủ Đức, TP. Hồ Chí Minh', lat: 10.8505, lng: 106.759, contact: 'Chị Thảo (thu mua)', phone: '0908112204', lines: [['FAT-M-G1', 10]], due: 6, target: 3 },
  C: { site: 'DEMO-CHO-XUAT', name: 'Nhà hàng Sóng Việt [demo]', address: '61 Võ Văn Tần, phường Xuân Hòa, TP. Hồ Chí Minh', lat: 10.7765, lng: 106.6903, contact: 'Anh Duy (bếp trưởng)', phone: '0908112205', lines: [['FAT-L-G1', 10]], due: 7, target: 2 },
  D: { site: 'DEMO-CHO-LAP', name: 'Quán nhậu Ba Khía Phú Mỹ Hưng [demo]', address: '9 Nguyễn Lương Bằng, phường Tân Mỹ, TP. Hồ Chí Minh', lat: 10.729, lng: 106.721, contact: 'Anh Tài (chủ quán)', phone: '0908112206', lines: [['FAT-XL-SPECIAL', 10]], due: 8, target: 1 },
  F: { site: 'DEMO-DA-COC', name: 'Nhà hàng Đại Dương Xanh [demo]', address: '140 Phan Xích Long, phường Cầu Kiệu, TP. Hồ Chí Minh', lat: 10.7998, lng: 106.6866, contact: 'Chị Mai (quản lý)', phone: '0908112207', lines: [['FAT-XL-G1', 12]], due: 12, target: 0 },
  G: { site: 'DEMO-CHO-COC', name: 'Cơm niêu Cua Đồng Bảy Hiền [demo]', address: '350 Trường Chinh, phường Bảy Hiền, TP. Hồ Chí Minh', lat: 10.793, lng: 106.653, contact: 'Anh Hùng (chủ quán)', phone: '0908112208', kg: ['FAT-L-SPECIAL', 3.3], due: 14, target: -1 },
};
const DELIVERY_KEYS = ['A', 'E', 'B', 'B2', 'C', 'D'];

// Mỗi con cua mẫu mang "loại kế hoạch" trong chữ số thập phân của khối lượng nhận (cân 0,1 g):
// .1 L Đặc cấp · .3 L Cấp 1 · .5 M Cấp 1 · .7 XL Đặc cấp · .9 XL Cấp 1 · .2 đo bằng trạm · .4 để Nhân viên kiểm phẩm giữ lại.
// Khối lượng tránh vùng cận ngưỡng 2 % quanh 200 / 300 / 350 g (vào Hold).
const TYPES = {
  'FAT-L-SPECIAL': { tenth: 1, range: [309, 340], c: 0.73, grade: 'SPECIAL' },
  'FAT-L-G1': { tenth: 3, range: [310, 340], c: 0.64, grade: 'G1' },
  'FAT-M-G1': { tenth: 5, range: [214, 288], c: 0.64, grade: 'G1' },
  'FAT-XL-SPECIAL': { tenth: 7, range: [364, 438], c: 0.72, grade: 'SPECIAL' },
  'FAT-XL-G1': { tenth: 9, range: [364, 438], c: 0.64, grade: 'G1' },
  STATION: { tenth: 2, weights: [370, 326, 408, 262] },
  HELD: { tenth: 4, range: [333, 338], c: 0.74, grade: 'SPECIAL' },
};
const DELIVERY_TYPES = Object.keys(TYPES).filter((k) => k.startsWith('FAT-'));
const typeOf = (w) => Object.keys(TYPES).find((k) => TYPES[k].tenth === Math.round(Number(w) * 10) % 10) ?? null;
let weightSeq = 0;
function gradingWeight(type) {
  const t = TYPES[type];
  const k = weightSeq++;
  const whole = t.weights ? t.weights[k % t.weights.length] : t.range[0] + ((k * 7) % (t.range[1] - t.range[0] + 1));
  return round(whole + t.tenth / 10, 1);
}
// Thước kẹp cho mức C mong muốn (C = g ÷ cm³), tránh vùng cận ngưỡng 2 % quanh 0,62 và 0,66.
function caliperFor(weight, type) {
  const t = TYPES[type];
  let cl = round(Math.cbrt(weight / t.c), 2);
  for (let i = 0; i < 30; i++) {
    const c = round(weight / cl ** 3, 4);
    if (t.grade === 'SPECIAL' ? c > 0.676 : c > 0.6345 && c < 0.645) return cl;
    cl = round(t.grade === 'SPECIAL' ? cl - 0.01 : c >= 0.645 ? cl + 0.01 : cl - 0.01, 2);
  }
  return cl;
}

// ---------------------------------------------------------------- trạng thái chung
const ctx = { ids: {}, qcByUserId: {} };
const nameOf = (userId) => ctx.qcByUserId[userId] ?? null;

// ================================================================= LUỒNG 0: kiểm tra
async function checkServer() {
  await http('GET', '/api/health/live');
  for (const a of ACCOUNTS) ctx.ids[a] = (await login(a)).me.userId;
  ctx.qcByUserId = { [ctx.ids.qc1]: 'qc1', [ctx.ids.qc2]: 'qc2' };
  log.info(`đăng nhập được ${ACCOUNTS.length} tài khoản mẫu`);
  const farms = await as('admin').get('/api/admin/operators');
  const farm = farms.items.find((o) => o.operatorId === sessions.operator.me.operatorId);
  ctx.farmStatus = farm?.status;
  if (farm && farm.status !== 'Approved')
    log.warn(`hộ nuôi "${farm.legalName}" đang ${farm.status}: không tạo hay duyệt Lô mới, không gửi ảnh bằng chứng và nhật ký được (API không có thao tác mở lại hộ nuôi đã đình chỉ).`);
  const t1 = await as('admin').get(`/api/admin/batches/${T1}`);
  ctx.t1Status = t1.batch.status;
  if (t1.batch.status !== 'Sourcing') log.warn(`${T1} đang ${t1.batch.status}, không còn nhận đặt trước: chỉ đi tiếp các đơn đã có.`);
}

// ================================================================= LUỒNG 1: chuẩn bị
async function prepare() {
  const op = as('operator');
  const farms = await op.get('/api/me/sites?siteType=Farm');
  const farm = farms.find((s) => s.isDefault) ?? farms[0];
  if (!farm) log.warn('hộ nuôi chưa có địa điểm trại nào.');
  else if (farm.latitude == null || farm.longitude == null) {
    await op.put(`/api/me/sites/${farm.siteId}`, {
      siteType: 'Farm', name: farm.name, addressLine: farm.addressLine, province: farm.province, contactName: farm.contactName,
      contactPhone: farm.contactPhone, isDefault: farm.isDefault, ...FARM_COORDS,
    });
    log.made(`khai toạ độ trại ${farm.siteCode} (${FARM_COORDS.latitude}, ${FARM_COORDS.longitude}): điểm xuất hàng cần toạ độ thì khách mới đặt trước được`);
  } else log.keep(`trại ${farm.siteCode} đã có toạ độ`);

  const cus = as('customer');
  const sites = await cus.get('/api/me/sites?siteType=DeliveryAddress');
  let made = 0;
  for (const s of Object.values(STAGES)) {
    let site = sites.find((x) => x.siteCode === s.site);
    if (!site) {
      site = await cus.post('/api/me/sites', {
        siteCode: s.site, siteType: 'DeliveryAddress', name: s.name, addressLine: s.address, province: 'TP. Hồ Chí Minh',
        latitude: s.lat, longitude: s.lng, contactName: s.contact, contactPhone: s.phone, isDefault: false,
      });
      log.made(`địa chỉ giao ${s.name} — ${s.address}`);
      made++;
    }
    s.siteId = site.siteId;
    s.addressLine = site.addressLine;
  }
  if (!made) log.keep(`khách đã có đủ ${Object.keys(STAGES).length} địa chỉ giao mẫu`);
}

// ================================================================= LUỒNG 2: lô T — đặt trước, nguồn cua, phân hạng, giao hàng
const ORDER_TERMINAL = ['Cancelled', 'Refunded', 'Forfeited', 'CancelRequested'];

async function loadT1State() {
  const op = as('operator');
  const [tranches, claims, decisions, receipts, pos, orders] = await Promise.all([
    op.get(`/api/batches/${T1}/delivery-tranches`), op.get('/api/operators/me/claims'), op.get(`/api/batches/${T1}/grade-decisions`),
    op.get(`/api/batches/${T1}/goods-receipts`), op.get(`/api/batches/${T1}/procurement-orders`),
    pages((p) => as('customer').get(`/api/preorders?Page=${p}&PageSize=100`)),
  ]);
  const shipments = {};
  for (const t of tranches.filter((x) => x.shipmentNo)) shipments[t.shipmentNo] = await op.get(`/api/shipments/${t.shipmentNo}`);
  return { tranches, claims, decisions, receipts, pos, shipments, orders: orders.filter((o) => o.batchCode === T1) };
}

// Trạng thái gọn của một đơn (dùng khi đẩy đơn đi từng bước).
async function orderState(orderNo) {
  const op = as('operator');
  const [tranches, claims, order] = await Promise.all([
    op.get(`/api/batches/${T1}/delivery-tranches`), op.get('/api/operators/me/claims'), as('customer').get(`/api/preorders/${orderNo}`),
  ]);
  const shipments = {};
  const tr = tranches.find((t) => t.orderNo === orderNo);
  if (tr?.shipmentNo) shipments[tr.shipmentNo] = await op.get(`/api/shipments/${tr.shipmentNo}`);
  return { tranches, claims, shipments, order, tr, sh: tr?.shipmentNo ? shipments[tr.shipmentNo] : null };
}

// Vị trí của đơn: -1 chờ cọc · 0 đã cọc · 0.5 phân bổ một phần · 1 đủ cua · 2 có chuyến · 3 đã xuất · 4 chờ khách nghiệm thu
// · 5 đã nghiệm thu, còn nợ · 6 đã trả đủ · 7 khiếu nại mở · 8 người nuôi đã phản hồi · 9 chuyển Admin · 10 đã chốt · 99 kết thúc khác.
function stageIndex(order, st) {
  if (!order || ORDER_TERMINAL.includes(order.status)) return 99;
  if (order.status === 'PendingDeposit') return isLive(order.holdExpiresAt) ? -1 : 99;
  const tr = st.tranches.find((t) => t.orderNo === order.orderNo);
  if (!tr) return 0;
  if (!tr.shipmentNo) {
    const full = tr.lines.every((l) => l.allocatedCrabs >= l.orderedCrabs);
    return full ? 1 : tr.lines.some((l) => l.allocatedCrabs > 0) ? 0.5 : 0;
  }
  const sh = st.shipments[tr.shipmentNo];
  if (sh.status === 'Scheduled') return 2;
  if (sh.status === 'Dispatched') return !sh.acceptance ? 3 : sh.acceptance.status === 'Pending' ? 4 : 99;
  if (sh.status === 'Accepted') {
    const claim = st.claims.find((c) => c.shipmentNo === sh.shipmentNo);
    if (!claim) return sh.acceptance?.balanceDue > 0 && !sh.acceptance.balancePaidAt ? 5 : 6;
    return { Open: 7, OperatorRejected: 8, OperatorAccepted: 8.5, Escalated: 9 }[claim.status] ?? 10;
  }
  return 99;
}

async function payDeposit(order) {
  const ref = order.deposit?.referenceCode;
  if (!ref) throw new Error(`đơn ${order.orderNo} không có mã cọc`);
  await as('customer').post('/api/dev/payments/simulate', { referenceCode: ref });
  const after = await as('customer').get(`/api/preorders/${order.orderNo}`);
  log.made(`khách chuyển cọc ${vnd(order.depositAmount)} cho đơn ${order.orderNo} (mã ${ref}) → ${after.status}`);
  return after;
}

async function placeOrder(key) {
  const s = STAGES[key];
  const due = vnDate(s.due);
  const body = s.kg
    ? { batchCode: T1, deliverySiteId: s.siteId, lines: [{ specCode: s.kg[0], mode: 'ByKg', qtyKg: s.kg[1] }], tranches: [{ seq: 1, dueDate: due, lines: [{ specCode: s.kg[0], qtyKg: s.kg[1] }] }] }
    : {
      batchCode: T1, deliverySiteId: s.siteId,
      lines: s.lines.map(([specCode, qtyCrabs]) => ({ specCode, mode: 'ByCount', qtyCrabs })),
      tranches: [{ seq: 1, dueDate: due, lines: s.lines.map(([specCode, qtyCrabs]) => ({ specCode, qtyCrabs })) }],
    };
  const order = await as('customer').post('/api/preorders', body);
  const what = s.kg ? `${s.kg[1]} kg ${s.kg[0]}` : s.lines.map(([c, n]) => `${n} con ${c}`).join(' + ');
  log.made(`đơn đặt trước ${order.orderNo} (${plain(s.name)}): ${what}, giao ${due}, cọc ${vnd(order.depositAmount)}`);
  return order;
}

// Đơn hiện hành của từng giai đoạn; giai đoạn đã bị đi tiếp (hoặc chưa có) thì đặt đơn mới và trả cọc.
async function ensureOrders(st) {
  const chosen = {};
  for (const key of [...DELIVERY_KEYS, 'F']) {
    const s = STAGES[key];
    const limit = key === 'F' ? 1 : s.target;
    const candidates = st.orders.filter((o) => o.deliveryAddress === s.addressLine)
      .map((o) => ({ o, idx: stageIndex(o, st) }))
      .filter((x) => x.idx <= limit)
      .sort((a, b) => b.idx - a.idx || b.o.placedAt.localeCompare(a.o.placedAt));
    let order = candidates[0]?.o;
    if (!order) {
      if (ctx.t1Status !== 'Sourcing') { log.warn(`${T1} không nhận đặt trước nên không tạo được đơn cho ${plain(s.name)}`); continue; }
      order = await placeOrder(key);
    } else log.keep(`đơn ${order.orderNo} (${plain(s.name)}) đang ${order.status}`);
    if (order.status === 'PendingDeposit') order = await payDeposit(order);
    chosen[key] = order.orderNo;
  }
  return chosen;
}

// ----- nguồn cua: đơn mua, phiếu nhận, kiểm đầu vào
let supplierCache = null;
async function supplier() {
  if (supplierCache) return supplierCache;
  const list = await as('operator').get('/api/parties/directory?roleType=Supplier');
  supplierCache = list.find((p) => p.legalName.includes('Rạch Gốc')) ?? list[0];
  if (!supplierCache) throw new Error('Không có nhà cung cấp nào đã xác minh để lập đơn mua nguồn.');
  return supplierCache;
}

async function poWithRoom(st, need) {
  for (const po of st.pos.filter((p) => p.agreedSpec.startsWith('[demo]') && ['Ordered', 'PartiallyReceived'].includes(p.status))) {
    const used = st.receipts.filter((r) => r.poNo === po.poNo).reduce((n, r) => n + (r.status === 'Completed' ? r.acceptedCount : r.declaredCount), 0);
    if (po.quantity - used >= need) return po;
  }
  const sup = await supplier();
  const po = await as('operator').post(`/api/batches/${T1}/procurement-orders`, {
    supplierPartyId: sup.partyId, orderedOn: vnDate(-2), quantity: Math.max(80, need + 10), unitPrice: 260_000,
    agreedSpec: '[demo] Cua thịt Scylla paramamosain 220–440 g, còn sống, đủ càng, giao tại trại Năm Căn',
  });
  log.made(`đơn mua nguồn ${po.poNo} với ${sup.legalName}: ${po.quantity} con × ${vnd(po.unitPrice)}`);
  st.pos.push(po);
  return po;
}

async function createReceipt(st, count, kind) {
  const po = await poWithRoom(st, count);
  const receipt = await as('operator').post(`/api/procurement-orders/${po.poNo}/receipts`, {
    lotCode: `LNDEMO-${kind}-${code6()}`, originRegion: kind === 'CHO' ? 'Đất Mũi, Ngọc Hiển, Cà Mau' : 'Tam Giang, Năm Căn, Cà Mau',
    harvestedOn: vnDate(-1), declaredSpecies: 'Scylla paramamosain', declaredCount: count, declaredWeightKg: round(count * 0.33, 3),
    note: kind === 'CHO' ? '[demo] Lô nguồn thứ hai, chờ Nhân viên kiểm phẩm kiểm từng con' : '[demo] Lô nguồn chính cho các đơn đặt trước',
  });
  st.receipts.push(receipt);
  log.made(`phiếu nhận ${receipt.receiptNo} (lô nguồn ${receipt.lotCode}, khai ${count} con) → phân ngẫu nhiên cho ${nameOf(receipt.qcUserId) ?? `kiểm phẩm #${receipt.qcUserId}`}`);
  return receipt;
}

async function inspectReceipt(receipt, types) {
  const qc = nameOf(receipt.qcUserId);
  if (!qc) throw new Error(`Phiếu ${receipt.receiptNo} được phân cho Nhân viên kiểm phẩm #${receipt.qcUserId}, không phải qc1/qc2: không kiểm thay được.`);
  let remaining = receipt.declaredCount - receipt.acceptedCount - receipt.rejectedCount;
  for (const type of types) {
    if (remaining <= 1) break; // chừa một con không đạt cho giống thực tế
    await as(qc).post(`/api/goods-receipts/${receipt.receiptNo}/inspections`, {
      species: 'Scylla paramamosain', sex: 'Male', maturity: 'Mature', speciesOk: true, alive: true, healthy: true, twoClaws: true, foodSafe: true,
      weightG: round(gradingWeight(type) + 1.0, 1),
    });
    remaining--;
  }
  for (; remaining > 0; remaining--)
    await as(qc).post(`/api/goods-receipts/${receipt.receiptNo}/inspections`, {
      species: 'Scylla paramamosain', sex: 'Male', maturity: 'Mature', speciesOk: true, alive: true, healthy: true, twoClaws: false, foodSafe: true,
      weightG: 301.0, note: '[demo] Thiếu càng trái, không nhận vào tồn',
    });
  const done = await as(qc).post(`/api/goods-receipts/${receipt.receiptNo}/complete`);
  log.made(`${qc} kiểm đầu vào xong phiếu ${receipt.receiptNo}: ${done.acceptedCount} con đạt (có mã cua nội bộ), ${done.rejectedCount} con không đạt`);
}

// ----- phân hạng
async function gradingQc() {
  for (const qc of ['qc1', 'qc2']) {
    const tasks = await as(qc).get('/api/qc/tasks');
    if (tasks.some((t) => t.kind === 'GradingSession' && t.batchCode === T1)) return qc;
  }
  return null;
}

async function measureManual(crabCode, weight, type) {
  const op = as('operator');
  const session = await op.post('/api/measurement-sessions', { crabCode, procedure: 'Manual' });
  const r = await op.post(`/api/measurement-sessions/${session.sessionNo}/values`, { weightG: weight, carapaceLengthCm: caliperFor(weight, type) });
  return r.decision;
}

async function stationSend(weight) {
  const messageId = randomUUID();
  const now = Date.now();
  const meta = {
    messageId, deviceCode: STATION.code, deviceType: 'Station', firmwareVersion: 'demo-flows-1.0', capturedAt: new Date(now - 2000).toISOString(),
    weightG: weight, weightSamples: 10, weightRangeG: 0.12, tofMm: 318, cameraHeightMm: 370, lastCalibratedAt: new Date(now - 86400e3).toISOString(),
    presets: { white: { exposureUs: 12000, gain: 1.0, lensPosition: 3.25 }, red: { exposureUs: 4000, gain: 1.0, lensPosition: 3.25 } }, doorClosed: true,
  };
  const accepted = await device('POST', '/api/devices/ingest/measurements', {
    messageId, form: formOf({ meta: JSON.stringify(meta) }, { white: ['white', 'white.jpg'], red: ['red', 'red.jpg'] }),
  });
  const m = await as('operator').get(`/api/measurement-sessions/${accepted.sessionNo}/measurements`);
  return m.decision;
}

async function measureAtStation(crabCode, weight) {
  // Trạm còn lượt đo mở (lần chạy trước dừng giữa chừng) thì gửi bản tin cho lượt đó trước.
  let open = null;
  try { open = await device('GET', `/api/devices/${STATION.code}/open-session`); } catch (e) { if (!(e instanceof ApiError && e.status === 404)) throw e; }
  if (open?.crabTag === crabCode) return stationSend(weight);
  if (open?.crabTag) { log.info(`trạm còn lượt đo mở cho cua ${open.crabTag}, gửi bản tin cho lượt đó trước`); await stationSend(330.2); }
  await as('operator').post('/api/measurement-sessions', { crabCode, stationCode: STATION.code, procedure: 'Station' });
  return stationSend(weight);
}

const SENSORY = ['Mai cứng, yếm chắc, càng đủ', 'Cua khoẻ, phản xạ nhanh, mai bóng', 'Thịt chắc, yếm sậm màu', 'Càng to đều, không dập'];
const waitingFirst = (d) => d.status === 'Draft' || (d.status === 'Hold' && !d.holdReasons.includes('QcHold'));

async function gradeT1(st, chosen) {
  const op = as('operator');
  // Nhu cầu cua của các đơn giao hàng chưa có chuyến.
  const demand = {};
  for (const key of DELIVERY_KEYS) {
    const tr = st.tranches.find((t) => t.orderNo === chosen[key]);
    if (!tr || tr.shipmentNo) continue;
    for (const l of tr.lines) demand[l.specCode] = (demand[l.specCode] ?? 0) + Math.max(0, l.orderedCrabs - l.allocatedCrabs);
  }
  const current = new Map(st.decisions.map((d) => [d.crabCode, d]));
  const readReceived = async () => (await op.get(`/api/batches/${T1}/crab-units?status=Received`)).filter((c) => c.lotCode.startsWith('LNDEMO-'));
  const pool = {};     // loại kế hoạch → cua đã nhận, chưa đo
  const pending = [];  // cua giao hàng đã đo mà chưa duyệt (lần chạy trước dừng giữa chừng)
  for (const c of await readReceived()) {
    const type = typeOf(c.receivedWeightG);
    if (!type) continue;
    const d = current.get(c.crabCode);
    if (!d) (pool[type] ??= []).push(c);
    else if (DELIVERY_TYPES.includes(type) && waitingFirst(d)) pending.push({ d, type });
  }
  for (const { type } of pending) demand[type] = Math.max(0, (demand[type] ?? 0) - 1);
  const firsts = st.decisions.filter((d) => waitingFirst(d) && !pending.some((p) => p.d.decisionNo === d.decisionNo)).length;
  const helds = st.decisions.filter((d) => d.status === 'Hold' && d.holdReasons.includes('QcHold')).length;
  const need = { ...demand, STATION: Math.max(0, 3 - firsts), HELD: Math.max(0, 1 - helds) };
  const lacking = [];
  for (const [type, n] of Object.entries(need)) for (let i = pool[type]?.length ?? 0; i < n; i++) lacking.push(type);

  if (lacking.length > 0) {
    let receipt = st.receipts.find((r) => r.lotCode.startsWith('LNDEMO-NHAN') && r.status === 'Inspecting');
    if (receipt) log.info(`phiếu nhận ${receipt.receiptNo} còn đang kiểm từ lần chạy trước, kiểm tiếp`);
    else receipt = await createReceipt(st, lacking.length + 1, 'NHAN');
    await inspectReceipt(receipt, lacking);
    for (const c of await readReceived()) {
      const type = typeOf(c.receivedWeightG);
      if (type && !current.has(c.crabCode) && !(pool[type] ?? []).some((x) => x.crabCode === c.crabCode)) (pool[type] ??= []).push(c);
    }
  } else log.keep('đã đủ cua đã nhận cho các bước phân hạng');

  // Cua giao hàng: đo tay (cân + thước kẹp), Nhân viên kiểm phẩm được phân duyệt ngay → cua được phân bổ cho đợt giao sớm nhất.
  let qc = await gradingQc();
  let approved = 0;
  const approve = async (decision, type) => {
    qc ??= await gradingQc();
    if (!qc) throw new Error(`Buổi đo của ${T1} được phân cho Nhân viên kiểm phẩm không phải qc1/qc2: không duyệt thay được.`);
    const r = await as(qc).post(`/api/grade-decisions/${decision.decisionNo}/approve`, { sensoryNote: `[demo] ${SENSORY[approved % SENSORY.length]}` });
    approved++;
    if (r.specCode !== type) log.warn(`cua ${r.crabCode} được duyệt ${r.specCode ?? 'dưới chuẩn'} thay vì ${type}`);
  };
  for (const { d, type } of pending) await approve(d, type);
  for (const [type, n] of Object.entries(demand)) {
    for (const crab of (pool[type] ?? []).splice(0, n)) await approve(await measureManual(crab.crabCode, round(crab.receivedWeightG - 1.0, 1), type), type);
  }
  if (approved) log.made(`đo tay và duyệt hạng ${approved} con cua cho các đơn đặt trước (Nhân viên kiểm phẩm ${qc})`);
  else log.keep('các đơn đặt trước không cần thêm cua đã duyệt');

  // Việc của kiểm phẩm: quyết định chờ duyệt lần đầu (đo bằng trạm) và một quyết định giữ lại chờ người thứ hai.
  for (const crab of (pool.STATION ?? []).splice(0, need.STATION)) {
    const d = await measureAtStation(crab.crabCode, round(crab.receivedWeightG - 1.0, 1));
    log.made(`trạm ${STATION.code} đo cua ${crab.crabCode} (${d?.weightG ?? '?'} g, C = ${d?.cIndex ?? '—'}) → quyết định ${d?.decisionNo ?? '?'} ${d?.status ?? ''}${d?.holdReasons?.length ? ` (${d.holdReasons.join(', ')})` : ''}`);
  }
  if (need.STATION === 0) log.keep(`đã có ${firsts} quyết định chờ duyệt lần đầu`);
  for (const crab of (pool.HELD ?? []).splice(0, need.HELD)) {
    const d = await measureManual(crab.crabCode, round(crab.receivedWeightG - 1.0, 1), 'HELD');
    qc ??= await gradingQc();
    if (!qc) throw new Error('Không xác định được Nhân viên kiểm phẩm của buổi đo.');
    const held = await as(qc).post(`/api/grade-decisions/${d.decisionNo}/hold`, { reason: '[demo] Càng phải hơi yếu, cần người thứ hai xem lại trước khi duyệt' });
    log.made(`${qc} giữ lại quyết định ${held.decisionNo} (cua ${held.crabCode}), chờ Nhân viên kiểm phẩm thứ hai`);
  }
  if (need.HELD === 0) log.keep('đã có quyết định giữ lại chờ người thứ hai');
}

// ----- giao hàng
async function dispatchLines(orderNo, tranche) {
  const op = as('operator');
  const [allocations, decisions] = await Promise.all([op.get(`/api/batches/${T1}/allocations`), op.get(`/api/batches/${T1}/grade-decisions?status=Approved`)]);
  const weights = new Map(decisions.map((d) => [d.crabCode, d.weightG]));
  return tranche.lines.map((l) => {
    const crabs = allocations.filter((a) => a.orderNo === orderNo && a.status === 'Active' && a.lineSpecCode === l.specCode);
    const grams = crabs.reduce((g, a) => g + (weights.get(a.crabCode) ?? 330), 0);
    return { lineId: l.lineId, dispatchedCrabs: l.allocatedCrabs, dispatchedKg: l.allocatedCrabs ? round(grams / 1000, 3) : 0 };
  });
}

async function advanceOrder(key, orderNo) {
  const s = STAGES[key];
  const op = as('operator');
  const cus = as('customer');
  for (let steps = 0; steps < 12; steps++) {
    const st = await orderState(orderNo);
    const { tr, sh } = st;
    const idx = stageIndex(st.order, st);
    if (idx >= s.target) {
      if (steps === 0 && idx === s.target) log.keep(`đơn ${orderNo} (${plain(s.name)}) đang đúng giai đoạn`);
      return idx;
    }
    if (idx < 1) {
      const have = tr ? tr.lines.map((l) => `${l.allocatedCrabs}/${l.orderedCrabs} ${l.specCode}`).join(', ') : 'chưa có đợt giao';
      log.warn(`đơn ${orderNo} mới được phân bổ ${have}`);
      if (s.target <= 1 || !tr || tr.lines.every((l) => l.allocatedCrabs === 0)) return idx;
    }
    if (idx < 2) {
      const created = await op.post(`/api/delivery-tranches/${tr.trancheId}/shipments`, {
        scheduledAt: new Date(`${vnDate(1)}T05:00:00+07:00`).toISOString(), transportCondition: '[demo] Thùng xốp, đá lạnh 18–22 °C, xe lạnh Năm Căn – TP.HCM',
      });
      log.made(`người nuôi lập chuyến giao ${created.shipmentNo} cho đơn ${orderNo} (QR đơn ${created.traceCode})`);
    } else if (idx === 2) {
      const lines = await dispatchLines(orderNo, tr);
      await op.post(`/api/shipments/${sh.shipmentNo}/dispatch`, { lines });
      log.made(`xuất chuyến ${sh.shipmentNo}, cân lần một: ${lines.filter((l) => l.dispatchedCrabs).map((l) => `${l.dispatchedCrabs} con ${l.dispatchedKg} kg`).join(' + ')}`);
    } else if (idx === 3) {
      const lines = sh.lines.map((l) => {
        const kg = l.dispatchedCrabs ? round(l.dispatchedKg - Math.max(0.005, l.dispatchedKg * 0.006), 3) : 0;
        return { lineId: l.lineId, receivedCrabs: l.dispatchedCrabs ?? 0, receivedKg: kg, acceptedCrabs: l.dispatchedCrabs ?? 0, acceptedKg: kg };
      });
      await op.post(`/api/shipments/${sh.shipmentNo}/receipt`, { lines });
      log.made(`ghi cân lần hai chuyến ${sh.shipmentNo} tại ${plain(s.name)}: chờ khách xác nhận nghiệm thu`);
    } else if (idx === 4) {
      const r = await cus.post(`/api/shipments/${sh.shipmentNo}/acceptance/confirm`);
      log.made(`khách nghiệm thu chuyến ${sh.shipmentNo}: tiền hàng ${vnd(r.acceptance.goodsValue)}, trừ cọc ${vnd(r.acceptance.depositApplied)}, còn ${vnd(r.acceptance.balanceDue)}; hoá đơn đợt đã lập`);
    } else if (idx === 5) {
      await cus.post('/api/dev/payments/simulate', { referenceCode: sh.balance.referenceCode });
      log.made(`khách trả phần còn lại ${vnd(sh.balance.amount)} qua VietQR (mã ${sh.balance.referenceCode})`);
    } else if (idx === 6) {
      const line = sh.lines.find((l) => (l.acceptedCrabs ?? 0) > 0);
      const claim = await cus.form(`/api/preorders/${orderNo}/claims`, formOf({
        ShipmentNo: sh.shipmentNo, SpecCode: line.specCode, ClaimType: key === 'A' ? 'Complaint' : 'Return', IssueType: key === 'A' ? 'Weak' : 'Dead',
        AffectedCrabs: 1,
        Description: key === 'A' ? '[demo] Một con cua yếu, càng không bám khi mở thùng lúc 6 giờ sáng.' : '[demo] Một con cua chết khi mở thùng, đề nghị hoàn tiền con này.',
      }, { Photo: ['claim', 'anh-khieu-nai.jpg'] }));
      log.made(`khách gửi khiếu nại ${claim.claimNo} kèm ảnh chụp cho chuyến ${sh.shipmentNo}`);
    } else if (idx === 7) {
      const claim = st.claims.find((c) => c.shipmentNo === sh.shipmentNo);
      await op.post(`/api/claims/${claim.claimNo}/respond`, { accept: false, response: '[demo] Biên bản nghiệm thu ghi đủ cua sống; ảnh chụp sau nhiều giờ bảo quản tại quán.' });
      log.made(`người nuôi từ chối khiếu nại ${claim.claimNo}`);
    } else if (idx === 8 || idx === 8.5) {
      const claim = st.claims.find((c) => c.shipmentNo === sh.shipmentNo);
      await cus.post(`/api/claims/${claim.claimNo}/customer-reply`, { agree: false });
      log.made(`khách không đồng ý phản hồi, khiếu nại ${claim.claimNo} chuyển Admin quyết định`);
    } else return idx;
  }
  throw new Error(`đơn ${orderNo} không tới được giai đoạn mong muốn`);
}

async function t1Flow() {
  if (!STAGES.A.siteId) throw new Error('Chưa có địa chỉ giao mẫu của khách (luồng chuẩn bị lỗi).');
  let st = await loadT1State();
  // Phiếu nhận chờ kiểm đầu vào: việc của kiểm phẩm, đồng thời giữ Lô ở Sourcing (còn phiếu đang kiểm thì Lô chưa chuyển Selling).
  const waiting = st.receipts.find((r) => r.lotCode.startsWith('LNDEMO-CHO') && r.status === 'Inspecting' && r.acceptedCount + r.rejectedCount === 0);
  if (waiting) log.keep(`phiếu nhận ${waiting.receiptNo} đang chờ kiểm đầu vào`);
  else if (ctx.t1Status === 'Sourcing') await createReceipt(st, 8, 'CHO');

  const chosen = await ensureOrders(st);
  st = await loadT1State();
  await gradeT1(st, chosen);

  const reached = {};
  for (const key of DELIVERY_KEYS) if (chosen[key]) reached[key] = await advanceOrder(key, chosen[key]);

  // Đơn chờ cọc: tạo sau cùng để mã QR còn hạn lâu nhất (đơn chỉ được giữ 15 phút).
  st = await loadT1State();
  let pendingG = st.orders.find((o) => o.deliveryAddress === STAGES.G.addressLine && o.status === 'PendingDeposit' && isLive(o.holdExpiresAt));
  if (pendingG) log.keep(`đơn ${pendingG.orderNo} đang chờ cọc tới ${vnTime(pendingG.holdExpiresAt)}`);
  else if (ctx.t1Status === 'Sourcing') { pendingG = await placeOrder('G'); st = await loadT1State(); }

  // Bảng kết quả
  const tasks = { qc1: await as('qc1').get('/api/qc/tasks'), qc2: await as('qc2').get('/api/qc/tasks') };
  const qcWith = (kind) => Object.entries(tasks).find(([, t]) => t.some((x) => x.kind === kind && x.batchCode === T1))?.[0] ?? '?';
  const shipOf = (key) => st.tranches.find((t) => t.orderNo === chosen[key])?.shipmentNo;
  const claimOf = (key) => st.claims.find((c) => c.shipmentNo === shipOf(key))?.claimNo;
  const note = (key, text = '') => (reached[key] !== undefined && reached[key] !== STAGES[key].target ? `CHƯA TỚI (vị trí ${reached[key]}) ` : '') + text;
  if (ctx.t1Status === 'Sourcing') row('Lô đang nhận đặt trước (đặt đơn mới)', 'Khách hàng', 'customer', `/khach/dat-truoc/${T1}`, T1);
  if (pendingG) row('Đặt trước chờ quét QR cọc (giữ 15 phút)', 'Khách hàng', 'customer', `/khach/don/${pendingG.orderNo}`, pendingG.orderNo, `cọc ${vnd(pendingG.depositAmount)}, hết hạn ${vnTime(pendingG.holdExpiresAt)}`);
  if (chosen.F) row('Đặt trước đã cọc (đã xác nhận), chờ cua', 'Khách hàng (theo dõi)', 'customer', `/khach/don/${chosen.F}`, chosen.F);
  if (chosen.D) row('Đợt giao đủ cua, chờ lập chuyến giao', 'Người nuôi', 'operator', `/operator/batches/${T1}/giao-hang`, chosen.D, note('D', plain(STAGES.D.name)));
  if (chosen.C) row('Chuyến giao đã lập, chờ xuất (cân lần một)', 'Người nuôi', 'operator', `/operator/deliveries/${shipOf('C')}`, shipOf('C'), note('C', chosen.C));
  if (chosen.B2) row('Chuyến đã xuất, chờ ghi cân lần hai khi giao', 'Người nuôi', 'operator', `/operator/deliveries/${shipOf('B2')}`, shipOf('B2'), note('B2', chosen.B2));
  if (chosen.B) row('Đã giao, chờ khách xác nhận nghiệm thu', 'Khách hàng', 'customer', `/khach/don/${chosen.B}`, shipOf('B'), note('B', chosen.B));
  if (chosen.A) {
    const inv = (await as('customer').get(`/api/preorders/${chosen.A}/deliveries`)).invoices[0];
    row('Đã nghiệm thu, có hoá đơn, đã trả đủ', 'Khách hàng (xem hoá đơn)', 'customer', `/khach/don/${chosen.A}`, inv?.invoiceNo ?? chosen.A, `đơn ${chosen.A}`);
    row('Khiếu nại mở kèm ảnh, chờ người nuôi phản hồi', 'Người nuôi', 'operator', '/operator/claims', claimOf('A'), note('A', `khách xem ở /khach/don/${chosen.A}`));
  }
  if (chosen.E) row('Khiếu nại đã chuyển Admin quyết định', 'Quản trị', 'admin', `/admin/claims/${claimOf('E')}`, claimOf('E'), note('E', chosen.E));
  const demoPos = st.pos.filter((p) => p.agreedSpec.startsWith('[demo]')).map((p) => p.poNo).join(', ');
  row(`Đơn mua nguồn ${T1} có phiếu nhận`, 'Người nuôi (xem)', 'operator', `/operator/batches/${T1}/nguon-cua`, demoPos);
  const waits = st.receipts.filter((r) => r.lotCode.startsWith('LNDEMO-CHO') && r.status === 'Inspecting');
  const wait = waits.find((r) => r.acceptedCount + r.rejectedCount === 0) ?? waits[0];
  if (wait) row('Phiếu nhận chờ kiểm đầu vào từng con', 'Kiểm phẩm', nameOf(wait.qcUserId) ?? `#${wait.qcUserId}`, `/qc/kiem-dau-vao/${wait.receiptNo}`, wait.receiptNo, `${wait.declaredCount} con`);
  const firsts = st.decisions.filter(waitingFirst);
  if (firsts.length) row(`Quyết định phân hạng chờ duyệt lần đầu (${firsts.length})`, 'Kiểm phẩm', qcWith('GradingSession'), `/qc/phan-hang/${T1}`,
    firsts.slice(0, 3).map((d) => d.decisionNo).join(', ') + (firsts.length > 3 ? ', …' : ''),
    [...new Set(firsts.map((d) => d.status + (d.holdReasons.length ? ` ${d.holdReasons.join('+')}` : '')))].join('; '));
  for (const d of st.decisions.filter((x) => x.status === 'Hold' && x.holdReasons.includes('QcHold')))
    row('Quyết định đã giữ lại, chờ kiểm phẩm thứ hai', 'Kiểm phẩm', qcWith('SecondReview'), `/qc/phan-hang/${T1}`, d.decisionNo, `cua ${d.crabCode}`);
}

// ================================================================= LUỒNG 3: nhà đầu tư — góp vốn, hợp đồng, biểu quyết
async function readyInvestor(inv) {
  const kyc = await as(inv).get('/api/me/kyc');
  if (kyc.verificationStatus !== 'Verified') throw new Error(`${inv} chưa xác minh danh tính (eKYC) nên không góp vốn được.`);
  const rd = await as(inv).get('/api/risk-disclosures/active');
  if (!rd.acknowledgedAt) {
    await as(inv).post('/api/risk-acknowledgements', { riskDisclosureId: rd.riskDisclosureId, scrolledToEnd: true });
    log.made(`${inv} xác nhận bản công bố rủi ro ${rd.versionCode}`);
  }
}

async function contractsOf(inv) {
  const list = (await as(inv).get('/api/me/contracts')).filter((c) => c.batchCode === FUND);
  return Promise.all(list.map((c) => as(inv).get(`/api/contracts/${c.contractId}`)));
}

// reserve → (QR + trả tiền trước) → hợp đồng → (người nuôi ký) → (nhà đầu tư ký) → (QR, có thể trả)
async function contribute(inv, amount, plan) {
  const api = as(inv);
  let c;
  try {
    c = await api.post(`/api/batches/${FUND}/contributions`, { amount });
    log.made(`${inv} giữ chỗ góp ${vnd(amount)} vào ${FUND} (khoản ${c.contributionId}, giữ tới ${vnTime(c.expiresAt)})`);
  } catch (e) {
    if (e.code !== 'funding.reservation_exists') throw e;
    c = (await api.get('/api/me/contributions')).find((x) => x.batchCode === FUND && x.status === 'Reserved');
    log.keep(`${inv} đang giữ chỗ khoản ${c.contributionId} (${vnd(c.amount)}), dùng tiếp khoản này`);
  }
  const pay = async () => {
    const pr = await api.post(`/api/contributions/${c.contributionId}/payment-requests`);
    if (plan.pay) {
      await api.post('/api/dev/payments/simulate', { referenceCode: pr.referenceCode });
      log.made(`${inv} chuyển ${vnd(pr.amount)} qua VietQR (mã ${pr.referenceCode}) → khoản góp đã xác nhận`);
    } else log.made(`${inv} mở mã VietQR ${pr.referenceCode} (${vnd(pr.amount)}), chưa chuyển tiền`);
  };
  if (plan.payFirst) await pay();
  let contract = await api.post(`/api/contributions/${c.contributionId}/contract`);
  log.made(`lập hợp đồng ${contract.contractNo} cho khoản góp ${c.contributionId}`);
  if (plan.operatorSign) { contract = await as('operator').post(`/api/contracts/${contract.contractId}/sign`); log.made(`chủ hộ nuôi ký hợp đồng ${contract.contractNo}`); }
  if (plan.investorSign) { contract = await api.post(`/api/contracts/${contract.contractId}/sign`); log.made(`${inv} ký hợp đồng ${contract.contractNo} → ${contract.status}`); }
  if (!plan.payFirst && plan.qr) await pay();
  return api.get(`/api/contracts/${contract.contractId}`);
}

async function investorFlow() {
  const fb = await as('investor1').get(`/api/funding/batches/${FUND}`);
  if (!fb.isOpen) throw new Error(`${FUND} không còn nhận góp vốn (trạng thái ${fb.status}).`);
  for (const inv of ['investor1', 'investor2', 'investor3', 'investor4']) await readyInvestor(inv);

  // investor1: hợp đồng chờ chủ hộ nuôi ký (khoản góp đã xác nhận)
  let c1 = (await contractsOf('investor1')).find((c) => c.status === 'Draft' && c.signingMethod === 'DigitalSignature' && c.contributionStatus === 'Confirmed');
  if (c1) log.keep(`hợp đồng ${c1.contractNo} của investor1 đang chờ chủ hộ nuôi ký`);
  else c1 = await contribute('investor1', 1_600_000, { payFirst: true, pay: true });
  row('Hợp đồng góp vốn chờ người nuôi ký', 'Người nuôi', 'operator', '/operator/contract', c1.contractNo, `${FUND}, investor1, ${vnd(c1.amount)}`);

  // investor2: người nuôi đã ký, chờ nhà đầu tư ký
  let c2 = (await contractsOf('investor2')).find((c) => c.status === 'OperatorSigned' && c.contributionStatus === 'Confirmed');
  if (c2) log.keep(`hợp đồng ${c2.contractNo} của investor2 đang chờ nhà đầu tư ký`);
  else c2 = await contribute('investor2', 2_100_000, { payFirst: true, pay: true, operatorSign: true });
  row('Hợp đồng người nuôi đã ký, chờ nhà đầu tư ký', 'Nhà đầu tư', 'investor2', '/nha-dau-tu/hop-dong', c2.contractNo, `${FUND}, ${vnd(c2.amount)}`);

  // investor3: đã ký đủ, chờ chuyển tiền (giữ chỗ 30 phút)
  const live3 = (await as('investor3').get('/api/me/contributions')).filter((x) => x.batchCode === FUND && x.status === 'Reserved' && isLive(x.expiresAt));
  let c3 = (await contractsOf('investor3')).find((c) => c.status === 'FullySigned' && live3.some((x) => x.contributionId === c.contributionId));
  if (c3) log.keep(`hợp đồng ${c3.contractNo} của investor3 đã ký đủ, khoản góp đang chờ chuyển tiền`);
  else c3 = await contribute('investor3', 1_800_000, { operatorSign: true, investorSign: true, qr: true, pay: false });
  const exp3 = (await as('investor3').get('/api/me/contributions')).find((x) => x.contributionId === c3.contributionId)?.expiresAt;
  row('Đã ký đủ hợp đồng, chờ chuyển tiền góp (giữ chỗ 30 phút)', 'Nhà đầu tư', 'investor3', `/nha-dau-tu/gop-von/${FUND}`, c3.contractNo, `${vnd(c3.amount)}, hết hạn ${vnTime(exp3)}`);

  // investor4: khoản góp đã xác nhận, hợp đồng đủ hai chữ ký
  let c4 = (await contractsOf('investor4')).find((c) => c.status === 'FullySigned' && c.contributionStatus === 'Confirmed' && c.amount === 2_600_000);
  if (c4) log.keep(`khoản góp ${vnd(c4.amount)} của investor4 đã xác nhận (hợp đồng ${c4.contractNo})`);
  else c4 = await contribute('investor4', 2_600_000, { operatorSign: true, investorSign: true, qr: true, pay: true });
  row('Khoản góp đã xác nhận, hợp đồng đủ chữ ký', 'Nhà đầu tư (theo dõi)', 'investor4', `/nha-dau-tu/danh-muc/${FUND}`, c4.contractNo, vnd(c4.amount));
}

async function voteFlow() {
  const admin = as('admin');
  let d = (await admin.get(`/api/batches/${VOTE_BATCH}/decisions`)).find((x) => x.status === 'Open');
  if (d) log.keep(`biểu quyết ${d.decisionNo} trên ${VOTE_BATCH} đang mở tới ${vnTime(d.closesAt)}`);
  else {
    d = await admin.post(`/api/batches/${VOTE_BATCH}/decisions`, {
      kind: 'EarlyLiquidation', votingHours: 336,
      proposal: `[demo] Đề xuất thanh lý sớm Lô ${VOTE_BATCH} vì giá cua thịt cuối năm giảm mạnh; cua còn lại bán qua đơn có hoá đơn. `
        + 'Phiếu thử để kiểm tra luồng biểu quyết: quá nửa vốn đồng ý thì Lô chuyển sang thanh lý ngay.',
    });
    log.made(`Admin mở biểu quyết ${d.decisionNo} (thanh lý sớm ${VOTE_BATCH}), hạn ${vnTime(d.closesAt)}`);
  }
  row('Biểu quyết tập thể đang mở', 'Nhà đầu tư', 'investor1..4', '/nha-dau-tu/bieu-quyet', d.decisionNo, `${VOTE_BATCH}; quá nửa vốn "Đồng ý" là Lô vào thanh lý`);
}

async function settlementCheck() {
  const mine = await as('investor1').get('/api/me/settlements');
  if (mine.length) row('Sao kê quyết toán đã công bố', 'Nhà đầu tư', 'investor1', '/nha-dau-tu/quyet-toan', mine[0].batchCode);
  const admin = await as('admin').get('/api/admin/settlements');
  if (admin.length) row('Lô chờ hoặc đang quyết toán', 'Quản trị', 'admin', '/admin/settlements', admin.map((x) => x.batchCode).join(', '));
  if (!mine.length && !admin.length) {
    log.warn('không có Lô nào ở giai đoạn quyết toán theo BR v1.5');
    notPossible('Quyết toán (Admin tính, công bố, duyệt; nhà đầu tư xem sao kê)',
      'chỉ Lô ở AwaitingSettlement/Settling mới tính được, và Lô chỉ tới đó từ Selling hoặc Liquidating khi đủ sáu điều kiện. '
      + 'CS-2605-01 (Settlement) và CS-2609-04 (Harvesting) là dữ liệu kiểu cũ nên job không chuyển; không có lô P nào đang Selling; '
      + `hộ nuôi đang ${ctx.farmStatus ?? '?'} nên không tạo được lô P mới để đi hết vòng.`);
  }
}

// ================================================================= LUỒNG 4: kiểm phẩm thăm trại
async function siteVisitFlow() {
  const find = async () => {
    for (const qc of ['qc1', 'qc2']) {
      const t = (await as(qc).get('/api/qc/tasks')).find((x) => x.kind === 'SiteVisit' && x.batchCode === VISIT_BATCH);
      if (t) return { qc, t };
    }
    return null;
  };
  let found = await find();
  if (found) log.keep(`việc thăm trại ${VISIT_BATCH} đã phân cho ${found.qc}`);
  else {
    const t = await as('admin').post(`/api/admin/batches/${VISIT_BATCH}/site-visits`);
    found = (await find()) ?? { qc: 'kiểm phẩm khác', t };
    log.made(`Admin phân ngẫu nhiên việc thăm trại ${VISIT_BATCH} (việc #${t.assignmentId}) cho ${found.qc}`);
  }
  row('Việc thăm trại giữa vụ (lập biên bản tại trại)', 'Kiểm phẩm', found.qc, `/qc/tham-trai/${found.t.assignmentId}`, `#${found.t.assignmentId}`, `${VISIT_BATCH}, vị trí trong 2 km quanh trại`);
}

// ================================================================= LUỒNG 5: Admin — xác minh đối tác
const ORG = [
  { legalName: 'Công ty TNHH Nhà hàng Hải Sản Bến Thành', fullName: 'Trần Minh Quân', customerType: 'Restaurant' },
  { legalName: 'Công ty TNHH Thực phẩm Biển Phú Nhuận', fullName: 'Lê Thị Bích Ngọc', customerType: 'CentralKitchen' },
  { legalName: 'Công ty CP Chuỗi Nhà hàng Cua Ngon Sài Gòn', fullName: 'Phạm Quốc Huy', customerType: 'Restaurant' },
];
const vnMobile = (seed, attempt) => ['0386', '0387', '0388', '0389', '0396', '0397'][(seed + attempt) % 6]
  + String((seed * 7919 + attempt * 104729 + 271828) % 1_000_000).padStart(6, '0');

async function partnerFlow() {
  const admin = as('admin');
  let done = null;
  for (let n = 1; n <= 9 && !done; n++) {
    const email = `demo-org-${n}@${DOMAIN}`;
    const name = `org${n}`;
    const org = ORG[(n - 1) % ORG.length];
    let s = null;
    try { s = await login(name, email); } catch (e) {
      if (e.status !== 401) throw e;
      for (let attempt = 0; attempt < 8 && !s; attempt++) {
        try {
          const r = await http('POST', '/api/auth/register', {
            json: {
              email, password: PASSWORD, fullName: org.fullName, phone: vnMobile(n, attempt), role: 'Customer', partyType: 'Company',
              legalName: org.legalName, registrationNo: `0318${String((n * 7349 + attempt * 911) % 1_000_000).padStart(6, '0')}`, customerType: org.customerType,
            },
          });
          s = sessions[name] = { name, email, token: r.accessToken, me: r.user };
          log.made(`đăng ký tài khoản tổ chức ${email} (${org.legalName}, người đại diện ${org.fullName})`);
        } catch (err) {
          if (err.code === 'auth.email_taken') { log.warn(`${email} đã có nhưng không đăng nhập được bằng mật khẩu mẫu, bỏ qua`); break; }
          if (!['auth.phone_taken', 'auth.registration_taken'].includes(err.code) || attempt === 7) throw err;
        }
      }
      if (!s) continue;
    }
    const party = await http('GET', '/api/me/party', { token: s.token });
    if (party.verificationStatus === 'Verified' || party.verificationStatus === 'Rejected') { log.info(`${email} đã được Admin xử lý (${party.verificationStatus}), dùng tài khoản kế tiếp`); continue; }
    const docs = await http('GET', '/api/me/party/documents', { token: s.token });
    if (!docs.length) {
      await http('POST', '/api/me/party/documents', {
        token: s.token, form: formOf({ DocType: 'BusinessRegistration', Note: '[demo] Giấy chứng nhận đăng ký doanh nghiệp (bản chụp)' }, { File: ['doc', 'giay-chung-nhan-dkdn.jpg'] }),
      });
      log.made(`${email} gửi ảnh giấy chứng nhận đăng ký doanh nghiệp để Admin xác minh`);
    } else log.keep(`${email} (${party.partyCode}) đã gửi giấy tờ, đang ${party.verificationStatus}`);
    done = { email, party: await http('GET', '/api/me/party', { token: s.token }) };
  }
  if (!done) throw new Error('Đã dùng hết demo-org-1..9.');
  row('Đối tác tổ chức chờ xác minh, có giấy tờ', 'Quản trị', 'admin', `/admin/parties/${done.party.partyId}`, done.party.partyCode, `${done.party.legalName} (${done.email})`);

  // Nhà cung cấp do người nuôi ghi nhận, chờ Admin xác minh
  const names = ['Vựa cua Út Mười Tam Giang', 'Vựa cua Bảy Hùng Đất Mũi', 'Cơ sở cua giống Năm Căn Xanh', 'Vựa cua Tư Lành Rạch Gốc'];
  const pending = await admin.get('/api/admin/parties?VerificationStatus=Pending&RoleType=Supplier&PageSize=100');
  let sup = pending.items.find((p) => names.includes(p.legalName));
  if (sup) log.keep(`nhà cung cấp ${sup.legalName} (${sup.partyCode}) đang chờ xác minh`);
  else {
    const all = await admin.get('/api/admin/parties?RoleType=Supplier&PageSize=100');
    const legalName = names.find((x) => !all.items.some((p) => p.legalName === x)) ?? `${names[0]} ${code6()}`;
    sup = await as('operator').post('/api/parties/external', {
      legalName, partyType: 'Household', representative: legalName.includes('Út Mười') ? 'Nguyễn Văn Mười' : 'Trần Văn Bảy',
      phone: `0918${String(Date.now() % 1_000_000).padStart(6, '0')}`, roleType: 'Supplier',
    });
    log.made(`người nuôi ghi nhận nhà cung cấp ${sup.legalName} (${sup.partyCode}), chờ Admin xác minh`);
  }
  row('Nhà cung cấp người nuôi ghi nhận, chờ xác minh', 'Quản trị', 'admin', `/admin/parties/${sup.partyId}`, sup.partyCode, sup.legalName);
}

// ================================================================= LUỒNG 6: giải ngân theo mốc
async function trancheFlow() {
  const list = await as('operator').get('/api/operator/tranches');
  let waiting = list.find((t) => t.status === 'Requested');
  if (waiting) log.keep(`đợt ${waiting.trancheNo} của ${waiting.batchCode} đang chờ Admin duyệt`);
  else {
    const can = list.find((t) => t.canRequest);
    if (can) {
      waiting = await as('operator').post(`/api/batches/${can.batchCode}/tranches/${can.trancheNo}/request`);
      log.made(`người nuôi xin giải ngân đợt ${can.trancheNo} của ${can.batchCode}`);
    }
  }
  if (waiting) { row('Mốc giải ngân chờ Admin duyệt', 'Quản trị', 'admin', '/admin/tranches', `${waiting.batchCode} đợt ${waiting.trancheNo}`); return; }
  const reasons = list.filter((t) => t.status === 'Planned' && !/chưa được giải ngân/.test(t.blockedReason ?? '')).map((t) => `${t.batchCode} đợt ${t.trancheNo}: ${t.blockedReason}`);
  log.warn('không có đợt giải ngân nào đủ điều kiện để người nuôi xin');
  notPossible('Mốc giải ngân chờ Admin duyệt', `không đợt nào đủ điều kiện mốc lúc này — ${reasons.join(' · ')}`);
}

// ================================================================= chạy
console.log(`CrabShare — dựng dữ liệu mẫu cho người thử trên ${BASE} (${vnTime(new Date().toISOString())})`);
await flow('Kiểm tra máy chủ và tài khoản mẫu', checkServer);
if (!sessions.admin) { console.log('\nKhông đăng nhập được tài khoản mẫu, dừng.'); process.exit(1); }
await flow('Chuẩn bị: toạ độ trại và địa chỉ giao của khách', prepare);
await flow(`Lô ${T1}: đặt trước, nguồn cua, phân hạng, giao hàng, khiếu nại`, t1Flow);
await flow(`Nhà đầu tư: góp vốn và hợp đồng ở ${FUND}`, investorFlow);
await flow(`Biểu quyết tập thể ở ${VOTE_BATCH}`, voteFlow);
await flow(`Kiểm phẩm: thăm trại ${VISIT_BATCH}`, siteVisitFlow);
await flow('Quản trị: đối tác và nhà cung cấp chờ xác minh', partnerFlow);
await flow('Quản trị: mốc giải ngân', trancheFlow);
await flow('Quyết toán', settlementCheck);

const width = (s) => [...String(s).normalize('NFC')].length;
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - width(s)));
const cols = [['stage', 'Giai đoạn'], ['role', 'Ai làm tiếp'], ['account', 'Tài khoản'], ['path', 'Trang web'], ['code', 'Mã'], ['note', 'Ghi chú']];
const w = cols.map(([k, h]) => Math.max(width(h), ...rows.map((r) => width(r[k] ?? ''))));
console.log('\n' + cols.map(([, h], i) => pad(h, w[i])).join(' | '));
console.log(w.map((n) => '-'.repeat(n)).join('-+-'));
for (const r of rows) console.log(cols.map(([k], i) => pad(r[k] ?? '', w[i])).join(' | '));
if (missing.length) {
  console.log('\nKhông tạo được:');
  for (const m of missing) console.log(`  - ${m.stage}: ${m.reason}`);
}
console.log('\nTài khoản: <tên>@crabshare.local và demo-org-*@crabshare.local, cùng mật khẩu mẫu của web.');
console.log(`Xong sau ${((Date.now() - startedAt) / 1000).toFixed(1)} giây: tạo mới ${counters.created} bước, giữ nguyên ${counters.kept} bước, ${counters.warnings} cảnh báo/lỗi.`);
process.exitCode = missing.some((m) => !/^Quyết toán|^Mốc giải ngân/.test(m.stage)) ? 1 : 0;

// Ảnh JPEG nhỏ vẽ sẵn (bản demo): ảnh khiếu nại, giấy tờ pháp lý mẫu, hai ảnh trạm đo (đèn trắng, đèn soi đỏ).
function demoImages() {
  return {
    claim:
      '/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAA' +
      'AAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAA' +
      'ACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0' +
      'AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAA' +
      'AAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAM' +
      'ZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAkGBwgHBgkIBwgKCgkLDRYPDQwMDRsUFRAWIB0iIiAdHx8kKDQsJCYx' +
      'Jx8fLT0tMTU3Ojo6Iys/RD84QzQ5Ojf/2wBDAQoKCg0MDRoPDxo3JR8lNzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3' +
      'Nzf/wAARCAEOAWgDASIAAhEBAxEB/8QAHAABAAIDAQEBAAAAAAAAAAAAAAQFAwYHAgEI/8QAShAAAQMCAQcHCQYEBQMEAwAAAQACAwQRBQYSFSExouETQVFh' +
      'Y4GxBxQiNDVkcZGhIzIzUnLBQmKS0RYlQ1OCRFXwk5Sy0hdz8f/EABgBAQEBAQEAAAAAAAAAAAAAAAABAgME/8QAJxEBAQACAgIBAwUAAwAAAAAAAAECERIh' +
      'AzFRE0HwBBQiMtFhYqH/2gAMAwEAAhEDEQA/AOsoiLi0IiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIi' +
      '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' +
      'oX3jc4poX3jc4pqm4j6R7Le4JpHst7gpGhfeNzimhfeNzimqbiPpHst7gmkey3uCkaF943OKaF943OKapuI+key3uCaR7Le4KRoX3jc4poX3jc4pqm4j6R7L' +
      'e4JpHst7gpGhfeNzimhfeNzimqbiPpHst7gmkey3uCkaF943OKaF943OKapuI+key3uCaR7Le4KRoX3jc4poX3jc4pqm4j6R7Le4JpHst7gpGhfeNzimhfeN' +
      'zimqbiPpHst7gmkey3uCkaF943OKaF943OKapuI+key3uCaR7Le4KRoX3jc4poX3jc4pqm4j6R7Le4JpHst7gpGhfeNzimhfeNzimqbiPpHst7gmkey3uCka' +
      'F943OKaF943OKapuI+key3uCaR7Le4KRoX3jc4poX3jc4pqm4j6R7Le4JpHst7gpGhfeNzimhfeNzimqbiPpHst7gskFbysrWcna/PnL5V4X5vTvl5bOzbas' +
      'y3PbpUWh9aZ3+CnpVsiIiCIiAiIgKprvWn93grZVNd60/u8EVd4T7Pi7/EqU5zWi7nADrKi4T7Pi7/Er7iP4Df1fsV1xm9RjK6m2flov9xn9QQSxk2EjCT/M' +
      'FTrJB+PH+oeK6/TjlPJVuiIuLsIiICIiAiKHjGIw4ThdViFRcx08ZeQNrjzDvNh3oMGP4/h2AUnnGJThgOpjGi73noA/8C5ziflbqnSEYVhsLIxsdUuLye5p' +
      'FvmVoWN4tV43iUtfXSF8sh1DmY3maOgBQFxy8lvp0mE+7peF+VqrFQ0Yth9O6EmxdTZzXNHTYk3+i6nQ1cFfSQ1dJIJIJmh7HDnBX5hXffJnBLBkXh4nBBcH' +
      'vaD+UvJH0196148rbqplJG0IiLowIiICw1lVBQ0ktVVSCOGJpe955gFmWreUyGafIvEGwa83Me8dLWvBPhfuS3UI0/FfK1VecPbhGHwCEGzX1Oc5zuuwItza' +
      'rlMO8rdU14GJ4ZC9hOt1M4tIHwde/wAwuZovPzydeMfpLAcew7H6XzjDagSAWz2EWew9BCs1+asDxiswPEYq6gkLZGH0m39F7edrhzhfonB8RixbC6XEIARH' +
      'URh4aTct6R3G4XbDLkxljpMREWmRERAREQEREBERBExb2fL3eIVJQ+tM7/BXeLez5e7xCpKH1pnf4LGXtYtkRFAREQEREBVNd60/u8FbKprvWn93girvCfZ8' +
      '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',
    doc:
      '/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAA' +
      'AAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAA' +
      'ACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0' +
      'AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAA' +
      'AAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAM' +
      'ZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAkGBwgHBgkIBwgKCgkLDRYPDQwMDRsUFRAWIB0iIiAdHx8kKDQsJCYx' +
      'Jx8fLT0tMTU3Ojo6Iys/RD84QzQ5Ojf/2wBDAQoKCg0MDRoPDxo3JR8lNzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3' +
      'Nzf/wAARCAGQASwDASIAAhEBAxEB/8QAGwABAQEBAQEBAQAAAAAAAAAAAAYFBwQDAgH/xABMEAAABAQACgYHBQcDAwMFAAAAAQIDBAUGERITFBYhMVWk0vAm' +
      'JzZBg7MVIjJHUVNhI1JxgZEHMzRCobHBJKLRYnKSQ0Wjc7LC4fH/xAAYAQEBAQEBAAAAAAAAAAAAAAAAAgEDBP/EACwRAQACAQEIAwABAwUAAAAAAAABAhEy' +
      'AxITIWFicZExQUJRBDOxIiOBodH/2gAMAwEAAhEDEQA/AO1gAgp7OZ/nU/K5REfdxbWA38slHpUX4nrHC94rGZXWu8vQEF0/5ycOn/OTieL2z6VudYXoCC6f' +
      '85OHT/nJw4vbPo3OsL0BBdP+cnDp/wA5OHF7Z9G51hegILp/zk4dP+cnDi9s+jc6wvQEF0/5ycOn/OThxe2fRudYXoCC6f8AOTh0/wCcnDi9s+jc6wvQEF0/' +
      '5ycOn/OThxe2fRudYXoCC6f85OHT/nJw4vbPo3OsL0BBdP8AnJw6f85OHF7Z9G51hegILp/zk4dP+cnDi9s+jc6wvQEF0/5ycOn/ADk4cXtn0bnWF6Agun/O' +
      'Th0/5ycOL2z6NzrC9AQXT/nJw6f85OHF7Z9G51hegILp/wA5OHT/AJycOL2z6NzrC9AQXT/nJw6f85OHF7Z9G51hegILp/zk4dP+cnDi9s+jc6wvQEF0/wCc' +
      'nHwj4yt5fCrioxzFst2wlYLB2uZEWgtOsyDi4+pOH1h0QBkUnGREwkELFRjmMecw8JWCRXstRFoLRqIhrjpE5jKJjE4BBe9Tn5AvRBe9Tn5A57X8+YXT78L0' +
      'AAdUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwK67Kx3h+Ykb4wK67Kx3h+YkRfRLa6oKF7KwPieYob4wKF7KwPieYob4U0QW1SCC9' +
      '6nPyBeiC96nPyBO1/PmFU+/C9AAHVAAAAAAAAAAAA8c4mLMplUVMIgjNqGaU4ok6zsWohkSqOqKNgIOYqal5tRZoWcMlK0rYbUZHfDNVlmSe7BT/AEsYUYCa' +
      'pmbzOPmk6h5i5BGzLn8Sk2WFINWglYRma1d3db8x4KVjImLm1Tt3bameOQto3miNOKNH2V8GyjK3dfRf6mDFoAjqcqGbzeHyV1UExOGItTUYxkyzS22nWZfa' +
      'X03Kyu++rvGlUs8fl8ZLZZLm2lzCYuGlpT98W0lJXUpRFpPRqIjK/wAQG+AkKpnFRSGSRccr0YvJsWZO4peC9hKsZYGHdBlcv5lX+l7F8IGpZhMamblMvm0k' +
      'i2VQRvrfh4dS8FZHbB0PGWs7/ho+o3AtgETJIuZzmUszxZyxEyN84ZtxUGtSW28ZgGRFjb3M9NyMtRF9R+CnU1pqYsy2cPsPy50zZZmRtOXafV6ySdJSzun1' +
      'rFpLVr7wwLkBJKqCZrmEsksOqDVMothUS9EKYWTTLZHos3h3Mz1e0Xx+g35aqZmb6JmiGI0GRNOsXs6VtKjSZmadP8tz/Exg9wCIzpm0LMIuVzTImX1pWqWx' +
      'aYdeKfwDMlIUnDuStH3u/wDX+xtTTCX1K5KphNZJCMlBFEIfiIdSMJZnbB0vEWsr/ho+o3AtgEjIJ7NZrRS5s4cMca+laYZEO0aSJRGaU+0pV9JXvq+g/ktn' +
      'U1mNCwkzlbzDsyMiS4UY1cluYWCaTwDTgnfv/oMwK8BL03UURP3IdbamIckIWiOg3GFY1p5FiMsLDsResRl6p6v0qAaAAAAAAAAAADArrsrHeH5iRvjArrsr' +
      'HeH5iRF9EtrqgoXsrA+J5ihvjAoXsrA+J5ihvhTRBbVIIL3qc/IF6IL3qc/IE7X8+YVT78L0AAdUAAAAAAAAMOb1GmVzWElpyyOiX4tKjYNjFYK8ErqL1lps' +
      'ZF8fyuP3CTuHm8kejpbEHDqawicx7JmphafaStFyO5d5Ef4H3gxozCDYmEC/BRaMNh9s23E/EjKxiXzIKITLoeaxkPGwctWRw+HBET5pL2ULcNRkpNrXIkle' +
      'xDRgqiadpVqdtNRMeg0YS0sNoS5cjMleoatFj7rmf4j9y+poSYw0FFQTD7sLFJUZv3bJLBp9onCNZGRl9CMaPBB0xNIRc3W3NoPCmbpOLI5eqyNBEZEWN1GR' +
      'W/MfqGpEoCp2ZvKXYKBZSxiXoRiBwUvFe5mZksiI76jtot3j0w9WQsTDlGMwEwVL1rwGo0mkm24eFglYsLDIr/zGki0a9Q9NRz5qn4ZqIiIOKiG3HUtXh8D1' +
      'VKOySPCUnWfw/MOY+MrkcVA1FMpquNYcbjyQSmUwxpNOAVk+thnfRr0afoP3UEgTNn4GMYiDhZhAOGuHfwMMivoUlSbldJl9SP6g/P1NKiCblMfEZM2S3jYU' +
      'wrAVa+AZYy+FbuIvh8SHllNQek0wczhW452EmB4pqGJLBYjBvdazw79x6jO2q19YfyfU9M55JXpfFTeHSp9ScNaIIyQlKTuRJTjLkZmRXM1H9CIf1mn5iVSw' +
      '86fmcKs2oXJlMoglJwk3uZkZunY7/Q9Hx1j1TmoEyqYQcCctjYp2MwiZNg2sFSiK5l6602Mi0/AedFZSlUrOOu+SyfyY4M2/t8f8vBv7X52+oBKKciJYkoRu' +
      'YIVLExCohtnJzJ0jNWGSTcwrGm//AEkf1HqiZIcxZmcLN3GImCjbWaQyaFIK1iuo1Hc9BHciLSQ/svn7EXMnJZEQsTAx6W8aTESSLuI1YSTQpSTK+g9Nx9Ia' +
      'eQcVN46VMmtUXBIStxNiIlEr7unTbUf4gM1dKYo5VES6OyePlsOUMl5xnGIeasRGlaLlfVfQZWMeimqZhpCqMfbJg4uMcw3Vsw5NIT8EoTczJPfY1HpuY+EH' +
      'WEJGIj0tQEcUZAKs9BLJpLuD95N14Jp+pK/wP1nUXpOLlxSaZHEwrJPupuxbAPVY8b9DDmEwpgpxJnJfOn2Xlm+b7LzDBt4pV7kdjUq+kz79JH+Y/LtPTHOR' +
      '+csTOFQbkLkyWlwSlYKb3IzMnSud/oWj4ax7JTP0TaQ+mIWAjCZUk1NtLxZOOEXeXr2Lv1mWoeaWVbCzWCbiZfBRrpnEZO8wZNoch1f9ZKWVvyuAzoKmH5PI' +
      'mYKOfhZrLoLGOqhPRpqW/e6iIiNwywiMzto7y/EfyQUzMICDiDgJhDQ8NGxCYtEI9LVJyY7krAIidK2oiMu6w1s54ZyJim4ODjYxiDWaImJh20qbbUWtNjUS' +
      'lmXfgJVrHzOq2jmkNLmZXMHXomGKKaUnEklTdi06XCMtJ2sZf00hzHrZkEIxUTs8ZLAiX4fEvkRaHLGRkr8dFv0+A1hI5+Qvoz0j6ImmTZTkuFZi+Mvg2tjf' +
      'jouPrEVbFFNlyyCpyPiIlhKXYlKnmEGhpWpSfXPCP/p0fiAqQE3Mqual8acI5KJm44UKcX9mlr90XtHY3CO5arWv8Ljcl8axMYFiNhF4bD7ZONqta5GQxr0A' +
      'AAAAAAMCuuysd4fmJG+MCuuysd4fmJEX0S2uqCheysD4nmKG+MCheysD4nmKG+FNEFtUggvepz8gXogvepz8gTtfz5hVPvwvQAB1QAAAAAACJq2URkZVcpj4' +
      'eWTKJhoVDmPXDRyWr4RWSSCN1Jkd9Zla5W0mPzJpJNYGFiEPsRDb03j1RUQuFWyrIk6DSR4Z2Uegr2JXf9L3ADcsQUhl06kSJ1LilUbFwDkRjoN3Gw5KVcyw' +
      '7lhpIivpLQX4FqHrXSC0zqLegnFQ0smcM6UVClb7J9SbYZW+JGd7Hr+PdZAGRCQMBVMJJZbJINDsC9BrJpyNaUwuHdZI9KrKJSyVbUWDr16BoftBl0fM5JDw' +
      'MBBxEY5lLTi1IdbbMkoMjM7mpOk+63f8BVgGRI0jDzmTxcTLImBinZUpw3YSLddaNbWF6ykLLDNR2MzLC03P6aQo6VxMtnE6N2VvwkI9EG5CGtxtSUpO2ERJ' +
      'SszTdRX1aiL8BXAMyJaqIeYu1BIouClcTFsQLjjjqmnGk+0g0kREtaTM/wCn1GDmdNVm7OzaQmYqmyZgmAN0vYTcsA16sMyM9Or6946OA3IkFQMxjKnKonZW' +
      '+yUDBqZhoRbrRuvrUdzPQs0pLTbSoeBcnnMvqSUzuChphGGtpbce06uGRikKPCwSsZXMlGZ61f8AcL4AyImaU5FzViFmkJDuy2bwzqkml1TZm8wpZmpCjSpS' +
      'dR6NOg/hrHnmEnj4qrZtHuymZqhnYNLLC4aOQya1JvpMkvJM0nfRhfoQvgDIlqQhZhK6IYgYyWvojIZpTeIJxozcO5ndJkvBtp7zLUPhm3EFPJZPIBCoNayS' +
      'iZwqzT9qSS9VR2MywiO2o9Jf1sAGZEHBymfyGAmcqlTDylPxK4iDmDC2TJOH/K6lw76LaTSSrlq0j8xklmz1US+KjoSZRrMNAKYei4aLbYU46Zkq6cBbZ4Os' +
      'tRd2g9YvgG5HLkSKeopFMqTI4s30zQoosKIYMsXjMLSZuXM7f1/Ue6Lh4lNcOTSNlMwS2+2yiEbRGw7anHGzwjI0G8RLL6afjo1joY+L0NDvuNOvMNOOMqwm' +
      'lrQRm2drXSZ6jt8AyI2YSaMndVwcRNJRFpgTl5sPqajEoSS1HhGR4DhKUnWR6NJ91tItIdhqGYbYh20tMtpJKEIKxJItREQ+gDAAABoAAADArrsrHeH5iRvj' +
      'ArrsrHeH5iRF9EtrqgoXsrA+J5ihvjAoXsrA+J5ihvhTRBbVIIL3qc/IF6IL3qc/IE7X8+YVT78L0AAdUAAAAAAAAAAPLNI5qWS9+MfStSGk3wUFdSj1ERfU' +
      'zsQzFziYwsO65MpbDwuA1jCcVHFiS0kWCtZpLBMr3PQf0wu7TmcC1MoB6DeNSUOpthIP1knrIy+pGRGMx6UzeJYRlM4YN9lxDjKm4LBRhJPWtJrM1X06lJLT' +
      'e17WMe1qdyxaWMKYQaHHkoNDZxCLnh+zbTpvY7W120D6Q82lsVFuQcNMIR6KbvhsNvpUtFjsd0kdysJ5ykIjDUtiPhG1qQRGZwJngqx2NUaftCsRq7voWkx+' +
      '6YgJlCziLcioRTTC8PBU4RaLruRIs+siLSZmRIRfXr0DRqQdSyWMNxLMzg8JC3Emk30Efqe0dr6iLTf4aR9I2fSqAXBpio6HbTF3NlanUklSSThYVzPV9fqQ' +
      'z3JM+l1uHwnFtqjHIkn20pSTSFGZqbXdRmrCJSiuSf0tce+cyx6POGXDRLbDjBrsbjJuEZKQaT0EpPxvrGD8nP5auIhWISYS9919eCSCi0EZkV7mkiuajuVr' +
      'EPxF1DBMrYUzEwb0OcQpiJeKJTaHMkKV61rl/LpIzKwzYml495uVsFN20QsC20k2UwyiJaka1FZwtZWKysK1rkPoVNRmJg2lRsvVkbiFNrOXnhLShKkpJZ4z' +
      'SZYV7lbT3ENG4/MoCHZaffjYZpp0rtuLdSlKythaDM9OgjP8B42J7CuTNcI49CoQpDa4V3KCPKCWSj9UrF909RnctI8p0/EnKZTBHGQylS91DhrchDUlzBIy' +
      'T6uHo1lpueoeCGpGOYNpXpODUtsmEkvIFErBaWaiK+N0Xv8A0Aa5z5hL0ElT0AbUVhmlxMak8Ik6jQViw9Gk/h9R6Wp1KnlIS1M4JalqShBJiEGalKK6SLTp' +
      'My0kXeQm10jFJiYJaownzSv7QyacQ2VnFOJVgk+nUaraSX3aC0j9sUdFsIaJuYwKVNtstkopeZGeLcxl/wB73nrDkN2KnDMHN24KMUww06zhtvOPEnCXhEnA' +
      'sZazuVtOn4DzpqSDTGraiX4FqHso24jLmzJZEok2NN7keFcu8tGu52L5T+n4iaxZvsxkMx/pVQ6cZCG4pJmpKjUR4ZfdLQPHF0e7GPLOIjoZbJZQbSTgrrbU' +
      '7pNWEa9ZHqsRaDMvqA3I2aNNSuNjYJTEWcIlZrQl4iLCSVzSZkR2P8h+fT0pTDoeemcC0hS8XdcSgixha0Xv7RfDWPG3I430ZNoWImEO49MDUeMRCmlLd0Eg' +
      '/VwzvoL4kMqY0rNHIJ+Fh5q02xErSTjUPBmgiTgJR84jsWCR2I9OoyUWgBUMzOXvxJwzEdCuRBYV2kPJNfqnZWgjvoPQfwHrE3A07GQ00RGrjoRX+pW+4lEE' +
      'aFLwmyRg4WMPVa+oxSDAAABoAAAAAAAwK67Kx3h+Ykb4wK67Kx3h+YkRfRLa6oKF7KwPieYob4wKF7KwPieYob4U0QW1SCC96nPyBeiC96nPyBO1/PmFU+/C' +
      '9AAHVAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMCuuysd4fmJG+MCuuysd4fmJEX0S2uqCheysD4nmKG+MCheysD4nmKG+FNEFtUgg' +
      'vepz8gXogvepz8gTtfz5hVPvwvQAB1QxJjVsjlka5Bx0diohu2GjErVa5EZaSSZajIeXPymdpbu7wj1TGkpHM41yMjoHGxDlsNeOWm9iIi0Eoi1EQ8uYdM7N' +
      '3h3iG8mGflM7S3d3hDPymdpbu7whmHTOzd4d4gzDpnZu8O8Qcgz8pnaW7u8IZ+UztLd3eEMw6Z2bvDvEGYdM7N3h3iDkGflM7S3d3hDPymdpbu7whmHTOzd4' +
      'd4gzDpnZu8O8Qcgz8pnaW7u8IZ+UztLd3eEMw6Z2bvDvEGYdM7N3h3iDkGflM7S3d3hDPymdpbu7whmHTOzd4d4gzDpnZu8O8Qcgz8pnaW7u8IZ+UztLd3eE' +
      'Mw6Z2bvDvEGYdM7N3h3iDkGflM7S3d3hDPymdpbu7whmHTOzd4d4gzDpnZu8O8Qcgz8pnaW7u8IZ+UztLd3eEMw6Z2bvDvEGYdM7N3h3iDkGflM7S3d3hDPy' +
      'mdpbu7whmHTOzd4d4gzDpnZu8O8Qcgz8pnaW7u8IZ+UztLd3eEMw6Z2bvDvEGYdM7N3h3iDkGflM7S3d3hDPymdpbu7whmHTOzd4d4gzDpnZu8O8Qcgz8pna' +
      'W7u8IZ+UztLd3eEMw6Z2bvDvEGYdM7N3h3iDkGflM7S3d3hDPymdpbu7whmHTOzd4d4gzDpnZu8O8Qcgz8pnaW7u8I3JdHw0zgm4yBdxsO5fAXgmm9jMj0GR' +
      'HrIxh5h0zs3eHeIbkugIaWQTcHAtYqHbvgIwjVa5mZ6TMz1mYch6RgV12VjvD8xI3xgV12VjvD8xI530SquqCheysD4nmKG+MCheysD4nmKG+FNEFtUggvep' +
      'z8gXogvepz8gTtfz5hVPvwvQAB1QAIio8+PTMR6D/gPVxX7j7pX9rTrvrGb1l85MNwx0kBzbrL5yYOsvnJgwOkgObdZfOTB1l85MGB0kBzbrL5yYOsvnJgwO' +
      'kgObdZfOTB1l85MGB0kBzbrL5yYOsvnJgwOkgObdZfOTB1l85MGB0kBzbrL5yYOsvnJgwOkgObdZfOTB1l85MGB0kBzbrL5yYOsvnJgwOkgObdZfOTB1l85M' +
      'GB0kBzbrL5yYOsvnJgwOkgM2nPSfoaH9Ofx/rY32fvHb2dGq2oaQxoAAAAAAAwK67Kx3h+Ykb4wK67Kx3h+YkRfRLa6oKF7KwPieYob4wKF7KwPieYob4U0Q' +
      'W1SCC96nPyBeiC96nPyBO1/PmFU+/C9AAHVAAxJjVsjlka5Bx0diohu2GjErVa5EZaSSZajIeXPymdpbu7whhilATWflM7S3d3hDPymdpbu7whiRSgJrPymd' +
      'pbu7whn5TO0t3d4QxIpQE1n5TO0t3d4Qz8pnaW7u8IYkUoCaz8pnaW7u8IZ+UztLd3eEMSKUBNZ+UztLd3eEM/KZ2lu7vCGJFKAms/KZ2lu7vCGflM7S3d3h' +
      'DEilATWflM7S3d3hDPymdpbu7whiRSgJrPymdpbu7whn5TO0t3d4QxIpQE1n5TO0t3d4RuS6PhpnBNxkC7jYdy+AvBNN7GZHoMiPWRgPSAADQAAAAAAAAAAA' +
      'AAGBXXZWO8PzEjfGBXXZWO8PzEiL6JbXVBQvZWB8TzFDfGBQvZWB8TzFDfCmiC2qQQXvU5+QL0QXvU5+QJ2v58wqn34XoAA6oYkxpKRzONcjI6BxsQ5bDXjl' +
      'pvYiItBKItREPLmHTOzd4d4hSgGWJrMOmdm7w7xBmHTOzd4d4hSgGZE1mHTOzd4d4gzDpnZu8O8QpQDMiazDpnZu8O8QZh0zs3eHeIUoBmRNZh0zs3eHeIMw' +
      '6Z2bvDvEKUAzImsw6Z2bvDvEGYdM7N3h3iFKAZkTWYdM7N3h3iDMOmdm7w7xClAMyJrMOmdm7w7xBmHTOzd4d4hSgGZE1mHTOzd4d4gzDpnZu8O8QpQDMiaz' +
      'DpnZu8O8Q3JdAQ0sgm4OBaxUO3fARhGq1zMz0mZnrMx6QAAAAaAAAAAAAAAAAAAAwK67Kx3h+Ykb4wK67Kx3h+YkRfRLa6oKF7KwPieYob4wKF7KwPieYob4' +
      'U0QW1SCC96nPyBeiC96nPyBO1/PmFU+/C9AAHVCIqPPj0zEeg/4D1cV+4+6V/a0676xm9ZfOTDpIDcsc26y+cmDrL5yYdJAMjm3WXzkwdZfOTDpIBkc26y+c' +
      'mDrL5yYdJAMjm3WXzkwdZfOTDpIBkc26y+cmDrL5yYdJAMjm3WXzkwdZfOTDpIBkc26y+cmDrL5yYdJAMjm3WXzkwdZfOTDpIBkc26y+cmDrL5yYdJAMjm3W' +
      'XzkwdZfOTDozriGkGt1ZJSXeZj8QsS1FINbKrkR20lYMtxOMucvvftHYbNx5RJSXeeTDzImf7QXFYLbilH8EtsGf9hbVC6ZxCGr+qlN7fUxrS+GRDQyEoIrm' +
      'RGo/iYmZmZw7RFaVi0xmZczXMv2hNHguLUk/gptgv8D7w0T+0WJSamFkoiOx6IYrDo8ZDIimTbcL8D+Biflzq4KYEhegjVgLIZmay3FdpWZiMTCd6y+cmDrL' +
      '5yYdJAXl53NusvnJhb056T9DQ/pz+P8AWxvs/eO3s6NVtQ0gDIDArrsrHeH5iRvjArrsrHeH5iRzvolVdUFC9lYHxPMUN8YFC9lYHxPMUN8KaILapBBe9Tn5' +
      'AvRBe9Tn5Ana/nzCqffhegADqhiTGrZHLI1yDjo7FRDdsNGJWq1yIy0kky1GQ8uflM7S3d3hHqmNJSOZxrkZHQONiHLYa8ctN7ERFoJRFqIh5cw6Z2bvDvEN' +
      '5MM/KZ2lu7vCGflM7S3d3hDMOmdm7w7xBmHTOzd4d4g5Bn5TO0t3d4Qz8pnaW7u8IZh0zs3eHeIMw6Z2bvDvEHIM/KZ2lu7vCGflM7S3d3hDMOmdm7w7xBmH' +
      'TOzd4d4g5Bn5TO0t3d4Qz8pnaW7u8IZh0zs3eHeIMw6Z2bvDvEHIM/KZ2lu7vCGflM7S3d3hDMOmdm7w7xBmHTOzd4d4g5Bn5TO0t3d4Qz8pnaW7u8IZh0zs' +
      '3eHeIMw6Z2bvDvEHIM/KZ2lu7vCGflM7S3d3hDMOmdm7w7xBmHTOzd4d4g5Bn5TO0t3d4Qz8pnaW7u8IZh0zs3eHeIeZNJUiqJKHRAEpZ/B92364QcmxEz8P' +
      'Tn5TO0t3d4Qz8pnaW7u8Ix5xRclhXUqagrNL1FjVnY/1HlYpmSNLQt6X4xo9ZY5wr/7hO9GXaNjM1zEvVOaukUREJWzMDWnBtbFOFY/zSPzKazk0JE+vG/ZL' +
      '0K+yXo+uoeqY0bTmQJiYOBsVyueOcPR+ah43KQkqpe3EtQWlJmlz7Vf5H7QmcZzDrSc0is+H1nVW0/EPIdYmGF6tlfYuF/dI98BXlPlCoS/MMFxJWP7Bw7/7' +
      'R8ZXR1NxsKZLl9nU6FGT7n5H7Q8MXQ8vhln/AKA1o7lpcWf+dA3lE5RjeruT8wuJdHw0zgm4yBdxsO5fAXgmm9jMj0GRHrIxgRVoibKxWnCcIiMh8pc1Ew8C' +
      '3L5e0tuGRckoSR6LmZndR6dZn3jalcsyU8a8ZKdtoItSRk/6vgrHCzMzzaYAAt5wAAAGBXXZWO8PzEjfGBXXZWO8PzEiL6JbXVBQvZWB8TzFDfGBQvZWB8Tz' +
      'FDfCmiC2qQQXvU5+QL0QXvU5+QJ2v58wqn34XoAA6oAERUefHpmI9B/wHq4r9x90r+1p131jN6y+cmG4Y6SA5t1l85MHWXzkwYHSQHNusvnJg6y+cmDA6SA5' +
      't1l85MHWXzkwYHSQHNusvnJg6y+cmDA6SA5t1l85MHWXzkwYHSQHNusvnJh8IiM/aHDHZ51KT+H+mM/0IMNiJn4dQHjjpgzB+qu6nLXJBDmyJpX61ElL5XP4' +
      'lDl/cfqNhv2gupxsSjCJBayyfV+QyfjkutcWiLwsFvx00WaGkmTfeSdBF+JjQgZQ3DqS46rGOFpK2giMc4YmFdsNk227gpLUWCwf+B9ExP7Qo67SFrWXeSSY' +
      'L9TERj5d7RfTHKHTo2HTFwqm7lp0pP4GJ+BJCnFwcSViWdiPvSoTTDP7SIdsm2isktRXhj/uN1qFmbcrhYmcFaPVhE/bB0HhHgn6uj2bahto5ZRsrRmaZfdZ' +
      'vQBuwrpXQstXcfwMh65CpLiX4ZzSlRXt/Qx6m0tzeXpw9DqdGF8D/wD2PnKpY/DP451SU2uWCWm4yI5rteJrMTyl5INL0DNMUlKlFeyiItafiKMfyxXvbT8R' +
      '/RURhwvffnIAANQAAAAAAAMCuuysd4fmJG+MCuuysd4fmJEX0S2uqCheysD4nmKG+MCheysD4nmKG+FNEFtUggvepz8gXogvepz8gTtfz5hVPvwvQAB1QAMS' +
      'Y1bI5ZGuQcdHYqIbthoxK1WuRGWkkmWoyHlz8pnaW7u8IYYpQE1n5TO0t3d4Qz8pnaW7u8IYkUoCaz8pnaW7u8IZ+UztLd3eEMSKUBNZ+UztLd3eEM/KZ2lu' +
      '7vCGJFKAms/KZ2lu7vCGflM7S3d3hDDVKAmir2mj/wDcTL8WHOEM/KZ2lu7vCBPLlL1TaYxDTymGyxZF/N3mX+B+IKTm+knol07LK5Ek7mf4mMecVdTcU0lb' +
      'Uxu6juxDhXL/AMR/ZPXEiZZNmJj8Ek6UHiXD/L2RGOfN6Yt/t5p/y2JjJ0tNG7DGo8HSpJ6dH0H7kcYayOFeO+j1L/D4DyHXdMnoOZbu7wjBOqpGxMCcYjrt' +
      'pXcjxLhaP/EbMYnLKW4lZrLYmENkcYaTTdszwkl8S+Ao4dyHRCJcbwG2TK/wIhKzasKai4f1Jjd1GlP2Dmn6eyMlmppM4ZIdmWLbL4tOGRfgRJGYmJ+G5jaU' +
      'iZnGFdGTsiuiETc/vqL+xD2wyXIyX4EYhSVKKx3Kxn9ROQdV0lCWNMwwl/fVDuX/AC9XQPXn5TO0t3d4RURP25WtX4rDehYRmERgsptfWZ6zH3E1n5TO0t3d' +
      '4Qz8pnaW7u8I3DnM55ypQE1n5TO0t3d4Qz8pnaW7u8IYlilATWflM7S3d3hDPymdpbu7whiRSgJrPymdpbu7whn5TO0t3d4QxIpQE1n5TO0t3d4RuS6PhpnB' +
      'NxkC7jYdy+AvBNN7GZHoMiPWRgPSMCuuysd4fmJG+MCuuysd4fmJEX0SquqCheysD4nmKG+MCheysD4nmKG+FNEFtUggvepz8gXogvepz8gTtfz5hVPvwvQA' +
      'B1QxJjSUjmca5GR0DjYhy2GvHLTexERaCURaiIeXMOmdm7w7xClAMsTWYdM7N3h3iDMOmdm7w7xClAMyJrMOmdm7w7xBmHTOzd4d4hSDJjWYz1DOJXjVrslL' +
      'RGSEl9QmZhdaxaXhzDpnZu8O8QHQlMJIzOXERFrM4h3iFEyolNpMlkvRY1EegzB1tLram1ldKisYZlOOaUbpOj3XjaRBJNX/ANd2x/geEPQugqaUgyTLsEzL' +
      'QePc0f7h5YphUPELaVrSeg/iQ9kLM4mDVi3yNaC/lVrL8DE7/wDL0TsPuksGGpSRMx2JjIC6b4J/bOFb6+0N3MOmdm7w7xD9zU2ItBRUMr1i0OJPQZfAxpye' +
      'LymFJKj+0b0H9S7jCs45M2td6N/2ycw6Z2bvDvEMKYUfJoOLNOQ3bM8JN3V6S+GsdCHimkHljFkWxiTukzG2zKNleKzz+JSj9O0khojalhrcUV8HHu2L8fWH' +
      'zllEyiLexjkBgsEdz+1c0/QvWFRByZpqyog8av4fyl/yNMiIiIiKxF3EM5z8qm9aRMUTeYdM7N3h3iDMOmdm7w7xClAVmXBNZh0zs3eHeIMw6Z2bvDvEKUAz' +
      'Imsw6Z2bvDvEGYdM7N3h3iFKAZkTWYdM7N3h3iDMOmdm7w7xClAMyJrMOmdm7w7xBmHTOzd4d4hSgGZE1mHTOzd4d4gzDpnZu8O8QpQDMiazDpnZu8O8Q3Jd' +
      'AQ0sgm4OBaxUO3fARhGq1zMz0mZnrMx6QABgV12VjvD8xI3xgV12VjvD8xIi+iVV1QUL2VgfE8xQ3xgUL2VgfE8xQ3wpogtqkEF71OfkC9EF71OfkCdr+fMK' +
      'p9+F6AAOqERUefHpmI9B/wAB6uK/cfdK/tadd9YzesvnJh0kBuWObdZfOTB1l85MOgxUYxCpu6vT3JLSZjMOfevoh/V+qtP9hk2iF12drfEJHrL5yYeSYq/a' +
      'ElpJRajJBnaxHD6f0HToWIbimSdaPQfcesjHin6cKBJX3VkYy08m7OMXjLmzETXUGV2lqQlZX1MmR/qPdDxP7RYlJqYWSiLX/DFYWsubZipUaIixJQo/WM7Y' +
      'PfcZSXFQcSaoZ4lYJ6FFqUQmLYd7UjaTP8wmY6G/aC4k3opF8AtKiyfV+Q+bWfkc2TKCJwmy0EeTkZF+J6R0qBj2o5s0KIkuW9ZB9/4DHNDktmZEgjUV9BF/' +
      'MkxszzymsTNZpPzCMXK69Qk1Gwdi+BsGf9DHzgnK6be/0uFjDK1iJkx1wjuRH8fiP4SEpUakpIjVrMi1hu8+SeNO7iznHWXzkwdZfOTDpIC8uDm3WXzkwdZf' +
      'OTDpIBkc26y+cmDrL5yYdJAMjm3WXzkwdZfOTDpIBkc26y+cmDrL5yYdJAMjm3WXzkwdZfOTDpIBkZtOek/Q0P6c/j/Wxvs/eO3s6NVtQ0gAY0AAAAAAAYFd' +
      'dlY7w/MSN8YFddlY7w/MSIvoltdUFC9lYHxPMUN8YFC9lYHxPMUN8KaILapBBe9Tn5AvRBe9Tn5Ana/nzCqffhegADqhiTGrZHLI1yDjo7FRDdsNGJWq1yIy' +
      '0kky1GQyZlXkmwElBTEtPtHiHCMv1SNaY0lI5nGuRkdA42Icthrxy03sREWglEWoiHkVQVNGkyKXWMy0Hj3NH+4JxhtZxbMsSDqSnXVG5GzRRafZxLhmr88E' +
      'e2Nquk1QakMRaScIvVtDuEd/xwRlO0pKYd5ba4EjUk7aXV/r7Q0IOgJY8RLfhcWg9NsaszP+ugRGMYw9VomLb0zyfSTVnT0KwtL0xwVKVcixDh//AIj7zKtq' +
      'cfgnG0TG6jIrFiHPj/2jyzWhpFCMpdZhVWvYyU8v/kfqW0bIImAdWuX3cTciVjnPh/3DY/iUWiJniQzGqnk6/s1THAbM7ndpy36EkakNUtINIMnJjjVGVjUq' +
      'Hd/p6ugfOUURJ3lmuJlpm0adBm84Wn/yGpmHTOzd4d4grEYZttpbexEsZNQ04mKwkTnBbI7kZQ7uEX+0a5VzTBGSjmV1EVsI4dy//wBo/WYdM7N3h3iDMOmd' +
      'm7w7xCoisOVr2t8mflM7S3d3hDPymdpbu7whmHTOzd4d4gzDpnZu8O8Q3kgz8pnaW7u8IZ+UztLd3eEMw6Z2bvDvEGYdM7N3h3iDkGflM7S3d3hDPymdpbu7' +
      'whmHTOzd4d4gzDpnZu8O8Qcgz8pnaW7u8IZ+UztLd3eEMw6Z2bvDvEGYdM7N3h3iDkGflM7S3d3hG5Lo+GmcE3GQLuNh3L4C8E03sZkegyI9ZGMPMOmdm7w7' +
      'xDcl0BDSyCbg4FrFQ7d8BGEarXMzPSZmeszDkPSAAMaAAAAAAAAAAAAAAwK67Kx3h+Ykb4wK67Kx3h+YkRfRLa6oKF7KwPieYob4wKF7KwPieYob4U0QW1SC' +
      'C96nPyBeiC96nPyBO1/PmFU+/C9AAHVAAiKjz49MxHoP+A9XFfuPulf2tOu+sZvWXzkw3DFhP4TCSUSgtKdC/wAO4x8oOcJYgyQ4lS3E6E/UvqYk1o/aS4hS' +
      'FldKisZf6YeNMqr5JkeIK5fFUOf+RM1nPJ3rtKzTF/pZWjZu4RmVmyP8El/yN2DhkwjCWkHe2kz+JjniS/aUkiJJERFqIsmH96y+cmGxXCL7Te5RGIdJAc26' +
      'y+cmDrL5yYbhzdJAc26y+cmDrL5yYMDpIDm3WXzkwdZfOTBgdJAc26y+cmDrL5yYMDpIDm3WXzkwdZfOTBgdJAc26y+cmDrL5yYMDpIDm3WXzkwdZfOTBgdJ' +
      'Ac26y+cmDrL5yYMDpIDm3WXzkwdZfOTBgdJAc26y+cmDrL5yYMDpIDm3WXzkwdZfOTBgdJAc26y+cmFvTnpP0ND+nP4/1sb7P3jt7OjVbUGBpDArrsrHeH5i' +
      'RvjArrsrHeH5iRzvolVdUFC9lYHxPMUN8YFC9lYHxPMUN8KaILapBBe9Tn5AvRBe9Tn5Ana/nzCqffhegADqgAYkxq2RyyNcg46OxUQ3bDRiVqtciMtJJMtR' +
      'kPLn5TO0t3d4QwxSgJrPymdpbu7whn5TO0t3d4QxIpQE1n5TO0t3d4Qz8pnaW7u8IYkUoCaz8pnaW7u8IZ+UztLd3eEMSKUBNZ+UztLd3eEM/KZ2lu7vCGJF' +
      'KAms/KZ2lu7vCGflM7S3d3hDEilATWflM7S3d3hDPymdpbu7whiRSgJrPymdpbu7whn5TO0t3d4QxIpQE1n5TO0t3d4Qz8pnaW7u8IYkUoCaz8pnaW7u8IZ+' +
      'UztLd3eEMSKUBNZ+UztLd3eEM/KZ2lu7vCGJFKAms/KZ2l/8DvCPy5X9NJK5TBS/olhz/KRkzj5XWlr6YypwE/C1nJIpKVIiVpSrUa2lF/gbMLFw8Y3jIV9t' +
      '1PxQojsETE/DbbK9NUYfcAAagAAABgV12VjvD8xI3xgV12VjvD8xIi+iW11QUL2VgfE8xQ3xgUL2VgfE8xQ3wpogtqkEF71OfkC9EF71OfkCdr+fMKp9+F6A' +
      'AOqGJMaSkczjXIyOgcbEOWw145ab2IiLQSiLURDy5h0zs3eHeIUoBliazDpnZu8O8QZh0zs3eHeIUoBmRNZh0zs3eHeIMw6Z2bvDvEKUAzImsw6Z2bvDvEGY' +
      'dM7N3h3iFKAZkTWYdM7N3h3iDMOmdm7w7xClAMyJrMOmdm7w7xBmHTOzd4d4hSgGZE1mHTOzd4d4gzDpnZu8O8QpQDMiazDpnZu8O8QZh0zs3eHeIUoBmRNZ' +
      'h0zs3eHeIMw6Z2bvDvEKUAzImsw6Z2bvDvEGYdM7N3h3iFKAZkTWYdM7N3h3iGbPacpOTwxLXLMN5ehpooh26j/8tQtXFpabU44eChBGpRn3EQlaeYVO5m9O' +
      '4xJm2heBDNnqTbv/AC/vcZa0/EO2ypWc3t8R/wB9GRJ/2fQsUeUzNg4dtR3TDNrVci+pmZmX4axvFQVM7M/+d3iFKAyKxBfbXty+I/iGbDSGUw0GiEagGcQi' +
      '+ClacMyuZmek7nrP4jLjaUQ0vKZI+uDiU6SSSjwVfT4l/UhTANmsSym2vT4lPyKeuPxCpdNW8RHo1dxOfh9RQDBquVHGQmWQ10xkL67ak6zItJl/kh7ZBMSm' +
      'krZidGMMsFwi7lFr/wCfzGRMxOJXtK1tXiV5fzH8S0QABTgDArrsrHeH5iRvjArrsrHeH5iRF9EtrqgoXsrA+J5ihvjAoXsrA+J5ihvhTRBbVIIL3qc/IF6I' +
      'L3qc/IE7X8+YVT78L0AAdUIio8+PTMR6D/gPVxX7j7pX9rTrvrGb1l85MOkgNyxzbrL5yYOsvnJh0kAyObdZfOTB1l85MOkgGRzbrL5yYOsvnJh0kAyObdZf' +
      'OTB1l85MOkgGRzbrL5yYOsvnJh0kAyObdZfOTB1l85MOkgGRzbrL5yYOsvnJh0kAyObdZfOTB1l85MOkgGRzbrL5yYW9Oek/Q0P6c/j/AFsb7P3jt7OjVbUN' +
      'IAyMWsHzYp+KNJ2NZEj9TK/9Lj1yGHKFk0GykrWaSZ/iek/6mY8FbNm5Tz5l/IpKj/W3+Rpyp0npXCOp1KZQf9CEfp6J/sR5n/D1gACnAAAABLUiWSzOcS8t' +
      'Dbb2EgvgVzL+1hUiXpn7eoZ3EJ9gnCQR/HSf/Am3zDvsv7d/Ef5VAAApwBgV12VjvD8xI3xgV12VjvD8xIi+iW11QUL2VgfE8xQ3xgUL2VgfE8xQ3wpogtqk' +
      'EF71OfkC9EF71OfkCdr+fMKp9+F6AAOqAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB8I2GRGQj0M57LqDSf0v3jAo2LU029J4v1YmEWeCR/zJv3fgf8AQyFM' +
      'J+opM8+83M5WrAj2e4v/AFC+H4//AME2ifmHfZWiYnZ2+J/yoAGDJ6lhow8njbQkYk8FTbmgjP6Gf9jG8NiYn4cr7O1JxaAAGdNp1AypsziXSNy3qtJ0qP8A' +
      'Lu/MJnDK1m04rBP5miVS12IMyxhlgtJ+Kj1f8jy0jL1QEoQbxGTz541d9ZX1F+n9xnS+Bi5/Homc2bNqFb0w8Off9T+n9/wFYJjnOXfaY2dOHHz9/wDgAALe' +
      'cGBXXZWO8PzEjfGBXXZWO8PzEiL6JbXVBQvZWB8TzFDfGBQvZWB8TzFDfCmiC2qQQXvU5+QL0QXvU5+QJ2v58wqn34XoAA6oAAAAAAAAAAAAAAAAAAAAAAAA' +
      'AAAAAAAAAAAABnTSSwE0L/VsEblrE4nQovz7/wAxjlTEdC6JbOohpvubXexfodv6CpATNYl1pt9pWMRPJLnT85f9WJnzpI7ybI9P9SHtllLy6AWTpoVEPEd8' +
      'N472P6FqG2ARSG2/qNpMYziOnIAAFOIAAADArrsrHeH5iRvjArrsrHeH5iRF9EtrqgoXsrA+J5ihvjAoXsrA+J5ihvhTRBbVIIKeyaf51PzSUQ/3cW7ht/LJ' +
      'J6FH+JahegF6RaMSVtuoLp/zk4dP+cnF6Anhd0+1b/SEF0/5ycOn/OTi9AOF3T7N/pCC6f8AOTh0/wCcnF6AcLun2b/SEF0/5ycOn/OTi9AOF3T7N/pCC6f8' +
      '5OHT/nJxegHC7p9m/wBIQXT/AJycOn/OTi9AOF3T7N/pCC6f85OHT/nJxegHC7p9m/0hBdP+cnDp/wA5OL0A4XdPs3+kILp/zk4dP+cnF6AcLun2b/SEF0/5' +
      'ycOn/OTi9AOF3T7N/pCC6f8AOTh0/wCcnF6AcLun2b/SEF0/5ycOn/OTi9AOF3T7N/pCC6f85OHT/nJxegHC7p9m/wBIQXT/AJycOn/OTi9AOF3T7N/pCC6f' +
      '85OHT/nJxegHC7p9m/0hBdP+cnDp/wA5OL0A4XdPs3+kILp/zk4+EfB1vMIVcLGN4xly2EnCYK9jIy0lp1kQ6IAcLP3JxOkMik4OIl8ghYWMbxbzeHhJwiO1' +
      '1qMtJaNRkNcAHSIxGETOZy//2Q==',
    white:
      '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',
    red:
      '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',
  };
}
