// End-to-end QA against the Firebase Emulator Suite with the pre-installed Playwright Chromium.
// Needs: `npm run emulators` (auth + firestore), the dev server with VITE_USE_EMULATORS=true, and a
// front photo of a consenting adult at E2E_PHOTO. Screenshots go to E2E_OUT.
// Usage: E2E_PHOTO=/path/front.jpg E2E_OUT=/tmp/shots node scripts/e2e.cjs
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:5173';
const AUTH = process.env.E2E_AUTH || 'http://127.0.0.1:9099';
const PROJECT = 'demo-khusla';
const PHOTO = process.env.E2E_PHOTO;
const OUT = process.env.E2E_OUT || path.join(process.cwd(), 'e2e-shots');
const STEPS = (process.env.E2E_STEPS || 'all').split(',');
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log('[e2e]', ...a);
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  log(ok ? 'PASS' : 'FAIL', name, detail);
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) check(`no horizontal overflow: ${name}`, false, `${overflow}px`);
}

async function oobLink(email) {
  for (let i = 0; i < 20; i += 1) {
    const r = await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`);
    const j = await r.json();
    const codes = (j.oobCodes || []).filter((c) => c.email === email && c.requestType === 'EMAIL_SIGNIN');
    if (codes.length) return codes[codes.length - 1].oobLink;
    await new Promise((res) => setTimeout(res, 500));
  }
  throw new Error('no oob link');
}

(async () => {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } : undefined;
  const browser = await chromium.launch({ proxy, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, locale: 'ar-OM', acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  process.on('exit', () => fs.writeFileSync(path.join(OUT, 'errors.txt'), errors.join('\n')));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url().split('?')[0].slice(0, 160)}`);
  });
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 300)}`);
  });

  // 1. splash
  await page.goto(BASE);
  await page.getByRole('button', { name: /دخول فريق الصالون/ }).waitFor();
  check('splash renders in Arabic RTL', (await page.evaluate(() => document.documentElement.dir)) === 'rtl');
  await shot(page, '01-splash');

  // 2. email-link sign-in through the Auth emulator
  const email = `owner${Date.now()}@salon.om`;
  await page.getByRole('button', { name: /دخول فريق الصالون/ }).click();
  await page.locator('#email').fill(email);
  await page.getByRole('button', { name: /أرسلي رابط الدخول/ }).click();
  await page.getByText('تم إرسال الرابط').waitFor();
  const link = await oobLink(email);
  await page.goto(link.replace('http://localhost', 'http://127.0.0.1'));
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 });
  check('email link sign-in', true, page.url());

  // 3. create salon (with demo data)
  await page.getByRole('button', { name: /أنشئي صالونك/ }).click();
  await page.locator('#nameAr').fill('صالون النخبة');
  await page.locator('#name').fill('Elite Salon');
  await page.locator('#owner').fill('Sam');
  await page.locator('#wa').fill('91234567');
  await shot(page, '02-create-salon');
  await page.getByRole('button', { name: /إنشاء الصالون/ }).click();
  await page.waitForURL('**/home', { timeout: 60000 });
  await page.getByText('أهلاً').waitFor({ timeout: 20000 });
  check('create salon + seed + demo', true);
  await shot(page, '03-home');
  const salonId = await page.evaluate(() => localStorage.getItem('khusla.salonId'));
  fs.writeFileSync(path.join(OUT, 'salon.txt'), salonId);

  const btn = (re) => page.getByRole('button', { name: re }).first();
  if (process.env.E2E_AI) {
    await page.goto(`${BASE}/owner/settings`);
    await page.getByRole('group', { name: 'المعاينة بالذكاء الاصطناعي' }).getByRole('button', { name: 'تشغيل' }).click();
    await page.getByText('الخادم متصل').waitFor();
    await page.waitForTimeout(500);
    await page.goto(`${BASE}/home`);
  }
  if (PHOTO) {
    // 4. new client
    await btn(/عميلة جديدة/).click();
    await page.locator('#client-q').fill('مريم');
    await btn(/إضافة "مريم"/).click();
    await page.waitForURL('**/capture');
    await btn(/فتح الكاميرا/).waitFor({ timeout: 90000 });
    check('on-device models load', true);
    await shot(page, '04-capture-note');
    await page.locator('input[type=file]').first().setInputFiles(PHOTO);
    await btn(/استخدام هذه الصورة/).waitFor({ timeout: 60000 });
    await shot(page, '05-white-card');
    const t0 = Date.now();
    await btn(/استخدام هذه الصورة/).click();
    await page.waitForURL('**/profile', { timeout: 90000 });
    check('analysis completes', true, `${Date.now() - t0} ms (software GL in CI)`);
    await page.waitForTimeout(400);
    await shot(page, '06-profile');
    fs.writeFileSync(path.join(OUT, 'profile.txt'), await page.locator('main').innerText());
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('no horizontal overflow on profile', overflow <= 1, `${overflow}px`);
    await page.getByLabel('الشيب').fill('60'); // one-tap override: grey 60% opens the Grey Journey
    await btn(/^صحيح$/).click();
    await page.waitForURL('**/history');
    await page.getByRole('button', { name: 'لست متأكدة' }).first().click(); // henna not sure -> metallic flag
    await page.getByText('يلزم اختبار الأملاح المعدنية').waitFor();
    check('henna "not sure" flags metallic-salt test', true);
    await shot(page, '07-history');
    await btn(/^التالي$/).click();
    await page.waitForURL('**/goals');
    await shot(page, '07b-goals');
    await btn(/عرض الإطلالات/).click();
    await page.waitForURL('**/looks');
    await page.waitForFunction(() => document.querySelectorAll('main .card img').length >= 6, null, { timeout: 60000 });
    await shot(page, '08-looks');
    check('looks thumbnails render', true);
    // add two looks to compare
    const cmpBtns = page.getByRole('button', { name: 'إضافة للمقارنة' });
    await cmpBtns.nth(0).click();
    await cmpBtns.nth(1).click();
    await btn(/^مقارنة$/).click();
    await page.waitForURL('**/compare');
    await page.waitForFunction(() => document.querySelectorAll('main figure img').length >= 2, null, { timeout: 30000 });
    await shot(page, '08b-compare');
    check('compare grid', true);
    await page.goBack();
    await page.waitForURL('**/looks');
    await page.locator('main .grid button.card').first().click();
    await page.waitForURL(/\/(color|cut)$/);
    if (page.url().endsWith('/cut')) {
      await btn(/مختبر اللون/).click();
      await page.waitForURL('**/color');
    }
    await page.waitForTimeout(1200);
    await shot(page, '09-color-lab');
    // pick a warm shade, change light, open lift check and regrowth
    await page.getByRole('button', { name: 'دافئ' }).first().click();
    await page.getByRole('button', { name: /كراميل/ }).first().click();
    await page.getByRole('radio', { name: 'إضاءة مسائية دافئة' }).click();
    await page.waitForTimeout(500);
    await shot(page, '09b-color-evening');
    await page.getByRole('radio', { name: 'ضوء النهار' }).click();
    await page.getByRole('tab', { name: 'فحص التفتيح' }).click();
    await page.waitForTimeout(800);
    await shot(page, '10-lift-check');
    await page.getByRole('tab', { name: 'نمو الجذور' }).click();
    await page.waitForTimeout(400);
    await shot(page, '11-regrowth');
    await page.setViewportSize({ width: 1180, height: 820 });
    await page.waitForTimeout(700);
    await shot(page, '09c-mirror-mode-tablet');
    await page.setViewportSize({ width: 430, height: 932 });
    await page.getByRole('tab', { name: 'رحلة الشيب' }).click();
    await page.waitForFunction(() => document.querySelectorAll('main section button.card img').length >= 3, null, { timeout: 30000 });
    await shot(page, '11a-grey-journey');
    check('Grey Journey: 3 paths with 8-week grow-out', true);
    await page.getByRole('tab', { name: 'التقنية' }).click();
    await page.getByRole('button', { name: 'بالياج' }).first().click();
    await page.waitForTimeout(500);
    await shot(page, '11b-technique');
    if (process.env.E2E_AI) {
      await btn(/الإطلالة النهائية بالذكاء الاصطناعي/).click();
      await page.waitForURL('**/ai/consent');
      await shot(page, '11c-ai-consent');
      await btn(/إرسال هذه الصورة فقط/).click();
      await page.waitForURL('**/ai/result');
      await page.getByAltText('معاينة بالذكاء الاصطناعي').waitFor({ timeout: 60000 });
      await shot(page, '11d-ai-result');
      check('AI Final Look: consent -> render -> labeled result', true);
      await btn(/معاينة أخرى/).click();
      await page.waitForURL('**/ai/consent');
      check('AI consent asked again for the next image', true);
      await btn(/إرسال هذه الصورة فقط/).click();
      await page.getByText(/Today's AI previews are used up/).waitFor({ timeout: 30000 });
      await page.getByText(/استُهلكت معاينات الذكاء الاصطناعي/).waitFor();
      await shot(page, '11e-ai-cap');
      check('AI cap 429 message in both languages', true);
      await btn(/^مختبر اللون$/).click();
      await page.waitForURL('**/color');
      await page.waitForTimeout(800);
    }
    await btn(/^استوديو القص$/).click();
    await page.waitForURL('**/cut');
    await page.waitForTimeout(1200);
    // drag the tape up a bit
    const tape = page.getByRole('slider', { name: /شريط الطول/ });
    const box = await tape.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.75);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.62, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    await shot(page, '12-cut-studio');
    await btn(/^بطاقة الاتفاق$/).click();
    await page.waitForURL('**/agreement');
    await page.waitForTimeout(600);
    if (await page.getByText('تغيير كبير — تأكيد مرة واحدة').isVisible().catch(() => false)) {
      await btn(/نعم، هي متأكدة/).click();
    }
    await shot(page, '13-agreement');
    await btn(/أوافق \(العميلة\)/).click();
    await btn(/توافق المصففة/).click();
    await page.getByText('تمت الموافقة من الطرفين').waitFor();
    check('two approvals', true);
    await page.locator('article').first().screenshot({ path: path.join(OUT, '14-agreement-card.png') });
    const dl = page.waitForEvent('download', { timeout: 60000 });
    await btn(/صورة للهاتف/).click();
    const d = await dl;
    await d.saveAs(path.join(OUT, 'agreement-card.png'));
    check('agreement PNG export', fs.statSync(path.join(OUT, 'agreement-card.png')).size > 20000);
    const dl2 = page.waitForEvent('download', { timeout: 60000 });
    await btn(/PDF \(A5\)/).click();
    const d2 = await dl2;
    await d2.saveAs(path.join(OUT, 'agreement-card.pdf'));
    check('agreement PDF export', fs.statSync(path.join(OUT, 'agreement-card.pdf')).size > 20000);
    await btn(/^التالي$/).click();
    await page.waitForURL('**/done');
    await page.getByRole('radio', { name: '5/5' }).click();
    await btn(/توافق على حفظ ملف شعرها/).click();
    await shot(page, '15-done');
    await btn(/حفظ الزيارة/).click();
    await btn(/العميلة التالية/).click();
    await page.waitForURL('**/home');
    const photosLeft = await page.evaluate(
      () =>
        new Promise((res) => {
          const r = indexedDB.open('khusla-session');
          r.onsuccess = () => {
            const db = r.result;
            if (!db.objectStoreNames.contains('photos')) return res(0);
            const q = db.transaction('photos').objectStore('photos').count();
            q.onsuccess = () => res(q.result);
          };
          r.onerror = () => res(-1);
        }),
    );
    check('"Next client" wipes photos from IndexedDB', photosLeft === 0, `${photosLeft} left`);
  }

  // 5. owner screens
  await page.goto(`${BASE}/owner`);
  await page.getByText('الاستشارات').first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500);
  await shot(page, '16-dashboard');
  check('dashboard live KPIs', true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(500);
  await shot(page, '16b-dashboard-desktop');
  await page.setViewportSize({ width: 430, height: 932 });

  await page.goto(`${BASE}/owner/products`);
  const csvPath = path.join(OUT, 'products.csv');
  fs.writeFileSync(csvPath, '﻿name,nameAr,category,priceOmr,active\nHaircut,قص الشعر,service,8.500,yes\nBalayage,بالياج,color,45,yes\nGloss,جلوس,treatment,12.250,yes\nBad row,,magic,5,yes\n');
  await page.locator('input[type=file]').first().setInputFiles(csvPath);
  await page.getByText('3 صحيحة · 1 بها أخطاء').waitFor({ timeout: 10000 });
  await shot(page, '17-products-csv');
  await btn(/استيراد 3 صفوف صحيحة/).click();
  await page.getByText('بالياج').first().waitFor({ timeout: 10000 });
  check('products CSV import (3 valid, 1 rejected)', true);

  await page.goto(`${BASE}/owner/catalog`);
  await page.waitForTimeout(800);
  await shot(page, '18-catalog');
  await page.goto(`${BASE}/owner/settings`);
  await page.waitForTimeout(800);
  await shot(page, '19-settings');
  await page.goto(`${BASE}/owner/staff`);
  await page.locator('#inv-email').fill('stylist@salon.om');
  await btn(/إنشاء دعوة/).click();
  await page.getByText(/الدعوة جاهزة/).waitFor();
  check('staff invite', true);
  await shot(page, '20-staff');
  if (process.env.E2E_SWATCH) {
    await page.goto(`${BASE}/owner/swatch-scan`);
    await page.getByPlaceholder('اسم الخط (اكتبيه)').fill('My line');
    await btn(/خط جديد/).click();
    await page.locator('input[type=file]').first().setInputFiles(process.env.E2E_SWATCH);
    const img = page.locator('main img').first();
    await img.waitFor();
    const b = await img.boundingBox();
    await page.mouse.click(b.x + b.width * (170 / 1200), b.y + b.height * (170 / 900)); // white card
    await page.mouse.click(b.x + b.width * (425 / 1200), b.y + b.height * (175 / 900)); // first swatch (level 1)
    await page.locator('#sw-code').fill('1.0');
    await btn(/^حفظ$/).click();
    await page.getByText('1.0').first().waitFor({ timeout: 10000 });
    await shot(page, '21-swatch-scan');
    check('swatch scan saves a measured swatch', true);
  }
  await page.goto(`${BASE}/owner/reports`);
  await page.waitForTimeout(1200);
  await shot(page, '22-reports');
  const dl3 = page.waitForEvent('download', { timeout: 60000 });
  await btn(/تقرير اليوم PDF/).click();
  const d3 = await dl3;
  await d3.saveAs(path.join(OUT, 'daily-report.pdf'));
  check('daily report PDF', fs.statSync(path.join(OUT, 'daily-report.pdf')).size > 20000);

  // 6. Try at home (fresh customer, no account)
  if (PHOTO) {
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const home = await ctx2.newPage();
    home.on('pageerror', (e) => errors.push(`home pageerror: ${e.message}`));
    await home.goto(`${BASE}/t/${salonId}`);
    await home.getByText('صورتك تبقى على هاتفك.').waitFor({ timeout: 20000 });
    await home.screenshot({ path: path.join(OUT, '23-try-at-home.png') });
    await home.getByRole('button', { name: /^ابدئي$/ }).click();
    await home.waitForURL('**/capture');
    await home.getByRole('button', { name: /فتح الكاميرا/ }).waitFor({ timeout: 90000 });
    await home.locator('input[type=file]').first().setInputFiles(PHOTO);
    await home.getByRole('button', { name: /استخدام هذه الصورة/ }).click({ timeout: 60000 });
    await home.waitForURL('**/profile', { timeout: 90000 });
    await home.getByRole('button', { name: /^صحيح$/ }).click();
    await home.getByRole('button', { name: /^التالي$/ }).click();
    await home.getByRole('button', { name: /عرض الإطلالات/ }).click();
    await home.waitForFunction(() => document.querySelectorAll('main .card img').length >= 6, null, { timeout: 60000 });
    await home.locator('main .grid button.card').first().click();
    await home.waitForURL(/\/(color|cut)$/);
    await home.getByRole('button', { name: /احصلي على كود إطلالتك/ }).click();
    await home.waitForURL(/\/code$/);
    const codeEl = home.locator('.num.font-display');
    await codeEl.waitFor({ timeout: 30000 });
    const code = (await codeEl.innerText()).trim();
    await home.screenshot({ path: path.join(OUT, '24-look-code.png') });
    check('Look Code created (anonymous)', /^[A-HJ-NP-Z2-9]{6}$/.test(code), code);
    await ctx2.close();
    // stylist loads the code
    await page.goto(`${BASE}/code`);
    await page.locator('input[aria-label="إدخال كود الإطلالة"]').fill(code);
    await page.waitForURL('**/capture', { timeout: 20000 });
    await page.getByText('تم تحميل كود الإطلالة').waitFor();
    check('stylist loads the Look Code', true);
  }

  // 6b. dark theme (per-device preference)
  await page.goto(`${BASE}/home`);
  await page.evaluate(() => { localStorage.setItem('khusla.theme', 'dark'); });
  await page.reload();
  await page.getByText('أهلاً').waitFor();
  await shot(page, '24b-home-dark');
  await page.evaluate(() => { localStorage.setItem('khusla.theme', 'light'); });

  // 7. English toggle
  await page.goto(`${BASE}/home`);
  await page.getByRole('button', { name: /اللغة/ }).click();
  await page.getByText('New client').waitFor();
  check('English toggle (LTR)', (await page.evaluate(() => document.documentElement.dir)) === 'ltr');
  await shot(page, '25-home-en');

  fs.writeFileSync(path.join(OUT, 'errors.txt'), errors.join('\n'));
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  log(`errors: ${errors.length}`);
  errors.slice(0, 20).forEach((e) => log(e));
  await browser.close();
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
process.on('unhandledRejection', (e) => {
  console.error(e);
  process.exit(1);
});
