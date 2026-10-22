'use strict';
// Report 4 mục 1: Component Diagram (System Overview), Deployment Diagram, Package Diagrams (backend, web, mobile).
const path = require('path');
const { DrawioFile, S } = require('./lib');

const META = 'Version 2.0 · 22/10/2026 · Register v1.3 · reflects develop @ 22/10/2026 (PR #74)';

function componentPage(f) {
  const d = f.page('Component Diagram – System Overview');
  d.caption('Figure 4.1', 'Component Diagram – CrabShare system overview (sub-systems, external systems, interfaces, protocols)', META);
  const comp = (key, label, x, y, w = 150, h = 50, style = S.component, parent) => d.vertex(label, style, x, y, w, h, { key, raw: true, parent });
  const box = (key, label, x, y, w, h) => d.vertex(label, S.subsystem, x, y, w, h, { key, raw: true });
  const lolli = (key, label, x, y) => { // vòng tròn «provided interface» + nhãn riêng bên trái để không đè lên khối API
    d.text(`<font style="font-size:9px">${label}</font>`, x - 100, y - 14, 96, 44, 'align=right;verticalAlign=middle;');
    return d.vertex('', S.iface, x, y, 14, 14, { key });
  };
  const link = (a, b, label, style = S.connector, pts) => d.edge(a, b, style, { label, raw: true, points: pts });

  // Khách
  box('web', '«subsystem» Web App — React 19 + Vite + TypeScript (SPA)', 20, 80, 330, 330);
  const webC = [['w_auth', 'Auth & session<br><font style="font-size:9px">Zustand store · axios interceptor (JWT)</font>'], ['w_store', 'Storefront & Orders<br><font style="font-size:9px">store/ orders/ trace/</font>'], ['w_inv', 'Investor Portal<br><font style="font-size:9px">funding · contracts · portfolio · offtake · settlement</font>'], ['w_op', 'Operator Workspace<br><font style="font-size:9px">batches · boxes · logs · evidence · harvest · tags · orders</font>'], ['w_adm', 'Admin Console<br><font style="font-size:9px">users · batches · finance · evidence · alerts · disputes · audit</font>']];
  webC.forEach(([k, l], i) => comp(k, l, 40, 120 + i * 56, 290, 48));
  box('mob', '«subsystem» Mobile App — Flutter 3 + Riverpod + go_router', 20, 440, 330, 300);
  const mobC = [['m_auth', 'Auth & session<br><font style="font-size:9px">Dio interceptor · secure storage</font>'], ['m_inv', 'Investor<br><font style="font-size:9px">home · batches · portfolio · KYC · notifications</font>'], ['m_op', 'Operator<br><font style="font-size:9px">today · logs · box events · evidence capture · harvest · tags · packing · alerts</font>'], ['m_trace', 'Trace<br><font style="font-size:9px">QR scan · tag lookup</font>']];
  mobC.forEach(([k, l], i) => comp(k, l, 40, 480 + i * 60, 290, 50));

  // API
  box('api', '«subsystem» CrabShare API — ASP.NET Core (.NET 10), modular monolith', 460, 80, 760, 820);
  // Giao diện cung cấp
  lolli('i_rest', 'REST API /api/* — HTTPS, JSON, Bearer JWT (OpenAPI /scalar)', 452, 150);
  lolli('i_hook', 'Webhook /api/webhooks/payment-provider — HMAC signature', 452, 560);
  lolli('i_ingest', 'Ingestion API /api/ingest/v1 — planned (Production README), not on develop', 452, 640);
  lolli('i_health', '/api/health/live · /ready', 452, 720);
  comp('ctrl', '«component» Controllers<br><font style="font-size:9px">[ApiController] per module · [Authorize] policies · ProblemDetails (RFC 9457)</font>', 480, 120, 720, 50);
  box('feat', 'Features — one vertical slice per module (Dtos · Service · Controller)', 480, 190, 720, 250);
  const mods = [['f_auth', 'Auth'], ['f_acc', 'Accounts'], ['f_ops', 'Operators'], ['f_box', 'Boxes'], ['f_bat', 'Batches'], ['f_fund', 'Funding'], ['f_con', 'Contracts'], ['f_pay', 'Payments'], ['f_prod', 'Production'], ['f_evi', 'Evidence'], ['f_alert', 'Alerts'], ['f_harv', 'Harvest'], ['f_cat', 'Catalog'], ['f_ord', 'Orders'], ['f_off', 'Offtake'], ['f_set', 'Settlement'], ['f_port', 'Portfolio'], ['f_adm', 'Admin & Reports']];
  mods.forEach(([k, l], i) => comp(k, l, 495 + (i % 6) * 118, 225 + Math.floor(i / 6) * 68, 108, 44, S.component + 'fontSize=10;'));
  comp('jobs', '«component» Background jobs (RecurringJob)<br><font style="font-size:9px">ReservationExpiry · FundingClose · TrancheSchedule · OrderCompletion · PreorderBalance · ComplaintEscalation · AlertJob · CaptureRequest · AuditChainCheck</font>', 480, 455, 720, 56);
  comp('common', '«component» Common<br><font style="font-size:9px">JWT auth & policies · ICurrentUser · IAuditLog (hash chain) · AppException → ProblemDetails · Paging · CSV export</font>', 480, 525, 350, 60);
  comp('engine', '«component» CrabShare.SettlementEngine<br><font style="font-size:9px">pure library: SettlementCalculator · LargestRemainderAllocator (TSK-12)</font>', 850, 525, 350, 60);
  box('infra', 'Infrastructure — ports (interfaces) and adapters; Fake* adapters in Development, real adapters by configuration', 480, 600, 720, 280);
  const infra = [['a_db', 'Persistence<br><font style="font-size:9px">EF Core 10 AppDbContext (database-first)</font>'], ['a_pay', 'Payments<br><font style="font-size:9px">IPaymentGateway · IBatchAccountProvisioner · IBankNameMatcher → Fake*</font>'], ['a_sign', 'Signing<br><font style="font-size:9px">IDigitalSigningService → FakeSigningService</font>'], ['a_ekyc', 'Ekyc<br><font style="font-size:9px">IEkycProvider → FakeEkycProvider</font>'], ['a_det', 'Detection<br><font style="font-size:9px">ICrabDetector → NoopCrabDetector (OnnxCrabDetector planned, TSK-13)</font>'], ['a_store', 'Storage<br><font style="font-size:9px">IFileStorage → LocalFileStorage | CloudinaryFileStorage</font>'], ['a_sec', 'Security<br><font style="font-size:9px">DataProtection keys · PayoutAccountProtection · LoginAttemptLimiter · forwarded headers</font>'], ['a_alert', 'Alerts<br><font style="font-size:9px">IAlertRaiser → AlertServiceRaiser</font>']];
  infra.forEach(([k, l], i) => comp(k, l, 495 + (i % 4) * 177, 640 + Math.floor(i / 4) * 110, 165, 92, S.component + 'fontSize=10;'));

  // Dữ liệu và hệ thống ngoài
  d.vertex('<b>SQL Server</b><br><font style="font-size:9px">Azure SQL (prod) · LocalDB (dev)<br>schema V001–V017 via DbUp</font>', S.dbShape, 1320, 640, 170, 90, { key: 'sql', raw: true });
  d.vertex('<b>File storage</b><br><font style="font-size:9px">/home/data/storage (PDF contracts) · Cloudinary (authenticated images)</font>', S.dbShape, 1320, 760, 170, 90, { key: 'files', raw: true });
  const ext = [['x_psp', '«external system»<br>Payment Service Provider<br><font style="font-size:9px">VietQR · batch accounts · payouts (sandbox)</font>'], ['x_sign', '«external system»<br>Viettel digital signing (sandbox)'], ['x_ekyc', '«external system»<br>eKYC provider (sandbox)'], ['x_cloud', '«external system»<br>Cloudinary Upload API (live)'], ['x_farm', '«external system»<br>Farm Management System<br><font style="font-size:9px">optional; ingestion API planned</font>'], ['x_model', '«artifact»<br>ONNX crab detector<br><font style="font-size:9px">ml/ → crab-detector-v1.onnx (planned)</font>']];
  ext.forEach(([k, l], i) => comp(k, l, 1320, 80 + i * 90, 190, 70, S.external + (k === 'x_farm' || k === 'x_model' ? 'dashed=1;' : '')));

  // Kết nối
  link('w_auth', 'i_rest', 'HTTPS · JSON · JWT', S.connector, [[400, 144], [400, 157]]);
  link('m_auth', 'i_rest', 'HTTPS · JSON · JWT', S.connector, [[400, 505], [400, 157]]);
  link('x_farm', 'i_ingest', 'HTTPS POST · API key', S.connector, [[1250, 480], [430, 480], [430, 647]]);
  link('x_psp', 'i_hook', 'webhook HTTPS (signed)', S.connector, [[1250, 60], [420, 60], [420, 567]]);
  link('a_pay', 'x_psp', 'REST HTTPS (sandbox)', S.dep);
  link('a_sign', 'x_sign', 'REST HTTPS (sandbox)', S.dep);
  link('a_ekyc', 'x_ekyc', 'REST HTTPS (sandbox)', S.dep);
  link('a_store', 'x_cloud', 'HTTPS upload / signed URL', S.dep);
  link('a_det', 'x_model', 'loads', S.dep);
  link('a_db', 'sql', 'TDS 1433 · TLS · managed identity', S.connector);
  link('a_store', 'files', 'read/write', S.connector);
  link('ctrl', 'feat', 'calls services', S.dep);
  link('feat', 'infra', 'uses ports', S.dep);
  link('f_set', 'engine', 'uses', S.dep, [[1025, 500], [1025, 525]]);
  link('jobs', 'feat', 'invokes services', S.dep);
  d.vertex('<b>Legend</b><br>Component = deployable or logical unit; «subsystem» = container boundary. ○ lollipop = provided interface with its protocol. Dashed arrow = dependency / usage; solid = communication path with protocol. External systems run in sandbox or are simulated in the demo (Register v1.3 §4).', S.legend, 20, 760, 330, 120, { raw: true });
}

function deploymentPage(f) {
  const d = f.page('Deployment Diagram');
  d.caption('Figure 4.4', 'Deployment Diagram – Dev / Preview / Production environments', META + ' · docs/deploy.md');
  const node = (key, label, x, y, w, h) => d.vertex(label, S.node3d, x, y, w, h, { key, raw: true });
  const art = (key, label, x, y, w = 200, h = 40) => d.vertex(label, S.artifact, x, y, w, h, { key, raw: true });
  const link = (a, b, label, pts) => d.edge(a, b, S.connector, { label, raw: true, points: pts });

  // Người dùng
  node('pc', '«device» User PC<br>«executionEnvironment» Browser (Chrome/Edge)', 20, 120, 260, 120);
  art('a_spa', '«artifact» web bundle (index.html + assets/*.js)', 40, 180, 220, 44);
  node('phone', '«device» Android phone<br>«executionEnvironment» Flutter runtime', 20, 280, 260, 120);
  art('a_apk', '«artifact» crabshare-demo.apk<br><font style="font-size:9px">--dart-define API_URL, WEB_URL</font>', 40, 340, 220, 44);
  node('farmpc', '«device» Farm software host<br><font style="font-size:9px">optional partner system</font>', 20, 440, 260, 90);

  // Production
  d.vertex('<b>Production</b>', S.group, 400, 80, 760, 560, { raw: true });
  node('vercel', '«cloud» Vercel — project crabshare<br>«executionEnvironment» Static hosting + edge CDN', 420, 120, 340, 130);
  art('a_web', '«artifact» web/ build (Vite) → https://crabshare.vercel.app<br><font style="font-size:9px">VITE_API_URL baked at build · Preview deployment per branch/PR</font>', 440, 185, 300, 50);
  node('appsvc', '«cloud» Azure App Service crabshare-api (Linux B1)<br>«executionEnvironment» .NET 10 runtime · HTTPS only · ASPNETCORE_ENVIRONMENT=Production', 420, 280, 340, 220);
  art('a_api', '«artifact» CrabShare.Api.dll + CrabShare.SettlementEngine.dll<br><font style="font-size:9px">Reference/*.md, Reference/Fonts, model.onnx</font>', 440, 350, 300, 50);
  art('a_data', '«artifact» /home/data/storage (uploads, PDFs) · /home/data/keys (DataProtection)<br><font style="font-size:9px">persistent, outside deployment slot</font>', 440, 410, 300, 50);
  art('a_cfg', 'App settings (names only): ConnectionStrings__Default, Jwt__SigningKey, Storage__RootPath, Cors__Origins, Security__*', 440, 465, 300, 30);
  node('sql', '«cloud» Azure SQL crabshare-sql / database crabshare (Basic)<br>«executionEnvironment» SQL Server', 800, 280, 340, 130);
  art('a_schema', '«artifact» schema V001–V017 (DbUp SchemaVersions) · views · triggers', 820, 350, 300, 44);
  node('cloudinary', '«cloud» Cloudinary<br><font style="font-size:9px">authenticated images: crabshare/evidence, crabshare/listings</font>', 800, 440, 340, 90);
  node('github', '«cloud» GitHub — thienhoibai/crabshare<br>«executionEnvironment» GitHub Actions (ci.yml, deploy-backend.yml)', 800, 120, 340, 130);
  art('a_wf', '«artifact» deploy-backend.yml: build+test → OIDC login → DbMigrator → az webapp deploy → smoke.py', 820, 185, 300, 50);
  // Sandbox / simulated
  d.vertex('<b>Sandbox / simulated providers</b><br><font style="font-size:9px">no production accounts; Fake* adapters run in-process (Register v1.3 §4)</font>', S.group, 400, 560, 760, 70, { raw: true });
  ['Payment intermediary (VietQR) — FakePaymentGateway', 'Viettel signing — FakeSigningService', 'eKYC — FakeEkycProvider'].forEach((t, i) => d.vertex(t, S.artifact + 'dashed=1;fontSize=9;', 420 + i * 245, 592, 230, 30));

  // Dev
  d.vertex('<b>Development (each member)</b>', S.group, 1200, 80, 330, 560, { raw: true });
  node('devpc', '«device» Developer PC (Windows)', 1215, 120, 300, 500);
  art('a_dev1', '«executionEnvironment» Vite dev server :5174 — web/', 1230, 180, 270, 40);
  art('a_dev2', '«executionEnvironment» dotnet run :5233 — CrabShare.Api (Development: seed demo data, Fake* adapters)', 1230, 230, 270, 50);
  art('a_dev3', '«executionEnvironment» SQL Server LocalDB — CrabShareDev (DbMigrator)', 1230, 290, 270, 40);
  art('a_dev4', '«executionEnvironment» Flutter debug / Android emulator', 1230, 340, 270, 40);
  art('a_dev5', 'Docker Compose: SQL Server for machines without LocalDB (optional)', 1230, 390, 270, 40);
  art('a_dev6', 'User Secrets: Storage:Provider=Cloudinary (never in repo)', 1230, 440, 270, 40);

  // Đường truyền
  link('pc', 'vercel', 'HTTPS GET (static)', [[340, 150], [340, 150]]);
  link('pc', 'appsvc', 'HTTPS · JSON · Bearer JWT (CORS: Cors__Origins)', [[340, 200], [340, 390]]);
  link('phone', 'appsvc', 'HTTPS · JSON · Bearer JWT', [[360, 340], [360, 420]]);
  link('farmpc', 'appsvc', 'HTTPS POST /api/ingest/v1 (API key)', [[380, 485], [380, 470]]);
  link('appsvc', 'sql', 'TDS 1433 · TLS · Managed Identity (user [crabshare-api])');
  link('appsvc', 'cloudinary', 'HTTPS Upload API · signed download URL (120 s)');
  link('github', 'appsvc', 'OIDC → az webapp deploy', [[780, 270], [780, 300]]);
  link('github', 'sql', 'DbMigrator (V*.sql, no --reset)');
  link('github', 'vercel', 'git push → Vercel build (production: develop)');
  d.vertex('<b>Environments</b><br>Dev: LocalDB + localhost API/web/Flutter. Preview/Staging: Vercel Preview URL per PR against the shared Azure API. Production: crabshare.vercel.app + crabshare-api.azurewebsites.net + Azure SQL, region East Asia, resource group crabshare-rg.<br>Deploy trigger: push to develop touching backend/ or database/. Never run DbMigrator --reset against Azure.', S.legend, 20, 560, 360, 110, { raw: true });
}

function packagePages(f) {
  const pkg = (d, key, label, x, y, w, h, parent) => d.vertex(label, S.pkg, x, y, w, h, { key, raw: true, parent });
  const dep = (d, a, b, label) => d.edge(a, b, S.dep, { label: label ?? '', raw: true });

  // Backend
  let d = f.page('Package Diagram – Backend');
  d.caption('Figure 4.5', 'Package Diagram – backend/ (CrabShare.sln)', META);
  pkg(d, 'api', '«package» CrabShare.Api', 20, 80, 980, 560);
  pkg(d, 'program', 'Program.cs · FeatureRegistry<br><font style="font-size:9px">composition root only</font>', 40, 120, 300, 60);
  pkg(d, 'common', 'Common<br><font style="font-size:9px">Auth (JWT, Policies, Roles, ICurrentUser) · Auditing (IAuditLog, AuditChain) · Errors (AppException, ProblemDetails) · Jobs (RecurringJob) · Paging · Exports · Alerts (IAlertRaiser)</font>', 40, 200, 300, 120);
  pkg(d, 'infra', 'Infrastructure<br><font style="font-size:9px">Persistence (AppDbContext, Entities — scaffolded) · Payments · Signing · Ekyc · Detection · Storage · Security · DependencyInjection</font>', 40, 340, 300, 120);
  pkg(d, 'features', 'Features — 19 vertical slices', 380, 120, 600, 340);
  const mods = ['Auth', 'Accounts', 'Operators', 'Boxes', 'Batches', 'Funding', 'Contracts', 'Payments', 'Production', 'Evidence', 'Alerts', 'Harvest', 'Catalog', 'Orders', 'Offtake', 'Settlement', 'Portfolio', 'Admin', 'Health'];
  mods.forEach((m, i) => d.vertex(m, S.pkg + 'fontSize=10;tabWidth=40;tabHeight=12;', 400 + (i % 5) * 115, 160 + Math.floor(i / 5) * 72, 100, 50, { key: 'm_' + m }));
  pkg(d, 'engine', '«package» CrabShare.SettlementEngine<br><font style="font-size:9px">SettlementCalculator · LargestRemainderAllocator — no DB, no framework</font>', 20, 670, 320, 80);
  pkg(d, 'migrator', '«package» tools/CrabShare.DbMigrator<br><font style="font-size:9px">DbUp runner for database/migrations/V*.sql</font>', 360, 670, 320, 80);
  pkg(d, 'load', '«package» tools/CrabShare.Load<br><font style="font-size:9px">concurrent API / checkout / settlement runner (CS-87)</font>', 700, 670, 300, 80);
  pkg(d, 'tests', '«package» tests<br><font style="font-size:9px">CrabShare.Api.Tests (WebApplicationFactory, [Category=Database]) · CrabShare.SettlementEngine.Tests (xUnit + FsCheck)</font>', 20, 770, 980, 70);
  dep(d, 'program', 'features', '«import»'); dep(d, 'features', 'common'); dep(d, 'features', 'infra'); dep(d, 'infra', 'common');
  dep(d, 'm_Settlement', 'engine', '«import»'); dep(d, 'tests', 'api'); dep(d, 'tests', 'engine');
  d.vertex('<b>Rules</b><br>Features never reference each other\'s services directly except through shared interfaces (IPaymentPurposeHandler, IAlertRaiser, ContractVoiding, SettlementClosing). Infrastructure/Persistence/Entities is generated by EF scaffold and not edited by hand. No cyclic dependencies between packages.', S.legend, 1040, 80, 300, 130, { raw: true });

  // Web
  d = f.page('Package Diagram – Web');
  d.caption('Figure 4.6', 'Package Diagram – web/src (React 19 + Vite + TypeScript)', META);
  pkg(d, 'app', 'app<br><font style="font-size:9px">router.tsx (lazy routes, RequireRole) · providers</font>', 20, 80, 320, 70);
  pkg(d, 'shared', 'shared<br><font style="font-size:9px">api (http.ts axios + JWT) · auth (session store, RequireRole) · layout · ui kit · lib (format) · contracts (ContractViewer) · settlement (SettlementStatement)</font>', 20, 180, 320, 110);
  pkg(d, 'features', 'features — by area / role', 380, 80, 620, 520);
  const webF = [['landing', 'Landing (3D hero)'], ['auth', 'Login · Register'], ['store', 'StorePage'], ['orders', 'Checkout · Pre-order · Tracking · Rating'], ['trace', 'TracePage'], ['accounts', 'KYC · Payout account · Addresses'], ['investor', 'InvestorPortal: explore · funding · contracts · portfolio · offtake · settlement · notifications'], ['operator', 'Operator workspace: batches · boxes · logs · evidence · harvest · tags · listings · orders · disbursements · settlement'], ['admin', 'Admin console: users · batches · storefront · finance · evidence · alerts · disputes · settings · audit log'], ['timeline', 'BatchTimeline'], ['alerts', 'alerts api'], ['reports', 'dashboardApi']];
  webF.forEach(([k, l], i) => d.vertex(`<b>${k}</b><br><font style="font-size:9px">${l}</font>`, S.pkg + 'fontSize=10;tabWidth=40;tabHeight=12;', 400 + (i % 3) * 200, 120 + Math.floor(i / 3) * 118, 185, 100, { key: 'wf_' + k, raw: true }));
  dep(d, 'app', 'features', '«import»'); dep(d, 'features', 'shared'); dep(d, 'app', 'shared');
  d.vertex('<b>Rules</b><br>Features call the API only through shared/api/http.ts (token attached, 401 → logout). Role gating happens in app/router.tsx with RequireRole. Shared UI never imports from features.', S.legend, 1040, 80, 300, 110, { raw: true });

  // Mobile
  d = f.page('Package Diagram – Mobile');
  d.caption('Figure 4.7', 'Package Diagram – mobile/lib (Flutter 3 + Riverpod 3 + go_router + Dio)', META);
  pkg(d, 'app', 'app<br><font style="font-size:9px">app.dart · router.dart (role-based StatefulShellRoute) · routes.dart · theme</font>', 20, 80, 320, 70);
  pkg(d, 'core', 'core<br><font style="font-size:9px">api (ApiClient Dio + JWT) · auth (session, secure storage) · format</font>', 20, 180, 320, 80);
  pkg(d, 'shared', 'shared<br><font style="font-size:9px">models · widgets (gauge, cards, nav)</font>', 20, 290, 320, 70);
  pkg(d, 'features', 'features — repository interface + Mock/Api implementation per feature', 380, 80, 620, 440);
  const mobF = [['auth', 'login · demo accounts'], ['onboarding', 'onboarding page'], ['investor', 'home · batches · portfolio · kyc · notifications · data'], ['operator', 'today · logs · slot_events · evidence · harvest · tags · packing · alerts · data'], ['trace', 'scan · trace result · code parser'], ['account', 'account · payout account'], ['common', 'unsupported role']];
  mobF.forEach(([k, l], i) => d.vertex(`<b>${k}</b><br><font style="font-size:9px">${l}</font>`, S.pkg + 'fontSize=10;tabWidth=40;tabHeight=12;', 400 + (i % 3) * 200, 120 + Math.floor(i / 3) * 118, 185, 100, { key: 'mf_' + k, raw: true }));
  dep(d, 'app', 'features', '«import»'); dep(d, 'features', 'core'); dep(d, 'features', 'shared'); dep(d, 'shared', 'core');
  d.vertex('<b>Rules</b><br>Each feature exposes a repository interface with a Mock and an Api implementation; switching is one Riverpod provider line. Camera-only capture for evidence (image_picker, no gallery).', S.legend, 1040, 80, 300, 110, { raw: true });
}

function run(out) {
  const f = new DrawioFile();
  componentPage(f); deploymentPage(f); packagePages(f);
  f.write(path.join(out, 'CrabShare_Architecture.drawio'));
  console.log('Architecture diagrams done');
}
if (require.main === module) run(process.argv[2] ?? path.join(__dirname, 'out'));
module.exports = { run };
