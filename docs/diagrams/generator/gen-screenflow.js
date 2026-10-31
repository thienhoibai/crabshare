'use strict';
// Screen Flow (SRS 3.1.1): màn hình web theo vai trò (từ web/src/app/router.tsx) và màn hình mobile (mobile/lib/app/routes.dart).
const path = require('path');
const { DrawioFile, S } = require('./lib');

const META = 'Version 2.0 · 22/10/2026 · routes as in web/src/app/router.tsx and mobile/lib/app/routes.dart @ develop 22/10/2026 · not UML';

// group: {key, title, role, x, y, w, cols, screens:[[id, name, route, note?]]}
const WEB = [
  { key: 'pub', title: 'Public (no login)', role: 'anyone', x: 20, y: 80, cols: 2, screens: [
    ['landing', 'Landing', '/'], ['login', 'Login', '/dang-nhap'], ['register', 'Register', '/dang-ky'], ['store', 'Store · listing detail', '/cua-hang/:listingId?'], ['trace', 'Trace crab', '/truy-xuat/:tagCode'], ['products', 'Products (static)', '/san-pham'],
  ] },
  { key: 'cus', title: 'Customer (roles Customer | Investor)', role: 'Customer', x: 20, y: 400, cols: 2, screens: [
    ['checkout', 'Checkout (cart per batch, address)', '/thanh-toan'], ['confirm', 'Order confirmation · VietQR', '/xac-nhan-don-hang'], ['preorder', 'Pre-order (deposit)', '/dat-truoc/:listingId'], ['preconfirm', 'Pre-order confirmation', '/xac-nhan-dat-truoc'], ['history', 'Order history', '/lich-su-don-hang'], ['tracking', 'Order tracking · cancel · receive · complaint · return', '/theo-doi-don-hang/:orderNo'], ['rate', 'Rate order', '/danh-gia-don-hang/:orderNo'], ['addresses', 'Delivery addresses (Customer only)', '/tai-khoan/dia-chi'],
  ] },
  { key: 'inv', title: 'Investor portal (role Investor)', role: 'Investor', x: 560, y: 80, cols: 2, screens: [
    ['ihome', 'Portal home', '/nha-dau-tu (view home)'], ['explore', 'Explore offerings', 'view explore'], ['lot', 'Batch detail · timeline · alerts', 'view lot'], ['contribute', 'Contribute (5 screens: disclosure → amount → VietQR → contract → done)', '/nha-dau-tu/gop-von/:code'], ['portfolio', 'Portfolio', 'view portfolio'], ['position', 'Position detail', 'view position'], ['offtake', 'Offtake commitments', 'view offtake'], ['contracts', 'Contracts (view, sign)', 'view contracts'], ['settle', 'Settlement statements · feedback', 'view settle'], ['profile', 'Profile · eKYC · payout account', 'view profile'], ['bell', 'Notifications (bell, 30 s poll)', 'component'],
  ] },
  { key: 'op', title: 'Operator workspace (role OperatorMember)', role: 'OperatorMember', x: 1100, y: 80, cols: 2, screens: [
    ['oreg', 'Operator registration', '/operator/register'], ['odash', 'Dashboard', '/operator'], ['okyc', 'Profile & eKYC', '/operator/kyc'], ['opayout', 'Payout account', '/operator/payout-account'], ['omembers', 'Staff members', '/operator/members'], ['oboxes', 'Boxes (number, maintenance)', '/operator/boxes'], ['ocreate', 'Create batch · Standard Cost', '/operator/create-batch'], ['obatches', 'Batch list', '/operator/batch'], ['obatch', 'Batch detail · timeline · box events · thresholds · stocking', '/operator/batch/detail'], ['olog', 'Daily log', '/operator/log'], ['oalerts', 'Alerts', '/operator/alerts'], ['oevidence', 'Flagged evidence · explanation', '/operator/evidence/:id'], ['ocontract', 'Contracts to sign', '/operator/contract'], ['odisb', 'Disbursement tranches', '/operator/disbursements'], ['oharvest', 'Harvest sessions', '/operator/harvest'], ['otags', 'Tags · label print · void', '/operator/tags'], ['olistings', 'Listings · price', '/operator/listings'], ['oorders', 'Orders · pack · ship · deliver · returns · complaints', '/operator/orders/:orderNo'], ['osettle', 'Settlement statement', '/operator/settlement'],
  ] },
  { key: 'adm', title: 'Admin console (roles PlatformAdmin | EvidenceReviewer)', role: 'PlatformAdmin', x: 1640, y: 80, cols: 2, screens: [
    ['adash', 'Dashboard · CSV reports', '/admin'], ['ausers', 'Users · KYC queue · operators', '/admin/users'], ['auser', 'User detail · lock/unlock · exception', '/admin/users/detail'], ['abatches', 'Batches to review', '/admin/batches'], ['abatch', 'Batch detail · approve/reject/revision · contracts', '/admin/batches/detail'], ['astore', 'Storefront moderation', '/admin/storefront'], ['afinance', 'Finance: funding · tranches · instructions · unmatched · contracts · settlements', '/admin/finance'], ['asettle', 'Settlement detail · calculate · propose · answer · approve · send', '/admin/finance/settlement'], ['aalerts', 'Escalated alerts (PlatformAdmin)', '/admin/alerts'], ['aevidence', 'Evidence review queue (EvidenceReviewer)', '/admin/evidence'], ['aevdetail', 'Evidence detail · verdict', '/admin/evidence/:id'], ['adisputes', 'Disputes · resolve', '/admin/disputes'], ['asettings', 'Settings · fee tiers', '/admin/settings'], ['aaudit', 'Audit log · export', '/admin/audit-log'],
  ] },
];
const WEB_FLOWS = [
  ['landing', 'login', ''], ['landing', 'register', ''], ['landing', 'store', ''], ['store', 'trace', 'scan tag'], ['store', 'checkout', 'cart'], ['store', 'preorder', 'pre-order card'],
  ['checkout', 'confirm', 'VietQR'], ['confirm', 'tracking', 'paid'], ['preorder', 'preconfirm', 'deposit'], ['history', 'tracking', ''], ['tracking', 'rate', 'Completed'],
  ['login', 'ihome', 'Investor'], ['login', 'odash', 'OperatorMember'], ['login', 'adash', 'Admin'], ['login', 'store', 'Customer'],
  ['explore', 'lot', ''], ['lot', 'contribute', 'Contribute'], ['contribute', 'contracts', 'sign'], ['portfolio', 'position', ''], ['position', 'settle', ''],
  ['oreg', 'odash', 'approved'], ['ocreate', 'obatches', 'submit'], ['obatches', 'obatch', ''], ['obatch', 'olog', ''], ['oharvest', 'otags', ''], ['otags', 'olistings', ''], ['olistings', 'oorders', ''], ['odisb', 'osettle', ''],
  ['ausers', 'auser', ''], ['abatches', 'abatch', ''], ['afinance', 'asettle', ''], ['aevidence', 'aevdetail', ''],
];

const MOBILE = [
  { key: 'mpub', title: 'Entry', role: 'anyone', x: 20, y: 80, cols: 1, screens: [['onb', 'Onboarding', '/onboarding'], ['mlogin', 'Login (demo accounts)', '/login'], ['scan', 'Scan QR', '/scan'], ['mtrace', 'Trace result', '/trace/:tagCode'], ['unsup', 'Unsupported role', '/unsupported']] },
  { key: 'minv', title: 'Investor tabs', role: 'Investor', x: 330, y: 80, cols: 2, screens: [['mhome', 'Home · KYC banner · positions', '/i/home'], ['mbatches', 'Explore batches', '/i/batches'], ['mbatch', 'Batch detail · timeline · contribute link', '/batches/:code'], ['mpos', 'Portfolio position', '/i/portfolio/:code'], ['mnotif', 'Notifications', '/i/notifications'], ['macc', 'Account', '/i/account'], ['mkyc', 'eKYC camera', '/i/kyc'], ['mpayout', 'Payout account', '/account/payout-account']] },
  { key: 'mop', title: 'Operator tabs', role: 'OperatorMember', x: 880, y: 80, cols: 2, screens: [['mtoday', 'Today · capture requests · active batches', '/o/today'], ['mlogs', 'Daily logs', '/o/logs'], ['mlognew', 'New daily log · thresholds', '/o/log/new?batch='], ['mslot', 'Box events (molt, mortality, restock, relocate)', '/o/slot-events/:batchCode'], ['mcapture', 'Capture photo (box or tag)', '/o/capture?slot=|tag='], ['mharvest', 'Harvest session · record crabs', '/o/harvest/:batchCode'], ['mtags', 'Tags · activate', '/o/tags'], ['mpack', 'Pack orders', '/o/pack'], ['mpackone', 'Pack order · scan tags · ship · deliver', '/o/pack/:orderNo'], ['malerts', 'Alerts · acknowledge', '/o/alerts'], ['mflag', 'Flagged evidence', '/o/evidence'], ['mexplain', 'Evidence explanation', '/o/evidence/:id'], ['moacc', 'Account', '/o/account']] },
];
const MOBILE_FLOWS = [
  ['onb', 'mlogin', ''], ['mlogin', 'mhome', 'Investor'], ['mlogin', 'mtoday', 'OperatorMember'], ['mlogin', 'unsup', 'other role'], ['scan', 'mtrace', ''],
  ['mhome', 'mkyc', 'verify'], ['mbatches', 'mbatch', ''], ['mhome', 'mpos', ''], ['macc', 'mkyc', ''], ['macc', 'mpayout', ''],
  ['mtoday', 'mcapture', 'capture request'], ['mlogs', 'mlognew', ''], ['mtoday', 'mslot', ''], ['mslot', 'mcapture', 'evidence'], ['mharvest', 'mtags', ''], ['mtags', 'mcapture', 'confirmation photo'], ['mpack', 'mpackone', ''], ['mflag', 'mexplain', ''],
];

function drawGroups(d, groups, flows, colW = 250, rowH = 64) {
  for (const g of groups) {
    const rows = Math.ceil(g.screens.length / g.cols);
    const w = g.cols * colW + 20, h = rows * rowH + 50;
    d.vertex(`<b>${g.title}</b>`, S.group, g.x, g.y, w, h, { key: g.key, raw: true });
    g.screens.forEach(([id, name, route], i) => {
      const x = g.x + 10 + (i % g.cols) * colW, y = g.y + 40 + Math.floor(i / g.cols) * rowH;
      d.vertex(`<b>${name}</b><br><font style="font-size:9px" color="#64748b">${route}</font>`, S.screen, x, y, colW - 14, rowH - 12, { key: id, raw: true });
    });
  }
  for (const [a, b, label] of flows) d.edge(a, b, S.flow + 'labelBackgroundColor=#ffffff;fontSize=9;', { label, raw: true });
}

function run(out) {
  const f = new DrawioFile();
  let d = f.page('Web screen flow');
  d.caption('Figure 3.2', 'Screen Flow – web application by role (React, react-router 7, RequireRole)', META);
  drawGroups(d, WEB, WEB_FLOWS);
  d.vertex('<b>Authorization</b> — RequireRole in app/router.tsx: Customer area = Customer | Investor; Investor area = Investor; Operator area = OperatorMember (+ operator_id claim); Admin area = PlatformAdmin | EvidenceReviewer, evidence review pages EvidenceReviewer only, users/alerts PlatformAdmin only. 401 from the API logs the user out (shared/api/http.ts).', S.legend, 20, 960, 1000, 60, { raw: true });
  d = f.page('Mobile screen flow');
  d.caption('Figure 3.3', 'Screen Flow – Flutter app (go_router, StatefulShellRoute per role)', META);
  drawGroups(d, MOBILE, MOBILE_FLOWS);
  d.vertex('<b>Notes</b> — Camera-only capture (image_picker, no gallery) for evidence and eKYC; Investor and Operator shells are chosen by the JWT role after login; trace scanning works without login.', S.legend, 20, 620, 1000, 50, { raw: true });
  f.write(path.join(out, 'CrabShare_Screen_Flow.drawio'));
  console.log('Screen flow done');
}
if (require.main === module) run(process.argv[2] ?? path.join(__dirname, 'out'));
module.exports = { run };
