/* CBCS — 중앙성서교회 교육부 보고서·출결·회계 (GitHub Pages + Firebase) */

/* ───────────── 공통 ───────────── */
const YEAR = window.CBCS_YEAR || new Date().getFullYear();
const DEPTS = window.CBCS_DEPT_NAMES || { kinder:'영유치부', elem:'초등부', youth:'중고등부', young:'청년부' };
const ACCOUNTS = window.CBCS_ACCOUNTS || { kinder:'kinder', elem:'elem', youth:'youth', young:'young', committee:'committee' };
const deptOfAccount = local => Object.keys(ACCOUNTS).find(k => ACCOUNTS[k] === local) || null;
const MOCK = new URLSearchParams(location.search).has('mock');
const $ = s => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10);
const won = n => (Number(n) || 0).toLocaleString('ko-KR');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const DAYS = ['일','월','화','수','목','금','토'];
const fmtK = d => { if (!d) return ''; const [y,m,dd] = d.split('-'); return `${y}년 ${+m}월 ${+dd}일 (${DAYS[new Date(d+'T00:00:00').getDay()]})`; };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const ym = d => (d || '').slice(0, 7);
const pad2 = n => String(n).padStart(2, '0');
function sundaysOf(y, m) { const r = []; const d = new Date(y, m-1, 1); while (d.getMonth() === m-1) { if (d.getDay() === 0) r.push(`${y}-${pad2(m)}-${pad2(d.getDate())}`); d.setDate(d.getDate()+1); } return r; }
function weekIndex(date) { const [y,m] = date.split('-').map(Number); const i = sundaysOf(y,m).indexOf(date); return i >= 0 ? i+1 : Math.ceil(Number(date.slice(8))/7); }
function lastSunday() { const d = new Date(); d.setDate(d.getDate()-d.getDay()); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function nextMonth(m) { const [y,mm] = m.split('-').map(Number); const d = new Date(y, mm, 1); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`; }
function prevMonth(m) { const [y,mm] = m.split('-').map(Number); const d = new Date(y, mm-2, 1); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`; }
let toastT; function toast(m, ms = 2200) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms); }
const isMobile = () => matchMedia('(max-width:760px)').matches;
function openModal(html) { $('#modal-box').innerHTML = html; $('#modal').hidden = false; $('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); }; const c = $('#modal-close'); if (c) c.onclick = closeModal; }
function closeModal() { $('#modal').hidden = true; $('#modal-box').innerHTML = ''; }

/* ───────────── 데이터 계층 ───────────── */
let fb = null;
const backend = MOCK ? mockBackend() : await firebaseBackend();

async function firebaseBackend() {
  const FB = 'https://www.gstatic.com/firebasejs/10.14.1/';
  const [{ initializeApp }, { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged }, { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs, writeBatch }] = await Promise.all([import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-firestore.js')]);
  const app = initializeApp(window.CBCS_FIREBASE);
  const auth = getAuth(app); const db = getFirestore(app);
  fb = { auth, db };
  const emailOf = d => `${ACCOUNTS[d] || d}@${window.CBCS_EMAIL_DOMAIN}`;
  const ref = p => doc(db, ...p.split('/'));
  return {
    async login(d, pw) { await signInWithEmailAndPassword(auth, emailOf(d), pw); return d; },
    async logout() { await signOut(auth); },
    onSession(cb) { onAuthStateChanged(auth, u => { if (!u) return cb(null); const d = deptOfAccount((u.email || '').split('@')[0]); if (!d) { signOut(auth); return cb(null); } cb(d); }); },
    async get(p) { const s = await getDoc(ref(p)); return s.exists() ? s.data() : null; },
    async set(p, data) { await setDoc(ref(p), data); },
    async del(p) { await deleteDoc(ref(p)); },
    async list(p) { const s = await getDocs(collection(db, ...p.split('/'))); return s.docs.map(x => ({ _id: x.id, ...x.data() })); },
    async batchSet(items, progress) { // items: [{path, data}]
      for (let i = 0; i < items.length; i += 400) {
        const b = writeBatch(db); items.slice(i, i+400).forEach(it => b.set(ref(it.path), it.data)); await b.commit();
        if (progress) progress(Math.min(i+400, items.length), items.length);
      }
    }
  };
}
function mockBackend() { // 로컬 시험용: data/import_data.json을 읽어 메모리에서 동작, localStorage에 저장
  let store = {}; const KEY = 'cbcs-mock-store';
  try { store = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} };
  let session = null; try { session = localStorage.getItem('cbcs-mock-session'); } catch (e) {}
  const seeded = (async () => { if (Object.keys(store).length) return; try { const r = await fetch('data/import_data.json'); if (!r.ok) return; const payload = await r.json(); payloadToItems(payload, { students: 1, reports: 1, money: 1, plan: 1, sch: 1, arch: 1 }).forEach(it => { store[it.path] = it.data; }); save(); } catch (e) { console.warn('mock seed 실패', e); } })();
  return {
    async login(d) { await seeded; session = d; try { localStorage.setItem('cbcs-mock-session', d); } catch (e) {} return d; },
    async logout() { session = null; try { localStorage.removeItem('cbcs-mock-session'); } catch (e) {} },
    onSession(cb) { seeded.then(() => cb(session)); },
    async get(p) { return store[p] ? JSON.parse(JSON.stringify(store[p])) : null; },
    async set(p, data) { store[p] = JSON.parse(JSON.stringify(data)); save(); },
    async del(p) { delete store[p]; save(); },
    async list(p) { const pre = p + '/'; return Object.keys(store).filter(k => k.startsWith(pre) && !k.slice(pre.length).includes('/')).map(k => ({ _id: k.slice(pre.length), ...JSON.parse(JSON.stringify(store[k])) })); },
    async batchSet(items, progress) { items.forEach(it => { store[it.path] = it.data; }); save(); if (progress) progress(items.length, items.length); }
  };
}

/* 세션·캐시 */
const S = { user: null, dept: null, data: {}, committee: null, view: 'home', sub: {}, loaded: false }; window.CBCS = S;
const isCommittee = () => S.user === 'committee';
const canEdit = () => !isMobile();
async function loadDept(d, force) {
  if (S.data[d] && !force) return S.data[d];
  const [docu, students, reports, expenses, incomes, events, notices] = await Promise.all([
    backend.get(`depts/${d}`), backend.list(`depts/${d}/students`), backend.list(`depts/${d}/reports`),
    backend.list(`depts/${d}/expenses`), backend.list(`depts/${d}/incomes`), backend.list(`depts/${d}/events`), backend.list(`depts/${d}/notices`)]);
  const dd = { id: d, doc: docu || { name: DEPTS[d], classLabel: '반', year: YEAR, classes: [], staff: [], ledgers: [], budgetPlan: [], monthlyPlans: {}, monthlyTexts: {}, notes: {} },
    students, reports: Object.fromEntries(reports.map(r => [r.date, r])), expenses, incomes, events, notices };
  dd.doc.ledgers = dd.doc.ledgers || []; dd.doc.classes = dd.doc.classes || []; dd.doc.staff = dd.doc.staff || []; dd.doc.budgetPlan = dd.doc.budgetPlan || []; dd.doc.monthlyPlans = dd.doc.monthlyPlans || {}; dd.doc.monthlyTexts = dd.doc.monthlyTexts || {}; dd.doc.notes = dd.doc.notes || {};
  S.data[d] = dd; return dd;
}
async function loadCommittee(force) {
  if (S.committee && !force) return S.committee;
  const [docu, notices, events] = await Promise.all([backend.get('committee/main'), backend.list('committee/main/notices'), backend.list('committee/main/events')]);
  S.committee = { doc: docu || { staff: [] }, notices, events }; return S.committee;
}
const D = () => S.data[S.dept];
const C = () => S.committee;
async function saveDeptDoc(d) { await backend.set(`depts/${d}`, S.data[d].doc); }

/* 집계 */
function reportStats(dd, r) {
  const st = dd.students.filter(s => s.status === 'active' || s.status === 'longabsent');
  let m = 0, f = 0, on = 0, p = 0;
  Object.entries(r.att || {}).forEach(([sid, a]) => { if (!a) return; p++; if (a === 'O') on++; const s = dd.students.find(x => x.id === sid); if (s && s.sex === '여') f++; else m++; });
  const unmatched = Object.keys(r.attUnmatched || {}).length; p += unmatched; m += unmatched;
  const c = r.counts || {};
  const hasNames = Object.keys(r.att || {}).length > 0 && !(r.imported && c.att);
  const att = hasNames ? p : (c.att || 0), attM = hasNames ? m : (c.attM || 0), attF = hasNames ? f : (c.attF || 0), online = hasNames ? on : (c.online || 0);
  const reg = c.reg || st.length, regM = c.regM || st.filter(s => s.sex === '남').length, regF = c.regF || (reg - regM);
  const off = r.offering || {}; const offSum = (off.sunday||0)+(off.tithe||0)+(off.thanks||0)+(off.other||0);
  return { m: attM, f: attF, p: att, on: online, site: att - online, rm: regM, rf: regF, total: reg, rate: reg ? Math.round(att/reg*1000)/10 : 0, offSum, newc: (r.newcomers||[]).length };
}
function monthReports(dd, m) { return Object.values(dd.reports).filter(r => ym(r.date) === m).sort((a,b) => a.date < b.date ? -1 : 1); }
function ledgerSummary(dd, ledgerId, m) {
  const L = dd.doc.ledgers.find(l => l.id === ledgerId) || { budget: 0, carry: 0, kind: 'balance', name: '' };
  const ex = dd.expenses.filter(e => e.ledgerId === ledgerId), inc = dd.incomes.filter(e => e.ledgerId === ledgerId);
  const before = e => ym(e.date) < m && e.date, inM = e => ym(e.date) === m;
  const sum = a => a.reduce((s,e) => s + (+e.amount || 0), 0);
  const prevEx = sum(ex.filter(before)), monEx = sum(ex.filter(inM)), prevIn = sum(inc.filter(before)), monIn = sum(inc.filter(inM));
  const noDateEx = sum(ex.filter(e => !e.date)), noDateIn = sum(inc.filter(e => !e.date));
  const carryIn = (L.carry||0) + prevIn - prevEx;
  return { L, prevEx, monEx, cumEx: prevEx+monEx, monIn, carryIn, balance: carryIn + monIn - monEx, remain: (L.budget||0) - prevEx - monEx, rate: L.budget ? Math.round((prevEx+monEx)/L.budget*1000)/10 : null, noDateEx, noDateIn, totalEx: sum(ex), totalIn: sum(inc) };
}
const activeStudents = dd => dd.students.filter(s => s.status === 'active' || s.status === 'longabsent');
const sName = (dd, sid) => { const s = dd.students.find(x => x.id === sid); return s ? s.name : sid; };
const classOf = (dd, s) => dd.doc.classes.find(c => c.id === s.classId);
const classStudents = (dd, cid) => activeStudents(dd).filter(s => s.classId === cid);
const faithLabel = s => { if (!s.faith) return ''; const y = s.faithYear ? String(s.faithYear).slice(-2) + (s.faithHalf || '') : ''; return y ? `${s.faith}(${y})` : s.faith; };
const phoneLabel = s => s.phone ? `${s.phone} (본인)` : s.guardianPhone ? `${s.guardianPhone} (${s.guardianRel || '보호자'})` : '';
const isUnited = r => !!(r.united || /세대통합/.test(r.type || ''));

/* ───────────── 화면 뼈대 ───────────── */
const NAV_PC = [['home','메인','⌂'],['weekly','주일 보고서','✎'],['roster','출석부','☰'],['ledger','회계','₩'],['monthly','월간 보고서','▤'],['plan','연간 계획','▦'],['stats','출석 통계','↗'],['archive','보관함','▣'],['tutorial','사용 안내','?']];
const NAV_MOBILE = [['home','메인'],['attend','출석 체크'],['reports','보고서'],['members','멤버'],['stats','통계'],['tutorial','안내']];
const NAV_COMMITTEE = [['home','메인','⌂'],['monthly','월간 보고서','▤'],['reports','보고서 열람','✎'],['roster','출석부 열람','☰'],['scholarship','장학','★'],['archive','보관함','▣'],['import','데이터 가져오기','⇪'],['tutorial','사용 안내','?']];
const NAV_COMMITTEE_MOBILE = [['home','메인'],['reports','보고서'],['monthly','월간'],['scholarship','장학'],['tutorial','안내']];
const VIEWS = {}, BIND = {};
const FOOTER = `<footer class="foot"><p>🔒 모든 자료는 교육부 전용 서버(데이터베이스)에만 보관되며, 부서 비밀번호로 로그인한 사람만 볼 수 있습니다. 외부에 공개하거나 제공하지 않습니다.</p><p>제작자: 이삭 목사 · 중앙성서교회</p></footer>`;

async function render() {
  const root = $('#root');
  if (!S.user) { root.innerHTML = loginView(); bindLogin(); return; }
  const mob = isMobile();
  const nav = isCommittee() ? (mob ? NAV_COMMITTEE_MOBILE : NAV_COMMITTEE) : (mob ? NAV_MOBILE : NAV_PC);
  if (!nav.some(n => n[0] === S.view)) S.view = 'home';
  let body = '';
  try { await loadCommittee(); if (S.dept) await loadDept(S.dept); body = await (VIEWS[S.view] ? VIEWS[S.view]() : ''); } catch (e) { console.error(e); body = `<div class="hint">화면을 그리는 중 문제가 생겼습니다: ${esc(e.message)}</div>`; }
  root.innerHTML = `<div class="app ${mob ? 'ro' : ''}">
    <aside class="side">
      <div class="brand">CBCS<small>중앙성서교회 교육부</small></div>
      <div class="dept-chip"><b>${esc(isCommittee() ? '교육위원회' : DEPTS[S.dept])}</b><button class="btn s" data-logout>나가기</button></div>
      <nav class="nav">${nav.filter(n => n[0] === 'home').map(n => `<button data-nav="home" class="home ${S.view === 'home' ? 'on' : ''}"><span class="k">${n[2] || '⌂'}</span>${n[1]}</button>`).join('')}
      <div class="nav-sep"></div>
      ${nav.filter(n => n[0] !== 'home' && n[0] !== 'import').map(n => `<button data-nav="${n[0]}" class="${S.view === n[0] ? 'on' : ''}"><span class="k">${n[2] || ''}</span>${n[1]}</button>`).join('')}
      <div class="nav-bottom"><div class="sec">${MOCK ? '시험 모드 (로컬)' : 'CBCS · ' + YEAR}</div>
      ${nav.filter(n => n[0] === 'import').map(n => `<button data-nav="import" class="${S.view === 'import' ? 'on' : ''}"><span class="k">⇪</span>${n[1]}</button>`).join('')}
      <button data-refresh><span class="k">↻</span>새로고침</button></div></nav>
      ${FOOTER}
    </aside>
    <main class="main" id="main">${body}<div class="main-foot">${FOOTER}</div></main>
    <nav class="mobile-nav">${nav.map(n => `<button data-nav="${n[0]}" class="${S.view === n[0] ? 'on' : ''}">${n[1]}</button>`).join('')}<button data-logout>나가기</button></nav>
  </div>`;
  root.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => { S.view = b.dataset.nav; S.sub = {}; render(); });
  root.querySelectorAll('[data-logout]').forEach(b => b.onclick = async () => { await backend.logout(); S.user = null; S.dept = null; S.data = {}; S.committee = null; render(); });
  const rf = root.querySelector('[data-refresh]'); if (rf) rf.onclick = async () => { S.data = {}; S.committee = null; toast('다시 불러오는 중…'); await render(); toast('새로고침 완료'); };
  root.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { S.view = b.dataset.go; S.sub = b.dataset.sub ? JSON.parse(b.dataset.sub) : {}; render(); });
  if (BIND[S.view]) { try { BIND[S.view](); } catch (e) { console.error(e); } }
  window.scrollTo(0, 0);
}
matchMedia('(max-width:760px)').addEventListener('change', () => { if (S.user) render(); });

/* ───────────── 로그인 ───────────── */
function loginView() {
  return `<div class="login"><div class="box">
    <div class="brand">CBCS</div><p>중앙성서교회 교육부 보고서·출결·회계</p>
    <div class="stack">
      <label class="f"><span>부서</span><select id="lg-dept">${Object.entries(DEPTS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}<option value="committee">교육위원회 (전 부서 열람)</option></select></label>
      <label class="f"><span>부서 비밀번호</span><input type="password" id="lg-pw" placeholder="비밀번호" autocomplete="current-password"></label>
      <div id="lg-err" class="note" style="color:var(--bad)" hidden></div>
      <button class="btn p" id="lg-go">들어가기</button>
    </div>
    <p class="note" style="margin-top:14px">PC에서는 작성·수정·출력, 휴대폰에서는 열람과 출석 체크를 합니다. 비밀번호를 모르면 부서 부장이나 교육위원회에 문의하세요.${MOCK ? '<br><b>시험 모드</b>: 아무 비밀번호나 됩니다. 데이터는 이 브라우저에만 저장됩니다.' : ''}</p>
    ${FOOTER}
  </div></div>`;
}
function bindLogin() {
  const go = async () => {
    const d = $('#lg-dept').value, pw = $('#lg-pw').value; const btn = $('#lg-go'); btn.disabled = true; btn.textContent = '확인 중…';
    try { await backend.login(d, pw); S.user = d; S.dept = d === 'committee' ? null : d; S.view = 'home'; S.sub = {}; let seen = false; try { seen = localStorage.getItem('cbcs-tutorial-' + d); } catch (e) {} if (!seen) { S.view = 'tutorial'; try { localStorage.setItem('cbcs-tutorial-' + d, '1'); } catch (e) {} } render(); }
    catch (e) { const el = $('#lg-err'); el.hidden = false; el.textContent = /password|credential|user-not-found|invalid/i.test(e.code || e.message) ? '비밀번호가 맞지 않습니다.' : '로그인 실패: ' + (e.code || e.message); btn.disabled = false; btn.textContent = '들어가기'; }
  };
  $('#lg-go').onclick = go; $('#lg-pw').onkeydown = e => { if (e.key === 'Enter') go(); };
}

/* ───────────── 달력·공지 공통 ───────────── */
function calendarHTML(m, events) {
  const [y, mm] = m.split('-').map(Number); const first = new Date(y, mm-1, 1); const days = new Date(y, mm, 0).getDate(); const t = today();
  let h = DAYS.map(d => `<div class="h">${d}</div>`).join('');
  for (let i = 0; i < first.getDay(); i++) h += '<div></div>';
  for (let d = 1; d <= days; d++) { const ds = `${m}-${pad2(d)}`; const dow = (first.getDay()+d-1) % 7; const ev = events.filter(e => e.date <= ds && (e.end || e.date) >= ds);
    h += `<div class="d ${dow===0?'sun':''} ${ds===t?'today':''}"><div class="n">${d}</div>${ev.map(e => `<div class="e ${e.c?'c':''}" title="${esc(e.title)}">${esc(e.title)}</div>`).join('')}</div>`; }
  return `<div class="cal">${h}</div>`;
}
function allEvents(dd) { const c = S.committee ? S.committee.events.map(e => ({ ...e, c: true })) : []; return [...c, ...(dd ? dd.events : [])]; }
function monthNav(m) { return `<div class="row" style="margin-bottom:8px"><button class="btn s" data-month="${prevMonth(m)}">‹ 이전 달</button><button class="btn s" data-month="${today().slice(0,7)}">이번 달</button><button class="btn s" data-month="${nextMonth(m)}">다음 달 ›</button><span class="note">${m.replace('-','년 ')}월</span></div>`; }
function bindMonthNav() { document.querySelectorAll('[data-month]').forEach(b => b.onclick = () => { S.sub.month = b.dataset.month; render(); }); }
function eventListHTML(events, m) { const ev = events.filter(e => ym(e.date) === m || (e.end && e.date <= m+'-31' && e.end >= m+'-01')).sort((a,b) => a.date < b.date ? -1 : 1); return `<div class="list">${ev.map(e => `<div class="item"><div><div class="t">${esc(e.title)}</div><div class="d">${fmtK(e.date)}${e.end ? ' ~ ' + fmtK(e.end) : ''}${e.note ? ' · ' + esc(e.note) : ''}</div></div>${e.c ? '<span class="pill mute">교육위원회</span>' : ''}</div>`).join('') || '<div class="note">이달 일정이 없습니다.</div>'}</div>`; }

/* ───────────── 메인 ───────────── */
VIEWS.home = async () => {
  await loadCommittee();
  const m = S.sub.month || today().slice(0, 7);
  if (isCommittee()) {
    const ls = S.sub.date || lastSunday();
    const rows = [];
    for (const d of Object.keys(DEPTS)) { const dd = await loadDept(d); const r = dd.reports[ls]; rows.push({ d, dd, r, s: r ? reportStats(dd, r) : null }); }
    return `<div class="topbar"><div><h1>교육위원회</h1><div class="sub">전 부서 제출 현황과 공지</div></div><div class="row"><input type="date" id="c-date" value="${ls}" style="width:auto"><button class="btn s" id="c-date-go">조회</button></div></div>
    <div class="stack">
      <div class="card"><h2>주일 보고서 제출 현황 <span class="r">${fmtK(ls)}</span></h2><div class="tw"><table><thead><tr><th>부서</th><th>상태</th><th class="n">재적</th><th class="n">출석</th><th class="n">출석률</th><th class="n">헌금</th><th>특이사항</th><th></th></tr></thead><tbody>
      ${rows.map(({ d, dd, r, s }) => r ? `<tr><td>${DEPTS[d]}</td><td><span class="pill ok">제출</span></td><td class="n">${s.total}</td><td class="n">${s.p}</td><td class="n">${s.rate}%</td><td class="n">${won(s.offSum)}</td><td class="wrap note">${isUnited(r) ? '<span class="pill info">세대통합</span> ' : ''}${esc((r.special||'').split('\n')[0]).slice(0,60)}</td><td><button class="btn s" data-go="reports" data-sub='${JSON.stringify({ dept: d, preview: ls })}'>보기</button></td></tr>`
        : `<tr><td>${DEPTS[d]}</td><td><span class="pill warn">미제출</span></td><td class="n">${activeStudents(dd).length}</td><td class="n">—</td><td class="n">—</td><td class="n">—</td><td></td><td></td></tr>`).join('')}
      </tbody></table></div></div>
      <div class="grid2">
        <div class="card"><h2>공지 <span class="r">교육위원회 → 전 부서</span></h2><div class="list">${C().notices.sort((a,b) => a.date < b.date ? 1 : -1).map(n => `<div class="item"><div><div class="t">${esc(n.title)}</div><div class="d">${n.date} · ${esc(n.body)}</div></div><button class="btn s d edit-only" data-del-cn="${n._id}">삭제</button></div>`).join('') || '<div class="note">공지가 없습니다.</div>'}</div>
          <div class="row edit-only" style="margin-top:10px"><input type="text" id="cn-title" placeholder="공지 제목" style="flex:2"><input type="text" id="cn-body" placeholder="내용" style="flex:3"><button class="btn" id="cn-add">올리기</button></div></div>
        <div class="card"><h2>공통 일정 <span class="r">${m.replace('-','년 ')}월</span></h2>${monthNav(m)}${eventListHTML(C().events.map(e => ({ ...e, c: false })), m)}
          <div class="row edit-only" style="margin-top:10px"><input type="date" id="ce-date" style="width:auto"><input type="text" id="ce-title" placeholder="일정" style="flex:2"><button class="btn" id="ce-add">추가</button></div>
          <div class="list" style="margin-top:8px">${C().events.filter(e => ym(e.date) === m).map(e => `<div class="item edit-only"><div class="d">${e.date} ${esc(e.title)}</div><button class="btn s d" data-del-ce="${e._id}">삭제</button></div>`).join('')}</div></div>
      </div>
      <div class="card"><h2>${m.replace('-','년 ')}월 달력 <span class="r">교육위원회 공통 일정</span></h2>${calendarHTML(m, C().events.map(e => ({ ...e, c: true })))}</div>
    </div>`;
  }
  const dd = await loadDept(S.dept); const ls = lastSunday(); const r = dd.reports[ls]; const s = r ? reportStats(dd, r) : null;
  const notices = [...C().notices.map(n => ({ ...n, from: '교육위원회', own: false })), ...dd.notices.map(n => ({ ...n, from: dd.doc.name, own: true }))].sort((a,b) => a.date < b.date ? 1 : -1);
  return `<div class="topbar"><div><h1>${esc(dd.doc.name)}</h1><div class="sub">${fmtK(today())}${dd.doc.notes && dd.doc.notes.merge ? ' · ' + esc(dd.doc.notes.merge) : ''}</div></div>${canEdit() ? `<button class="btn p" data-go="weekly" data-sub='${JSON.stringify({ date: ls })}'>이번 주 보고서 작성</button>` : `<button class="btn p" data-go="attend">출석 체크</button>`}</div>
  <div class="stack">
    <div class="tiles">
      <div class="tile"><div class="v">${activeStudents(dd).length}</div><div class="l">재적</div></div>
      <div class="tile"><div class="v">${s ? s.p : '—'}</div><div class="l">지난 주일 출석 ${s ? `(${s.rate}%)` : ''}</div></div>
      <div class="tile"><div class="v">${s ? won(s.offSum) : '—'}</div><div class="l">지난 주일 헌금(원)</div></div>
      <div class="tile"><div class="v">${r ? (r.status === 'done' ? '<span class="pill ok">작성 완료</span>' : '<span class="pill warn">작성 중</span>') : '<span class="pill warn">미작성</span>'}</div><div class="l">${fmtK(ls)} 보고서</div></div>
    </div>
    <div class="grid2">
      <div class="card"><h2>공지</h2><div class="list">${notices.map(n => `<div class="item"><div><div class="t">${esc(n.title)} <span class="pill mute">${n.from}</span></div><div class="d">${n.date} · ${esc(n.body)}</div></div>${n.own ? `<button class="btn s d edit-only" data-del-n="${n._id}">삭제</button>` : ''}</div>`).join('') || '<div class="note">공지가 없습니다.</div>'}</div>
        <div class="row edit-only" style="margin-top:10px"><input type="text" id="n-title" placeholder="부서 공지 제목" style="flex:2"><input type="text" id="n-body" placeholder="내용" style="flex:3"><button class="btn" id="n-add">올리기</button></div></div>
      <div class="card"><h2>${m.replace('-','년 ')}월 일정 <span class="r">회색 표시는 교육위원회 공통</span></h2>${monthNav(m)}${eventListHTML(allEvents(dd), m)}</div>
    </div>
    <div class="card"><h2>${m.replace('-','년 ')}월 달력</h2>${calendarHTML(m, allEvents(dd))}</div>
  </div>`;
};
BIND.home = () => {
  bindMonthNav();
  if (isCommittee()) {
    const g = $('#c-date-go'); if (g) g.onclick = () => { S.sub.date = $('#c-date').value; render(); };
    const a = $('#cn-add'); if (a) a.onclick = async () => { const t = $('#cn-title').value.trim(); if (!t) return; const n = { id: uid(), date: today(), title: t, body: $('#cn-body').value.trim() }; await backend.set(`committee/main/notices/${n.id}`, n); C().notices.push({ _id: n.id, ...n }); render(); };
    document.querySelectorAll('[data-del-cn]').forEach(b => b.onclick = async () => { await backend.del(`committee/main/notices/${b.dataset.delCn}`); C().notices = C().notices.filter(n => n._id !== b.dataset.delCn); render(); });
    const e = $('#ce-add'); if (e) e.onclick = async () => { const dt = $('#ce-date').value, t = $('#ce-title').value.trim(); if (!dt || !t) return; const ev = { id: uid(), date: dt, end: '', title: t, note: '' }; await backend.set(`committee/main/events/${ev.id}`, ev); C().events.push({ _id: ev.id, ...ev }); render(); };
    document.querySelectorAll('[data-del-ce]').forEach(b => b.onclick = async () => { await backend.del(`committee/main/events/${b.dataset.delCe}`); C().events = C().events.filter(n => n._id !== b.dataset.delCe); render(); });
    return;
  }
  const dd = D();
  const a = $('#n-add'); if (a) a.onclick = async () => { const t = $('#n-title').value.trim(); if (!t) return; const n = { id: uid(), date: today(), title: t, body: $('#n-body').value.trim() }; await backend.set(`depts/${S.dept}/notices/${n.id}`, n); dd.notices.push({ _id: n.id, ...n }); render(); };
  document.querySelectorAll('[data-del-n]').forEach(b => b.onclick = async () => { await backend.del(`depts/${S.dept}/notices/${b.dataset.delN}`); dd.notices = dd.notices.filter(n => n._id !== b.dataset.delN); render(); });
};

/* ───────────── 진급 규칙 ───────────── */
const NEXT_DEPT = { kinder: 'elem', elem: 'youth', youth: 'young' };
function kinderClassFor(age) { return age <= 2 ? '유아1' : age === 3 ? '유아2' : age === 4 ? '유치1' : '유치2'; }
function promotionPlan(dd, nextYear) {
  const out = [], internal = [];
  for (const s of activeStudents(dd)) {
    const by = s.birth ? +s.birth.slice(0, 4) : 0;
    if (dd.id === 'kinder') {
      if (by && nextYear - by >= 7) out.push({ s, toDept: 'elem', toClass: '1학년' });
      else if (by) { const nc = kinderClassFor(nextYear - by - 1); if (nc !== s.classId && dd.doc.classes.some(c => c.id === nc)) internal.push({ s, from: s.classId, to: nc }); }
    } else if (dd.id === 'elem') {
      const g = parseInt(s.classId); if (g === 6) out.push({ s, toDept: 'youth', toClass: '중1' }); else if (g >= 1 && g <= 5) internal.push({ s, from: s.classId, to: `${g + 1}학년` });
    } else if (dd.id === 'youth') {
      const m = /^(중|고)(\d)$/.exec(s.classId || '');
      if (m) { const lv = m[1], g = +m[2]; if (lv === '고' && g === 3) out.push({ s, toDept: 'young', toClass: '' }); else if (lv === '중' && g === 3) internal.push({ s, from: s.classId, to: '고1' }); else internal.push({ s, from: s.classId, to: `${lv}${g + 1}` }); }
    }
  }
  return { out, internal };
}
async function syncPromotions(dd, nextYear) { // 보내는 부서가 출석부를 열 때 진급 예정자를 공유 목록에 적어 둔다
  if (!NEXT_DEPT[dd.id]) return;
  const { out } = promotionPlan(dd, nextYear);
  const existing = (S.promotions || (S.promotions = await backend.list('promotions'))).filter(p => p.fromDept === dd.id && p.year === nextYear);
  const want = out.map(({ s, toDept, toClass }) => ({ id: `${nextYear}_${s.id}`, year: nextYear, fromDept: dd.id, toDept, toClass, studentId: s.id, name: s.name, sex: s.sex, birth: s.birth || '', fromClass: s.classId || '', phone: s.phone || '', guardianPhone: s.guardianPhone || '', guardianRel: s.guardianRel || '', father: s.father || '', mother: s.mother || '', faith: s.faith || '', faithYear: s.faithYear || '', faithHalf: s.faithHalf || '', address: s.address || '', siblings: s.siblings || [], school: s.school || '', note: s.note || '', received: (existing.find(e => e._id === `${nextYear}_${s.id}`) || {}).received || false }));
  const changed = [];
  for (const w of want) { const e = existing.find(x => x._id === w.id); if (!e || JSON.stringify({ ...e, _id: undefined, received: undefined }) !== JSON.stringify({ ...w, _id: undefined, received: undefined })) changed.push(w); }
  for (const e of existing) if (!want.some(w => w.id === e._id) && !e.received) { await backend.del(`promotions/${e._id}`); S.promotions = S.promotions.filter(x => x._id !== e._id); }
  for (const w of changed) { await backend.set(`promotions/${w.id}`, w); S.promotions = S.promotions.filter(x => x._id !== w.id); S.promotions.push({ _id: w.id, ...w }); }
}
function promotionPaper(dd, nextYear, plan, incoming) {
  const row = (x, cls) => `<tr><td>${esc(x.name)}</td><td>${esc(x.sex || '')}</td><td>${esc(x.birth || '')}</td><td>${esc(cls)}</td><td>${esc(phoneLabel(x))}</td></tr>`;
  return `<section class="paper">
    <div class="hd"><div><h1>${nextYear}년 ${esc(dd.doc.name)} 진급·입학 예정자 명단</h1><div class="sub">중앙성서교회 교육위원회 · ${YEAR}년 ${today().slice(5).replace('-', '/')} 기준</div></div><div class="meta">재적 ${activeStudents(dd).length}명 · 진급 ${plan.internal.length} · 졸업·상급 부서 ${plan.out.length} · 입학 예정 ${incoming.length}</div></div>
    <h2>1. ${nextYear}년 입학 예정 (하급 부서에서 올라옴)</h2><table><thead><tr><th>이름</th><th>성별</th><th>생년월일</th><th>배정 ${esc(dd.doc.classLabel)}</th><th>연락처</th></tr></thead><tbody>${incoming.map(x => row(x, (x.toClass || '') + ' ← ' + (DEPTS[x.fromDept] || x.fromDept) + ' ' + (x.fromClass || ''))).join('') || '<tr><td colspan="5">—</td></tr>'}</tbody></table>
    <h2>2. 부서 안 진급</h2><table><thead><tr><th>이름</th><th>성별</th><th>생년월일</th><th>${esc(dd.doc.classLabel)}</th><th>연락처</th></tr></thead><tbody>${plan.internal.map(({ s, from, to }) => row(s, `${from} → ${to}`)).join('') || '<tr><td colspan="5">—</td></tr>'}</tbody></table>
    <h2>3. 졸업 · 상급 부서로 진급</h2><table><thead><tr><th>이름</th><th>성별</th><th>생년월일</th><th>진급</th><th>연락처</th></tr></thead><tbody>${plan.out.map(({ s, toDept, toClass }) => row(s, `${s.classId || ''} → ${DEPTS[toDept]} ${toClass}`)).join('') || '<tr><td colspan="5">—</td></tr>'}</tbody></table>
    <div class="merge">기준: 초등학교 입학은 생년 + 7년, 학년은 +1, 중3 → 고1, 고3 → 청년부. 생년월일이 없는 학생은 자동 분류되지 않으니 출석부에서 보완하세요.</div>
    <div class="ft"><b>중앙성서교회 교육위원회</b><span>CBCS에서 생성 · ${esc(dd.doc.name)}-${nextYear}-진급자.pdf</span></div>
  </section>`;
}

/* ───────────── 출석부 ───────────── */
function studentRow(dd, s, edit) {
  const c = classOf(dd, s);
  return `<tr class="click" data-student="${s.id}"><td>${esc(s.name)}${s.flags && s.flags.length ? ' <span class="tag flag" title="확인 필요">!</span>' : ''}</td><td>${esc(c ? c.name : s.classId)}</td><td>${esc(s.sex)}</td><td>${s.birth || ''}</td><td>${esc(faithLabel(s))}</td><td>${esc(phoneLabel(s))}</td><td class="wrap note">${esc(s.school || '')}</td><td class="wrap note">${esc(s.note || '')}</td><td><span class="pill ${s.status === 'active' ? 'ok' : s.status === 'newcomer' ? 'info' : s.status === 'longabsent' ? 'warn' : 'mute'}">${{ active: '재적', newcomer: '새친구', longabsent: '장기결석', left: '제적·졸업' }[s.status] || s.status}</span></td></tr>`;
}
VIEWS.roster = async () => {
  let dd; if (isCommittee()) { const d = S.sub.dept || 'kinder'; dd = await loadDept(d); } else dd = D();
  const nextYear = YEAR + 1; const plan = promotionPlan(dd, nextYear);
  if (!isCommittee() && canEdit()) { try { await syncPromotions(dd, nextYear); } catch (e) { console.warn('진급 동기화 실패', e); } }
  const promos = S.promotions || (S.promotions = await backend.list('promotions'));
  const incoming = promos.filter(p => p.toDept === dd.id && p.year === nextYear && !p.received).sort((a, b) => (a.birth || '') < (b.birth || '') ? -1 : 1);
  if (S.sub.promoPrint) return `<div class="topbar no-print"><div><h1>진급자 명단</h1><div class="sub">${nextYear}년 기준 · 인쇄하거나 PDF로 저장</div></div><div class="row"><button class="btn" id="pp-back">출석부로</button><button class="btn p" id="pp-print">PDF로 저장 / 인쇄</button></div></div>${promotionPaper(dd, nextYear, plan, incoming)}`;
  const show = S.sub.show || 'active';
  const list = dd.students.filter(s => show === 'all' ? true : show === 'active' ? (s.status === 'active' || s.status === 'longabsent') : s.status === show);
  const sort = S.sub.sort || 'gradeAsc';
  const corder = s => { const i = dd.doc.classes.findIndex(c => c.id === s.classId); return i < 0 ? 999 : i; };
  const byName = (a, b) => a.name.localeCompare(b.name, 'ko');
  const sorted = list.slice().sort(sort === 'name' ? byName : sort === 'gradeDesc' ? ((a, b) => { const sa = /새친구|장기/.test(a.classId || '') ? 1 : 0, sb = /새친구|장기/.test(b.classId || '') ? 1 : 0; return sa - sb || corder(b) - corder(a) || byName(a, b); }) : ((a, b) => corder(a) - corder(b) || byName(a, b)));
  const deptPick = isCommittee() ? `<div class="row" style="margin-bottom:10px">${Object.entries(DEPTS).map(([k,v]) => `<button class="btn ${dd.id === k ? 'p' : ''}" data-dept="${k}">${v}</button>`).join('')}</div>` : '';
  return `<div class="topbar"><div><h1>출석부 — ${esc(dd.doc.name)}</h1><div class="sub">재적 ${activeStudents(dd).length}명 · 교사·임원 ${dd.doc.staff.filter(t => t.status !== 'left').length}명 · 이름을 누르면 학생 카드가 열립니다</div></div>
    <div class="row">${['active','newcomer','left','all'].map(k => `<button class="btn s ${show === k ? 'p' : ''}" data-show="${k}">${{ active: '재적', newcomer: '새친구', left: '제적·졸업', all: '전체' }[k]}</button>`).join('')}${canEdit() ? `<button class="btn s" id="pp-open">진급자 명단 출력</button>` : ''}</div></div>
  ${deptPick}
  <div class="stack">
    ${incoming.length || plan.out.length ? `<div class="card"><h2>${nextYear}년 진급 예정 <span class="r">생년월일·학년으로 자동 계산 · 연초에 "출석부에 받기"를 누르면 재적으로 들어옵니다</span></h2>
      ${incoming.length ? `<div class="note" style="margin-bottom:4px">입학 예정 (${incoming.length}명)</div><div class="tw"><table><thead><tr><th>이름</th><th>성별</th><th>생년월일</th><th>배정 ${esc(dd.doc.classLabel)}</th><th>이전 소속</th><th>연락처</th></tr></thead><tbody>${incoming.map(x => `<tr><td>${esc(x.name)}</td><td>${esc(x.sex || '')}</td><td>${esc(x.birth || '')}</td><td>${esc(x.toClass || '')}</td><td>${esc(DEPTS[x.fromDept] || x.fromDept)} ${esc(x.fromClass || '')}</td><td>${esc(phoneLabel(x))}</td></tr>`).join('')}</tbody></table></div>${canEdit() && !isCommittee() ? `<div class="row edit-only" style="margin-top:8px"><button class="btn p" id="pp-receive">${nextYear}년 입학 예정자 ${incoming.length}명을 출석부에 받기</button><span class="note">받은 뒤에는 "${dd.doc.classLabel}"과 상태를 출석부에서 고칠 수 있습니다.</span></div>` : ''}` : ''}
      ${plan.out.length ? `<div class="note" style="margin:10px 0 4px">졸업·상급 부서 진급 예정 (${plan.out.length}명) — 상대 부서 출석부에 자동으로 표시됩니다</div><div class="row" style="gap:6px">${plan.out.map(({ s, toDept, toClass }) => `<span class="pill mute">${esc(s.name)} → ${DEPTS[toDept]} ${esc(toClass)}</span>`).join('')}</div>` : ''}
    </div>` : ''}
    <div class="card"><h2><span>학생 <span class="row" style="display:inline-flex;gap:4px;margin-left:8px">${[['gradeAsc', dd.doc.classLabel + ' 오름차순'], ['gradeDesc', dd.doc.classLabel + ' 내림차순'], ['name', '이름 가나다순']].map(([k, v]) => `<button class="btn s ${sort === k ? 'p' : ''}" data-sort="${k}">${esc(v)}</button>`).join('')}</span></span> <span class="r">생년월일·연락처·주소는 부서 안에서만 보이고 PDF에는 이름만 나갑니다</span></h2>
      <div class="tw"><table class="roster"><colgroup><col style="width:96px"><col style="width:130px"><col style="width:52px"><col style="width:108px"><col style="width:110px"><col style="width:170px"><col style="width:150px"><col><col style="width:84px"></colgroup><thead><tr><th>이름</th><th>${esc(dd.doc.classLabel)}</th><th>성별</th><th>생년월일</th><th>신급</th><th>연락처</th><th>학교</th><th>비고</th><th>상태</th></tr></thead><tbody>
      ${sorted.map(s => studentRow(dd, s)).join('')}
      </tbody></table></div>
      ${canEdit() && !isCommittee() ? `<div class="fields edit-only" style="margin-top:12px">
        <label class="f"><span>이름</span><input type="text" id="s-name"></label>
        <label class="f"><span>${esc(dd.doc.classLabel)}</span><select id="s-class">${dd.doc.classes.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label>
        <label class="f"><span>성별</span><select id="s-sex"><option>남</option><option>여</option></select></label>
        <label class="f"><span>생년월일</span><input type="date" id="s-birth"></label>
        <label class="f"><span>연락처 (본인)</span><input type="tel" id="s-p"></label>
        <label class="f"><span>보호자 연락처</span><div class="row" style="gap:4px"><input type="tel" id="s-gp" style="flex:1"><select id="s-grel" style="width:auto"><option>모</option><option>부</option><option>보호자</option></select></div></label>
        <label class="f"><span>비고</span><input type="text" id="s-n" placeholder="형제자매, 특이사항"></label>
      </div><div class="row edit-only" style="margin-top:8px"><button class="btn p" id="s-add">학생 추가</button><span class="note">새친구는 주일 보고서에서 등록하면 자동으로 들어옵니다. 세부 정보는 학생 카드에서 고칩니다.</span></div>` : ''}
    </div>
    <div class="grid2">
      <div class="card"><h2>${esc(dd.doc.classLabel)} 편성</h2><div class="list">${dd.doc.classes.map(c => `<div class="item"><div><div class="t">${esc(c.name)}</div><div class="d">담임 ${esc(c.teacher || '미정')}${c.assistant ? ' · 보조 ' + esc(c.assistant) : ''} · ${classStudents(dd, c.id).length}명</div>${c.flags && c.flags.length ? `<div class="flags">${c.flags.map(esc).join('<br>')}</div>` : ''}</div>${canEdit() && !isCommittee() ? `<div class="row edit-only"><button class="btn s" data-edit-c="${esc(c.id)}">수정</button><button class="btn s d" data-del-c="${esc(c.id)}">삭제</button></div>` : ''}</div>`).join('')}</div>
        ${canEdit() && !isCommittee() ? `<div class="row edit-only" style="margin-top:10px"><input type="text" id="c-name" placeholder="새 ${esc(dd.doc.classLabel)} 이름" style="flex:1"><input type="text" id="c-teacher" placeholder="담임" style="width:120px"><button class="btn" id="c-add">추가</button></div>` : ''}</div>
      <div class="card"><h2>교사·임원</h2><div class="tw"><table><thead><tr><th>이름</th><th>역할</th><th>반</th><th>연락처</th><th>비고</th><th></th></tr></thead><tbody>${dd.doc.staff.filter(t => t.status !== 'left').map((t, i) => `<tr><td>${esc(t.name)}${t.flags && t.flags.length ? ' <span class="tag flag" title="' + esc(t.flags.join(' / ')) + '">!</span>' : ''}</td><td>${esc(t.role)}</td><td>${esc(t.classId || '')}</td><td>${esc(t.phone || '')}</td><td class="wrap note">${esc(t.note || '')}</td><td>${canEdit() && !isCommittee() ? `<button class="btn s edit-only" data-edit-t="${i}">수정</button> <button class="btn s d edit-only" data-del-t="${i}">삭제</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
        ${canEdit() && !isCommittee() ? `<div class="row edit-only" style="margin-top:10px"><input type="text" id="t-name" placeholder="이름" style="flex:1"><input type="text" id="t-role" placeholder="역할 (부장, 총무, 회계, 담임…)" style="flex:2"><input type="tel" id="t-phone" placeholder="연락처" style="width:140px"><button class="btn" id="t-add">추가</button></div>` : ''}
        ${dd.doc.staff.some(t => t.status === 'left') ? `<div class="note" style="margin-top:8px">이전 교역자·교사: ${dd.doc.staff.filter(t => t.status === 'left').map(t => esc(t.name) + '(' + esc(t.role) + ')').join(', ')}</div>` : ''}</div>
    </div>
  </div>`;
};
function studentCard(dd, s) {
  const c = classOf(dd, s); const reps = Object.values(dd.reports).filter(r => r.date.startsWith(String(YEAR))).sort((a,b) => a.date < b.date ? -1 : 1);
  const attRows = reps.map(r => ({ date: r.date, v: (r.att || {})[s.id] || '', reason: (r.absent || {})[s.id] || '' }));
  const present = attRows.filter(a => a.v).length;
  const f = k => esc(s[k] || '');
  const edit = canEdit() && !isCommittee();
  return `<h2>${esc(s.name)} <span class="note">${esc(c ? c.name : s.classId)} · ${esc(s.sex)}</span><button class="btn s" id="modal-close">닫기</button></h2>
    ${s.flags && s.flags.length ? `<div class="flags">${s.flags.map(esc).join('<br>')}</div>` : ''}
    <div class="grid2" style="margin-top:10px">
      <dl class="kvl"><dt>생년월일</dt><dd>${f('birth')}</dd><dt>신급</dt><dd>${esc(faithLabel(s))}</dd><dt>학교</dt><dd>${f('school')}</dd><dt>연락처(본인)</dt><dd>${f('phone')}</dd><dt>보호자 연락처</dt><dd>${f('guardianPhone')}${s.guardianPhone ? ' (' + esc(s.guardianRel || '보호자') + ')' : ''}</dd><dt>아버지</dt><dd>${f('father')}</dd><dt>어머니</dt><dd>${f('mother')}</dd><dt>형제자매</dt><dd>${esc((s.siblings || []).join(', '))}</dd><dt>주소</dt><dd>${f('address')}</dd><dt>전도자</dt><dd>${f('evangelist')}</dd><dt>장학</dt><dd>${esc((s.scholarship || []).join(', '))}</dd><dt>비고</dt><dd>${f('note')}</dd></dl>
      <div><div class="note" style="margin-bottom:4px">소속 이력</div><table><tbody>${(s.history || []).map(h => `<tr><td>${h.year}</td><td>${esc(DEPTS[h.dept] || h.dept)}${h.origDept && h.origDept !== DEPTS[h.dept] ? ' (' + esc(h.origDept) + ')' : ''}</td><td>${esc(h.classId || '')}</td><td class="note">${esc(h.note || '')}</td></tr>`).join('') || '<tr><td class="note">기록 없음</td></tr>'}<tr><td>${YEAR}</td><td>${esc(dd.doc.name)}</td><td>${esc(c ? c.name : s.classId)}</td><td class="note">현재</td></tr></tbody></table>
        <div class="note" style="margin:10px 0 4px">${YEAR}년 출석 ${present}/${reps.length}회</div>
        <div class="row" style="gap:3px">${attRows.map(a => `<span title="${a.date}${a.reason ? ' ' + esc(a.reason) : ''}" style="width:12px;height:12px;border-radius:2px;display:inline-block;background:${a.v === 'P' ? 'var(--ok)' : a.v === 'O' ? 'var(--warn)' : 'var(--line)'}"></span>`).join('')}</div></div>
    </div>
    ${edit ? `<div class="fields" style="margin-top:14px">
      <label class="f"><span>이름</span><input type="text" id="sc-name" value="${esc(s.name)}"></label>
      <label class="f"><span>${esc(dd.doc.classLabel)}</span><select id="sc-class">${dd.doc.classes.map(x => `<option value="${esc(x.id)}" ${x.id === s.classId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}<option value="${esc(s.classId)}" ${c ? '' : 'selected'}>${esc(s.classId || '(없음)')}</option></select></label>
      <label class="f"><span>성별</span><select id="sc-sex"><option ${s.sex === '남' ? 'selected' : ''}>남</option><option ${s.sex === '여' ? 'selected' : ''}>여</option></select></label>
      <label class="f"><span>상태</span><select id="sc-status">${[['active','재적'],['newcomer','새친구'],['longabsent','장기결석'],['left','제적·졸업']].map(([k,v]) => `<option value="${k}" ${s.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="f"><span>생년월일</span><input type="date" id="sc-birth" value="${esc(s.birth || '')}"></label>
      <label class="f"><span>신급</span><select id="sc-faith">${['','유아세례','학습','세례','입교','미정'].map(k => `<option value="${k}" ${(s.faith || '') === k ? 'selected' : ''}>${k || '(없음)'}</option>`).join('')}${['','유아세례','학습','세례','입교','미정'].includes(s.faith || '') ? '' : `<option selected>${esc(s.faith)}</option>`}</select></label>
      <label class="f"><span>신급 연도·반기</span><div class="row" style="gap:4px"><input type="number" id="sc-fyear" value="${s.faithYear || ''}" placeholder="2019" style="width:90px"><select id="sc-fhalf" style="width:auto"><option value="" ${!s.faithHalf ? 'selected' : ''}>—</option><option ${s.faithHalf === '상' ? 'selected' : ''}>상</option><option ${s.faithHalf === '하' ? 'selected' : ''}>하</option></select></div></label>
      <label class="f"><span>학교</span><input type="text" id="sc-school" value="${f('school')}"></label>
      <label class="f"><span>연락처 (본인)</span><input type="tel" id="sc-phone" value="${f('phone')}"></label>
      <label class="f"><span>보호자 연락처</span><div class="row" style="gap:4px"><input type="tel" id="sc-gphone" value="${f('guardianPhone')}" style="flex:1"><select id="sc-grel" style="width:auto">${['부','모','보호자'].map(k => `<option ${(s.guardianRel || '보호자') === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div></label>
      <label class="f"><span>아버지</span><input type="text" id="sc-father" value="${f('father')}"></label>
      <label class="f"><span>어머니</span><input type="text" id="sc-mother" value="${f('mother')}"></label>
      <label class="f" style="grid-column:span 2"><span>주소</span><input type="text" id="sc-address" value="${f('address')}"></label>
      <label class="f" style="grid-column:span 2"><span>비고</span><input type="text" id="sc-note" value="${f('note')}"></label>
    </div><div class="row" style="margin-top:10px"><button class="btn p" id="sc-save">저장</button><button class="btn" id="sc-clear-flags" ${s.flags && s.flags.length ? '' : 'disabled'}>확인 표시 지우기</button><button class="btn d" id="sc-del">삭제</button></div>` : ''}`;
}
BIND.roster = () => {
  const dd = isCommittee() ? S.data[S.sub.dept || 'kinder'] : D();
  const po = $('#pp-open'); if (po) po.onclick = () => { S.sub.promoPrint = true; render(); };
  const pb = $('#pp-back'); if (pb) { pb.onclick = () => { delete S.sub.promoPrint; render(); }; $('#pp-print').onclick = () => window.print(); return; }
  const pr = $('#pp-receive'); if (pr) pr.onclick = async () => {
    const nextYear = YEAR + 1; const inc = (S.promotions || []).filter(p => p.toDept === dd.id && p.year === nextYear && !p.received);
    for (const x of inc) {
      const sid = `${dd.id}_${x.name}_${x.birth || uid()}`;
      const st = { id: sid, name: x.name, sex: x.sex || '남', birth: x.birth || '', classId: x.toClass || (dd.doc.classes[0] || {}).id || '', status: 'active', dept: dd.id, faith: x.faith || '', faithYear: x.faithYear || '', faithHalf: x.faithHalf || '', phone: x.phone || '', guardianPhone: x.guardianPhone || '', guardianRel: x.guardianRel || '', school: x.school || '', father: x.father || '', mother: x.mother || '', siblings: x.siblings || [], address: x.address || '', evangelist: '', scholarship: [], note: x.note || '', history: [{ year: YEAR, dept: x.fromDept, origDept: DEPTS[x.fromDept] || '', classId: x.fromClass || '', note: `${nextYear}년 진급` }], flags: [`${nextYear}년 ${DEPTS[x.fromDept]}에서 진급 — 반 배정 확인`], source: [`진급 ${nextYear}`] };
      await backend.set(`depts/${dd.id}/students/${sid}`, st); dd.students.push(st);
      const { _id, ...pd } = x; pd.received = true; pd.receivedAt = today(); await backend.set(`promotions/${_id}`, pd); x.received = true;
    }
    render(); toast(`${inc.length}명을 출석부에 받았습니다. 이전 부서에서는 연초 진급 처리 때 제적·졸업으로 바꿉니다.`);
  };
  document.querySelectorAll('[data-dept]').forEach(b => b.onclick = () => { S.sub.dept = b.dataset.dept; render(); });
  document.querySelectorAll('[data-show]').forEach(b => b.onclick = () => { S.sub.show = b.dataset.show; render(); });
  document.querySelectorAll('[data-sort]').forEach(b => b.onclick = () => { S.sub.sort = b.dataset.sort; render(); });
  document.querySelectorAll('[data-student]').forEach(tr => tr.onclick = () => {
    const s = dd.students.find(x => x.id === tr.dataset.student); openModal(studentCard(dd, s));
    const sv = $('#sc-save'); if (sv) sv.onclick = async () => {
      Object.assign(s, { name: $('#sc-name').value.trim(), classId: $('#sc-class').value, sex: $('#sc-sex').value, status: $('#sc-status').value, birth: $('#sc-birth').value, faith: $('#sc-faith').value, faithYear: +$('#sc-fyear').value || '', faithHalf: $('#sc-fhalf').value, school: $('#sc-school').value, phone: $('#sc-phone').value, guardianPhone: $('#sc-gphone').value, guardianRel: $('#sc-grel').value, father: $('#sc-father').value, mother: $('#sc-mother').value, address: $('#sc-address').value, note: $('#sc-note').value });
      await backend.set(`depts/${dd.id}/students/${s.id}`, s); closeModal(); render(); toast('저장했습니다'); };
    const cf = $('#sc-clear-flags'); if (cf) cf.onclick = async () => { s.flags = []; await backend.set(`depts/${dd.id}/students/${s.id}`, s); closeModal(); render(); };
    const dl = $('#sc-del'); if (dl) dl.onclick = () => { openModal(`<h2>삭제 확인<button class="btn s" id="modal-close">닫기</button></h2><p>${esc(s.name)} 학생을 출석부에서 완전히 삭제할까요? 출석 기록이 남아 있으면 "제적·졸업" 상태로 바꾸는 쪽을 권합니다.</p><div class="row"><button class="btn d" id="sc-del-yes">삭제</button><button class="btn" id="sc-del-no">취소</button></div>`); $('#sc-del-no').onclick = closeModal; $('#sc-del-yes').onclick = async () => { await backend.del(`depts/${dd.id}/students/${s.id}`); dd.students = dd.students.filter(x => x.id !== s.id); closeModal(); render(); }; };
  });
  const sa = $('#s-add'); if (sa) sa.onclick = async () => { const n = $('#s-name').value.trim(); if (!n) return; const s = { id: `${dd.id}_${n}_${$('#s-birth').value || uid()}`, name: n, classId: $('#s-class').value, sex: $('#s-sex').value, birth: $('#s-birth').value, phone: $('#s-p').value, guardianPhone: $('#s-gp').value, guardianRel: $('#s-grel').value, faithHalf: '', note: $('#s-n').value, status: 'active', dept: dd.id, faith: '', faithYear: '', school: '', father: '', mother: '', siblings: [], address: '', evangelist: '', scholarship: [], history: [], flags: [], source: ['앱 입력 ' + today()] }; await backend.set(`depts/${dd.id}/students/${s.id}`, s); dd.students.push(s); render(); toast(n + ' 추가'); };
  const ca = $('#c-add'); if (ca) ca.onclick = async () => { const n = $('#c-name').value.trim(); if (!n) return; dd.doc.classes.push({ id: n, name: n, teacher: $('#c-teacher').value.trim(), assistant: '', order: dd.doc.classes.length + 1, flags: [] }); await saveDeptDoc(dd.id); render(); };
  document.querySelectorAll('[data-edit-c]').forEach(b => b.onclick = () => { const c = dd.doc.classes.find(x => x.id === b.dataset.editC); openModal(`<h2>${esc(c.name)} 수정<button class="btn s" id="modal-close">닫기</button></h2><div class="fields"><label class="f"><span>표시 이름</span><input type="text" id="ce-name" value="${esc(c.name)}"></label><label class="f"><span>담임</span><input type="text" id="ce-teacher" value="${esc(c.teacher || '')}"></label><label class="f"><span>보조</span><input type="text" id="ce-assist" value="${esc(c.assistant || '')}"></label><label class="f"><span>순서</span><input type="number" id="ce-order" value="${c.order || 0}"></label></div><div class="row" style="margin-top:10px"><button class="btn p" id="ce-save">저장</button><button class="btn" id="ce-flags" ${c.flags && c.flags.length ? '' : 'disabled'}>확인 표시 지우기</button></div>`); $('#ce-save').onclick = async () => { c.name = $('#ce-name').value.trim() || c.name; c.teacher = $('#ce-teacher').value.trim(); c.assistant = $('#ce-assist').value.trim(); c.order = +$('#ce-order').value || 0; dd.doc.classes.sort((a,b) => (a.order||0)-(b.order||0)); await saveDeptDoc(dd.id); closeModal(); render(); }; $('#ce-flags').onclick = async () => { c.flags = []; await saveDeptDoc(dd.id); closeModal(); render(); }; });
  document.querySelectorAll('[data-del-c]').forEach(b => b.onclick = async () => { if (classStudents(dd, b.dataset.delC).length) { toast('학생이 있는 반은 삭제할 수 없습니다'); return; } dd.doc.classes = dd.doc.classes.filter(c => c.id !== b.dataset.delC); await saveDeptDoc(dd.id); render(); });
  const ta = $('#t-add'); if (ta) ta.onclick = async () => { const n = $('#t-name').value.trim(); if (!n) return; dd.doc.staff.push({ id: `${dd.id}_${n}`, name: n, role: $('#t-role').value.trim(), classId: '', phone: $('#t-phone').value.trim(), birth: '', faith: '', status: 'active', since: YEAR, moveNote: '', note: '', flags: [] }); await saveDeptDoc(dd.id); render(); };
  const vis = dd.doc.staff.filter(t => t.status !== 'left');
  document.querySelectorAll('[data-edit-t]').forEach(b => b.onclick = () => { const t = vis[+b.dataset.editT]; openModal(`<h2>${esc(t.name)} 수정<button class="btn s" id="modal-close">닫기</button></h2>${t.flags && t.flags.length ? `<div class="flags">${t.flags.map(esc).join('<br>')}</div>` : ''}<div class="fields" style="margin-top:8px"><label class="f"><span>이름</span><input type="text" id="te-name" value="${esc(t.name)}"></label><label class="f"><span>역할</span><input type="text" id="te-role" value="${esc(t.role)}"></label><label class="f"><span>반</span><input type="text" id="te-class" value="${esc(t.classId || '')}"></label><label class="f"><span>연락처</span><input type="tel" id="te-phone" value="${esc(t.phone || '')}"></label><label class="f" style="grid-column:span 2"><span>비고</span><input type="text" id="te-note" value="${esc(t.note || '')}"></label></div><div class="row" style="margin-top:10px"><button class="btn p" id="te-save">저장</button><button class="btn" id="te-left">퇴임 처리</button></div>`); $('#te-save').onclick = async () => { Object.assign(t, { name: $('#te-name').value.trim(), role: $('#te-role').value.trim(), classId: $('#te-class').value.trim(), phone: $('#te-phone').value.trim(), note: $('#te-note').value.trim(), flags: [] }); await saveDeptDoc(dd.id); closeModal(); render(); }; $('#te-left').onclick = async () => { t.status = 'left'; await saveDeptDoc(dd.id); closeModal(); render(); }; });
  document.querySelectorAll('[data-del-t]').forEach(b => b.onclick = async () => { const t = vis[+b.dataset.delT]; dd.doc.staff = dd.doc.staff.filter(x => x !== t); await saveDeptDoc(dd.id); render(); });
};

/* ───────────── 주일 보고서 ───────────── */
function blankReport(dd, date) { return { dept: dd.id, date, united: false, weekLabel: `${+date.slice(5,7)}월 ${weekIndex(date)}주`, type: `${dd.doc.name} 주일예배`, presider: '', prayer: '', text: '', title: '', preacher: '', notice: '', counts: {}, att: {}, attUnmatched: {}, absent: {}, newcomers: [], offering: { sunday: 0, tithe: 0, thanks: 0, other: 0 }, teachersPresent: [], teachersAbsent: {}, activity: '', meeting: '', special: '', schedule: [], classRows: [], writer: '', flags: [], status: 'draft', source: '앱 입력' }; }
async function saveReport(dd, r) { await backend.set(`depts/${dd.id}/reports/${r.date}`, r); dd.reports[r.date] = r; }
VIEWS.weekly = async () => {
  const dd = D();
  if (S.sub.preview) return reportPaper(dd, dd.reports[S.sub.preview], true);
  if (S.sub.date) { const r = dd.reports[S.sub.date] || blankReport(dd, S.sub.date); return editor(dd, r); }
  return reportList(dd);
};
function reportRow(dd, r, edit) {
  const s = reportStats(dd, r);
  return `<tr><td>${fmtK(r.date)}</td><td>${r.status === 'done' ? '<span class="pill ok">완료</span>' : '<span class="pill warn">작성 중</span>'}${isUnited(r) ? ' <span class="pill info">세대통합</span>' : ''}${r.imported ? ' <span class="pill mute" title="HWP에서 변환">변환</span>' : ''}${r.flags && r.flags.length ? ' <span class="tag flag" title="' + esc(r.flags.join(' / ')) + '">!</span>' : ''}</td><td class="n">${s.p} / ${s.total}</td><td class="n">${s.rate}%</td><td class="n">${won(s.offSum)}</td><td class="note" style="max-width:260px;overflow:hidden;text-overflow:ellipsis" title="${esc(r.text)} ${esc(r.title)}">${esc(r.text)} ${esc(r.title)}</td><td>${edit ? `<button class="btn s" data-edit="${r.date}">열기</button> ` : ''}<button class="btn s" data-prev="${r.date}">보기</button></td></tr>`;
}
function reportTable(dd, rows, edit) {
  return `<div class="tw"><table class="rtab"><thead><tr><th>날짜</th><th>상태</th><th class="n">출석/재적</th><th class="n">출석률</th><th class="n">헌금</th><th>설교</th><th></th></tr></thead><tbody>${rows.map(r => reportRow(dd, r, edit)).join('') || '<tr><td colspan="7" class="note">보고서가 없습니다.</td></tr>'}</tbody></table></div>`;
}
function reportList(dd, opts = {}) {
  const list = Object.values(dd.reports).sort((a, b) => a.date < b.date ? 1 : -1);
  const edit = canEdit() && !isCommittee();
  const cut = new Date(); cut.setDate(cut.getDate() - 35); const cutoff = `${cut.getFullYear()}-${pad2(cut.getMonth()+1)}-${pad2(cut.getDate())}`;
  const recent = list.filter(r => r.date >= cutoff), older = list.filter(r => r.date < cutoff);
  const latest = list.find(r => r.status === 'done') || list[0];
  const pick = S.sub.pick || lastSunday(); const cur = dd.reports[pick];
  const status = !cur ? '<span class="pill warn">미작성</span>' : cur.status === 'done' ? '<span class="pill ok">작성 완료</span>' : '<span class="pill warn">작성 중</span>';
  const writePanel = edit ? `<div class="card write"><div class="row" style="justify-content:space-between"><div><div class="wt">주일 보고서 작성</div><div class="note">날짜를 고르고 작성을 누르세요. 출석은 이름을 누르기만 하면 됩니다.</div></div>
      <div class="row"><input type="date" id="w-date" value="${pick}" style="width:auto">${status}<button class="btn p big" id="w-new">${!cur ? '작성 시작' : cur.status === 'done' ? '열어서 수정' : '이어서 작성'}</button>${cur ? `<button class="btn" data-prev="${pick}">보기</button>` : ''}</div></div></div>` : '';
  const months = {}; older.forEach(r => { (months[ym(r.date)] = months[ym(r.date)] || []).push(r); });
  const olderHTML = Object.keys(months).sort().reverse().map(m => `<details class="card fold"><summary>${m.replace('-', '년 ')}월 <span class="note">${months[m].length}장</span></summary>${reportTable(dd, months[m], edit)}</details>`).join('');
  return `<div class="topbar"><div><h1>주일 보고서${opts.title || ''}</h1><div class="sub">${edit ? '최근 한 달이 펼쳐져 있고, 그 전은 달별로 접혀 있습니다' : '열람 전용 · 작성·수정은 PC에서'}</div></div></div>
  ${opts.pick || ''}
  ${writePanel}
  <div class="recent">
    ${latest ? `<div class="card thumbcard"><h2>직전 보고서 <span class="r">${fmtK(latest.date)}</span></h2><div class="thumb" data-prev="${latest.date}" title="눌러서 크게 보기"><div class="thumb-inner">${reportPaper(dd, latest, false)}</div></div></div>` : ''}
    <div class="card"><h2>최근 한 달 <span class="r">${recent.length}장</span></h2>${reportTable(dd, recent, edit)}</div>
  </div>
  ${olderHTML ? `<div class="stack" style="margin-top:14px">${olderHTML}</div>` : ''}`;
}
function attSection(dd, r, mobileOnly) {
  const s = reportStats(dd, r);
  const unmatched = Object.keys(r.attUnmatched || {});
  return `<div class="card"><h2>${mobileOnly ? '출석 체크' : '2. 출석 체크'} <span class="r">한 번 누르면 출석, 두 번 누르면 온라인·본당, 세 번 누르면 결석</span></h2>
      <div class="tiles" style="margin-bottom:12px"><div class="tile"><div class="v">${s.p}</div><div class="l">출석 / 재적 ${s.total}</div></div><div class="tile"><div class="v">${s.m} · ${s.f}</div><div class="l">남 · 여</div></div><div class="tile"><div class="v">${s.site} + ${s.on}</div><div class="l">현장 + 온라인·본당</div></div><div class="tile"><div class="v">${s.rate}%</div><div class="l">출석률 <span class="tag">자동</span></div></div></div>
      ${dd.doc.classes.map(c => { const st = classStudents(dd, c.id); return `<div class="cls"><h3>${esc(c.name)} <span>${esc(c.teacher || '')} · ${st.filter(x => r.att[x.id]).length}/${st.length}</span></h3><div class="att">
        ${st.map(x => { const a = r.att[x.id] || ''; return `<div class="s ${a === 'P' ? 'p' : a === 'O' ? 'o' : ''}"><button data-att="${x.id}">${esc(x.name)}</button>${a ? `<span class="m">${a === 'P' ? '출석' : '온라인·본당'}</span>` : ''}</div>`; }).join('') || '<div class="note">학생 없음</div>'}
      </div></div>`; }).join('')}
      ${(() => { const st = activeStudents(dd).filter(x => !dd.doc.classes.some(c => c.id === x.classId)); return st.length ? `<div class="cls"><h3>반 미배정</h3><div class="att">${st.map(x => { const a = r.att[x.id] || ''; return `<div class="s ${a === 'P' ? 'p' : a === 'O' ? 'o' : ''}"><button data-att="${x.id}">${esc(x.name)}</button>${a ? `<span class="m">${a === 'P' ? '출석' : '온라인·본당'}</span>` : ''}</div>`; }).join('')}</div></div>` : ''; })()}
      ${unmatched.length ? `<div class="hint" style="margin-top:6px">출석부에 없는 출석자(변환 자료): ${unmatched.map(esc).join(', ')}</div>` : ''}
      <h3 style="font-size:13px;margin:8px 0 6px">결석자 사유 <span class="tag">결석자는 자동 나열</span></h3>
      <div class="list">${activeStudents(dd).filter(x => !r.att[x.id]).map(x => `<div class="item"><div class="t">${esc(x.name)} <span class="note">${esc((classOf(dd, x) || {}).name || '')}</span></div><input type="text" data-abs="${x.id}" value="${esc(r.absent[x.id] || '')}" placeholder="사유" style="max-width:320px"></div>`).join('') || '<div class="note">전원 출석</div>'}</div>
    </div>`;
}
function editor(dd, r) {
  const s = reportStats(dd, r);
  const ev = allEvents(dd).filter(e => ym(e.date) === ym(r.date));
  const tp = new Set(r.teachersPresent || []);
  return `<div class="topbar"><div><h1>${fmtK(r.date)} 주일 보고서</h1><div class="sub">${esc(dd.doc.name)} · ${+r.date.slice(5,7)}월 ${weekIndex(r.date)}주${r.imported ? ' · HWP에서 변환된 자료' : ''}</div></div><div class="row"><button class="btn" id="w-back">목록</button><button class="btn" id="w-save">임시 저장</button><button class="btn p" id="w-done">작성 완료</button></div></div>
  ${r.flags && r.flags.length ? `<div class="flags" style="margin-bottom:12px">확인 필요: ${r.flags.map(esc).join(' / ')} <button class="btn s" id="w-clear-flags">확인했음</button></div>` : ''}
  <div class="stack">
    <div class="card"><h2>1. 예배 현황</h2><div class="fields">
      <label class="f"><span>예배 종류</span><input type="text" id="r-type" value="${esc(r.type)}"></label>
      <label class="f"><span>세대통합예배</span><label class="row" style="padding:7px 0;font-size:13px;color:var(--fg)"><input type="checkbox" id="r-united" ${isUnited(r) ? 'checked' : ''}> 본당 세대통합예배로 드림</label></label>
      <label class="f"><span>사회자</span><input type="text" id="r-presider" value="${esc(r.presider)}"></label>
      <label class="f"><span>대표기도</span><input type="text" id="r-prayer" value="${esc(r.prayer)}"></label>
      <label class="f"><span>설교 본문</span><input type="text" id="r-text" value="${esc(r.text)}"></label>
      <label class="f"><span>설교 제목</span><input type="text" id="r-title" value="${esc(r.title)}"></label>
      <label class="f"><span>설교자</span><input type="text" id="r-preacher" value="${esc(r.preacher)}"></label>
      <label class="f"><span>광고 (선택)</span><input type="text" id="r-notice" value="${esc(r.notice)}"></label>
      <label class="f"><span>작성자</span><input type="text" id="r-writer" value="${esc(r.writer || '')}"></label>
    </div></div>
    ${attSection(dd, r)}
    <div class="grid2">
      <div class="card"><h2>3. 새친구 (방문 제외)</h2><div class="list">${(r.newcomers || []).map((n, i) => `<div class="item"><div><div class="t">${esc(n.name)}</div><div class="d">${esc(n.school || '')} · 인도자 ${esc(n.by || '')}${n.note ? ' · ' + esc(n.note) : ''}</div></div><button class="btn s d" data-del-nc="${i}">삭제</button></div>`).join('')}</div>
        <div class="fields" style="margin-top:8px"><label class="f"><span>이름</span><input type="text" id="nc-name"></label><label class="f"><span>학교·학년</span><input type="text" id="nc-school"></label><label class="f"><span>인도자</span><input type="text" id="nc-by"></label><label class="f"><span>${esc(dd.doc.classLabel)}</span><select id="nc-class">${dd.doc.classes.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label></div>
        <div class="row" style="margin-top:8px"><button class="btn" id="nc-add">등록 → 출석부에 추가</button></div></div>
      <div class="card"><h2>4. 헌금 <span class="r">합계 <span class="tag">자동</span> ${won(s.offSum)}원</span></h2><div class="fields">
        <label class="f"><span>주일헌금</span><input type="number" id="o-sunday" value="${r.offering.sunday || ''}"></label>
        <label class="f"><span>십일조</span><input type="number" id="o-tithe" value="${r.offering.tithe || ''}"></label>
        <label class="f"><span>감사헌금</span><input type="number" id="o-thanks" value="${r.offering.thanks || ''}"></label>
        <label class="f"><span>기타·특별</span><input type="number" id="o-other" value="${r.offering.other || ''}"></label>
      </div>${r.offering.raw ? `<div class="note" style="margin-top:6px">원문: ${esc(r.offering.raw)}</div>` : ''}</div>
    </div>
    <div class="card"><h2>5. 교사 출결 <span class="r">출석 ${tp.size}명 · 결석 ${Object.keys(r.teachersAbsent || {}).length}명</span></h2>
      <div class="att">${dd.doc.staff.filter(t => t.status !== 'left').map(t => `<div class="s ${tp.has(t.name) ? 'p' : ''}"><button data-tatt="${esc(t.name)}">${esc(t.name)} <span class="note">${esc(t.role)}</span></button></div>`).join('')}</div>
      <div class="list" style="margin-top:8px">${dd.doc.staff.filter(t => t.status !== 'left' && !tp.has(t.name)).map(t => `<div class="item"><div class="t">${esc(t.name)}</div><input type="text" data-tabs="${esc(t.name)}" value="${esc((r.teachersAbsent || {})[t.name] || '')}" placeholder="결석 사유 (비우면 결석자 명단에서 제외)" style="max-width:360px"></div>`).join('')}</div></div>
    <div class="card"><h2>6. 예배·활동 및 회의 내용</h2><div class="stack">
      <label class="f"><span>1) 예배 및 활동</span><textarea id="r-activity">${esc(r.activity)}</textarea></label>
      <label class="f"><span>2) 주간 회의·월례회·기타</span><textarea id="r-meeting">${esc(r.meeting)}</textarea></label>
      <label class="f"><span>3) 특이사항</span><textarea id="r-special">${esc(r.special)}</textarea></label>
    </div></div>
    <div class="card"><h2>7. 이달 일정 <span class="tag">연간 계획과 공통 일정에서 자동</span></h2><div class="list">${ev.map(e => `<div class="item"><div class="t">${e.date.slice(5).replace('-','/')} ${esc(e.title)}</div>${e.c ? '<span class="pill mute">교육위원회</span>' : ''}</div>`).join('') || '<div class="note">이달 일정이 없습니다. 연간 계획에서 추가하세요.</div>'}${(r.schedule || []).length ? `<div class="note" style="margin-top:6px">보고서 원문 일정: ${r.schedule.map(x => esc((x.date || '').slice(5) + ' ' + x.title)).join(' · ')}</div>` : ''}</div></div>
  </div>`;
}
function collect(dd, r) {
  ['type','presider','prayer','text','title','preacher','notice','activity','meeting','special','writer'].forEach(k => { const el = $('#r-' + k); if (el) r[k] = el.value; });
  const un = $('#r-united'); if (un) r.united = un.checked;
  const o = k => { const el = $('#o-' + k); return el ? (+el.value || 0) : (r.offering[k] || 0); };
  r.offering = { ...r.offering, sunday: o('sunday'), tithe: o('tithe'), thanks: o('thanks'), other: o('other') };
  document.querySelectorAll('[data-abs]').forEach(i => { if (i.value.trim()) r.absent[i.dataset.abs] = i.value.trim(); else delete r.absent[i.dataset.abs]; });
  r.teachersAbsent = r.teachersAbsent || {};
  document.querySelectorAll('[data-tabs]').forEach(i => { if (i.value.trim()) r.teachersAbsent[i.dataset.tabs] = i.value.trim(); else delete r.teachersAbsent[i.dataset.tabs]; });
}
function bindAttButtons(dd, r, keep) {
  document.querySelectorAll('[data-att]').forEach(b => b.onclick = async () => { keep(); const id = b.dataset.att; const a = r.att[id]; if (!a) r.att[id] = 'P'; else if (a === 'P') r.att[id] = 'O'; else delete r.att[id]; if (r.att[id]) delete r.absent[id]; await saveReport(dd, r); render(); });
}
BIND.weekly = () => {
  const dd = D();
  if (S.sub.preview) { bindPaper(); return; }
  if (!S.sub.date) { const n = $('#w-new'); if (n) n.onclick = () => { const dt = $('#w-date').value; if (!dt) return; S.sub = { date: dt }; render(); }; const wd = $('#w-date'); if (wd) wd.onchange = e => { S.sub.pick = e.target.value; render(); }; document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { S.sub = { date: b.dataset.edit }; render(); }); document.querySelectorAll('[data-prev]').forEach(b => b.onclick = () => { S.sub = { preview: b.dataset.prev }; render(); }); return; }
  const r = dd.reports[S.sub.date] || blankReport(dd, S.sub.date); dd.reports[S.sub.date] = r;
  const keep = () => collect(dd, r);
  $('#w-back').onclick = async () => { keep(); await saveReport(dd, r); S.sub = {}; render(); };
  $('#w-save').onclick = async () => { keep(); await saveReport(dd, r); toast('임시 저장했습니다'); };
  $('#w-done').onclick = async () => { keep(); r.status = 'done'; await saveReport(dd, r); S.sub = { preview: r.date }; render(); toast('작성 완료 — 미리보기에서 PDF로 저장하세요'); };
  const cf = $('#w-clear-flags'); if (cf) cf.onclick = async () => { keep(); r.flags = []; await saveReport(dd, r); render(); };
  bindAttButtons(dd, r, keep);
  document.querySelectorAll('[data-tatt]').forEach(b => b.onclick = async () => { keep(); const n = b.dataset.tatt; r.teachersPresent = r.teachersPresent || []; if (r.teachersPresent.includes(n)) r.teachersPresent = r.teachersPresent.filter(x => x !== n); else { r.teachersPresent.push(n); delete r.teachersAbsent[n]; } await saveReport(dd, r); render(); });
  $('#nc-add').onclick = async () => { const n = $('#nc-name').value.trim(); if (!n) return; keep(); const sid = `${dd.id}_${n}_${uid()}`; const st = { id: sid, name: n, classId: $('#nc-class').value, sex: '남', birth: '', phone: '', guardianPhone: '', note: '새친구 ' + r.date, status: 'newcomer', dept: dd.id, faith: '', school: '', father: '', mother: '', siblings: [], address: '', evangelist: $('#nc-by').value, scholarship: [], history: [], flags: ['새친구 등록 — 재적 전환 여부와 성별·생년월일 확인'], source: ['주일 보고서 ' + r.date] }; await backend.set(`depts/${dd.id}/students/${sid}`, st); dd.students.push(st); r.newcomers = r.newcomers || []; r.newcomers.push({ name: n, school: $('#nc-school').value, by: $('#nc-by').value, sid }); r.att[sid] = 'P'; await saveReport(dd, r); render(); toast(n + ' 등록 — 출석부(새친구)에 추가'); };
  document.querySelectorAll('[data-del-nc]').forEach(b => b.onclick = async () => { keep(); const n = r.newcomers.splice(+b.dataset.delNc, 1)[0]; if (n && n.sid) { await backend.del(`depts/${dd.id}/students/${n.sid}`); dd.students = dd.students.filter(s => s.id !== n.sid); delete r.att[n.sid]; } await saveReport(dd, r); render(); });
};
/* 모바일: 출석 체크 전용 */
VIEWS.attend = async () => {
  const dd = D(); const date = S.sub.date || lastSunday(); const r = dd.reports[date] || blankReport(dd, date); dd.reports[date] = r;
  return `<div class="topbar"><div><h1>출석 체크</h1><div class="sub">${fmtK(date)} · 체크는 바로 저장됩니다</div></div><div class="row"><input type="date" id="a-date" value="${date}" style="width:auto"></div></div>
  <div class="stack">${attSection(dd, r, true).replace('edit-only', '')}<div class="row"><button class="btn p" id="a-save">결석 사유 저장</button><span class="note">나머지 항목(설교·헌금·회의 내용)은 PC에서 작성합니다.</span></div></div>`;
};
BIND.attend = () => {
  const dd = D(); const date = S.sub.date || lastSunday(); const r = dd.reports[date];
  $('#a-date').onchange = e => { S.sub.date = e.target.value; render(); };
  const keep = () => { document.querySelectorAll('[data-abs]').forEach(i => { if (i.value.trim()) r.absent[i.dataset.abs] = i.value.trim(); else delete r.absent[i.dataset.abs]; }); };
  bindAttButtons(dd, r, keep);
  $('#a-save').onclick = async () => { keep(); await saveReport(dd, r); toast('저장했습니다'); };
};
/* 열람 전용 보고서 목록 (모바일 부서 / 교육위원회) */
VIEWS.reports = async () => {
  let dd;
  if (isCommittee()) { const d = S.sub.dept || 'kinder'; dd = await loadDept(d); } else dd = D();
  if (S.sub.preview) return reportPaper(dd, dd.reports[S.sub.preview], true);
  const pick = isCommittee() ? `<div class="row" style="margin-bottom:10px">${Object.entries(DEPTS).map(([k,v]) => `<button class="btn ${dd.id === k ? 'p' : ''}" data-dept="${k}">${v}</button>`).join('')}</div>` : '';
  return reportList(dd, { title: ' — ' + esc(dd.doc.name), pick });
};
BIND.reports = () => { if (S.sub.preview) { bindPaper(); return; } document.querySelectorAll('[data-dept]').forEach(b => b.onclick = () => { S.sub = { dept: b.dataset.dept }; render(); }); document.querySelectorAll('[data-prev]').forEach(b => b.onclick = () => { S.sub.preview = b.dataset.prev; render(); }); };
function bindPaper() { const b = $('#p-back'); if (b) b.onclick = () => { delete S.sub.preview; render(); }; const p = $('#p-print'); if (p) p.onclick = () => window.print(); const e = $('#p-edit'); if (e) e.onclick = () => { S.view = 'weekly'; S.sub = { date: S.sub.preview }; render(); }; }

/* 보고서 종이 */
function reportPaper(dd, r, withBar) {
  if (!r) return `<div class="hint">보고서가 없습니다.</div>`;
  const s = reportStats(dd, r);
  const ev = allEvents(dd).filter(e => ym(e.date) === ym(r.date));
  const head = dd.doc.staff.find(t => t.status !== 'left' && /부장|회장/.test(t.role)); const sec = dd.doc.staff.find(t => t.status !== 'left' && /총무|서기/.test(t.role));
  const hasNames = Object.keys(r.att || {}).length > 0;
  const classRows = hasNames ? dd.doc.classes.map(c => { const st = classStudents(dd, c.id); const pr = st.filter(x => r.att[x.id]); const ab = st.filter(x => !r.att[x.id]); return `<tr><td>${esc(c.name)}</td><td>${esc(c.teacher || '')}</td><td>${pr.map(x => esc(x.name) + (r.att[x.id] === 'O' ? '(온라인·본당)' : '')).join(', ')}</td><td class="n">${st.length}</td><td class="n">${pr.length}</td><td>${ab.map(x => esc(x.name) + (r.absent[x.id] ? `(${esc(r.absent[x.id])})` : '')).join(', ')}</td></tr>`; }).join('')
    : (r.classRows || []).map(c => `<tr><td>${esc(c.classId)}</td><td>${esc(c.teacher || '')}</td><td>${(c.present || []).map(esc).join(', ')}</td><td class="n">${c.reg ?? ''}</td><td class="n">${c.att ?? ''}</td><td>${Object.entries(r.absent || {}).filter(([k]) => true).length ? '' : ''}</td></tr>`).join('');
  const tA = r.teachersPresent || [], tB = Object.entries(r.teachersAbsent || {});
  const unmatched = Object.keys(r.attUnmatched || {});
  const absentUnmatched = Object.entries(r.absentUnmatched || {});
  return `${withBar ? `<div class="topbar no-print"><div><h1>보고서 보기</h1><div class="sub">${canEdit() ? 'PDF로 저장 → 인쇄해 부장에게 보고' : '열람 전용'}</div></div><div class="row"><button class="btn" id="p-back">목록</button>${canEdit() && !isCommittee() ? '<button class="btn" id="p-edit">수정</button>' : ''}${canEdit() ? '<button class="btn p" id="p-print">PDF로 저장 / 인쇄</button>' : ''}</div></div>` : ''}
  <section class="paper">
    <div class="hd"><div><h1>${esc(dd.doc.name)} 주일 보고서${isUnited(r) ? ' <span style="font-size:13px;color:#8a1f2b">(세대통합예배)</span>' : ''}</h1><div class="sub">중앙성서교회 교육위원회 · 주일 보고${isUnited(r) ? ' · 본당 세대통합예배로 드림' : ''}</div></div><div class="meta">${fmtK(r.date)} · ${+r.date.slice(5,7)}월 ${weekIndex(r.date)}주<br>작성 ${esc(r.writer || (sec ? sec.name : ''))} · 부장 확인 ${esc(head ? head.name : '')} (서명)</div></div>
    <h2>1. 예배 현황</h2><table class="kv"><tbody><tr><th>사회자</th><td>${esc(r.presider)}</td><th>대표기도</th><td>${esc(r.prayer)}</td><th>광고</th><td>${esc(r.notice)}</td></tr><tr><th>설교 본문</th><td>${esc(r.text)}</td><th>설교 제목</th><td colspan="3">${esc(r.title)}</td></tr><tr><th>설교자</th><td>${esc(r.preacher)}</td><th>예배 종류</th><td colspan="3">${esc(r.type)}</td></tr></tbody></table>
    <h2>2. 출석 현황</h2><div class="tw"><table><thead><tr><th></th><th class="n">남</th><th class="n">여</th><th class="n">합계</th><th class="n">현장</th><th class="n">온라인·본당</th><th class="n">출석률</th></tr></thead><tbody><tr><th>재적</th><td class="n">${s.rm}</td><td class="n">${s.rf}</td><td class="n">${s.total}</td><td class="n">—</td><td class="n">—</td><td class="n">—</td></tr><tr><th>출석</th><td class="n">${s.m}</td><td class="n">${s.f}</td><td class="n">${s.p}</td><td class="n">${s.site}</td><td class="n">${s.on}</td><td class="n" style="color:#8a1f2b;font-weight:500">${s.rate}%</td></tr></tbody></table></div>
    ${r.counts && r.counts.attRaw ? `<div class="merge">원문 표기: ${esc(r.counts.attRaw)}</div>` : ''}
    <div class="grid2"><div><h2>3. 새친구 (방문 제외)</h2><table><thead><tr><th>이름</th><th>학교·학년</th><th>인도자</th></tr></thead><tbody>${(r.newcomers || []).map(n => `<tr><td>${esc(n.name)}</td><td>${esc(n.school || '')}</td><td>${esc(n.by || '')}</td></tr>`).join('') || '<tr><td>—</td><td>—</td><td>—</td></tr>'}</tbody></table></div>
    <div><h2>4. 헌금 집계</h2><table><tbody><tr><th>주일헌금</th><td class="n">${won(r.offering.sunday)}</td><th>십일조</th><td class="n">${won(r.offering.tithe)}</td></tr><tr><th>감사헌금</th><td class="n">${won(r.offering.thanks)}</td><th>기타·특별</th><td class="n">${won(r.offering.other)}</td></tr><tr class="sum"><td colspan="3">합계 (원)</td><td class="n">${won(s.offSum)}</td></tr></tbody></table></div></div>
    <h2>5. 교사 출결</h2><table><tbody><tr><th style="width:14%">출석 (${tA.length || r.teachersPresentCount || 0}명)</th><td>${tA.map(esc).join(', ') || (r.teachersPresentCount ? `${r.teachersPresentCount}명` : '—')}</td></tr><tr><th>결석 (${tB.length}명)</th><td>${tB.map(([n, why]) => esc(n) + (why ? ` (${esc(why)})` : '')).join(', ') || '—'}</td></tr></tbody></table>
    <h2>6. 예배·활동 및 회의 내용</h2><div class="lines"><p>1) 예배 및 활동: ${esc(r.activity) || '—'}</p><p>2) 주간 회의·월례회·기타: ${esc(r.meeting) || '—'}</p><p>3) 특이사항: ${esc(r.special) || '—'}</p></div>
    <h2>7. ${esc(dd.doc.classLabel)}별 출석</h2><div class="tw"><table><thead><tr><th>${esc(dd.doc.classLabel)}</th><th>담임</th><th>금주 출석</th><th class="n">재적</th><th class="n">출석</th><th>결석자 (사유)</th></tr></thead><tbody>${classRows || '<tr><td colspan="6">—</td></tr>'}</tbody></table></div>
    ${unmatched.length || absentUnmatched.length ? `<div class="merge">출석부 외: ${unmatched.map(esc).join(', ')}${absentUnmatched.length ? ' · 결석: ' + absentUnmatched.map(([n, w]) => esc(n) + (w ? `(${esc(w)})` : '')).join(', ') : ''}</div>` : ''}
    ${ev.length ? `<h2>8. 이달 일정</h2><table><tbody>${ev.map(e => `<tr><th style="width:14%">${e.date.slice(5).replace('-','/')}</th><td>${esc(e.title)}${e.c ? ' (교육위원회 공통)' : ''}</td></tr>`).join('')}</tbody></table>` : ''}
    ${dd.doc.notes && dd.doc.notes.merge ? `<div class="merge">※ ${esc(dd.doc.notes.merge)}</div>` : ''}
    <div class="ft"><b>중앙성서교회 교육위원회</b><span>CBCS에서 생성 · ${esc(dd.doc.name)}-${r.date}.pdf${r.imported ? ' · HWP 변환' : ''}</span></div>
  </section>`;
}

/* ───────────── 회계 ───────────── */
const CATS = ['예배·전도','양육','교제','행사','간식','교사','비품','선물','수련회','기타'];
VIEWS.ledger = async () => {
  const dd = D(); const m = S.sub.month || today().slice(0, 7); const lid = S.sub.ledger || (dd.doc.ledgers[0] || {}).id; const L = dd.doc.ledgers.find(l => l.id === lid);
  if (S.sub.voucherView) { const e = dd.expenses.find(x => x.id === S.sub.voucherView); return `<div class="topbar no-print"><div><h1>지출결의서</h1><div class="sub">인쇄해 결재를 받고 영수증을 붙여 제출합니다</div></div><div class="row"><button class="btn" id="v-back">회계로</button><button class="btn" id="v-edit">수정</button><button class="btn p" id="v-print">PDF로 저장 / 인쇄</button></div></div>${voucherPaper(dd, e)}`; }
  if (S.sub.voucherEdit) { const e = S.sub.voucherEdit === 'new' ? { ledgerId: lid, category: '간식', date: today(), receipt: true } : dd.expenses.find(x => x.id === S.sub.voucherEdit); return `<div class="topbar"><div><h1>${S.sub.voucherEdit === 'new' ? '지출결의서 작성' : '지출결의서 수정'}</h1><div class="sub">저장하면 회계 장부에 지출로 기록되고, 결의서를 바로 출력할 수 있습니다</div></div><div class="row"><button class="btn" id="v-cancel">취소</button><button class="btn p" id="v-save">저장하고 결의서 보기</button></div></div><div class="card">${voucherForm(dd, e)}</div>`; }
  if (!L) return `<div class="topbar"><div><h1>회계</h1></div></div><div class="card">장부가 없습니다. <div class="row" style="margin-top:8px"><input type="text" id="l-new" placeholder="장부 이름 (예: 정규 예산)" style="width:240px"><input type="number" id="l-new-budget" placeholder="연간 예산" style="width:140px"><button class="btn" id="l-add">장부 만들기</button></div></div>`;
  const sm = ledgerSummary(dd, lid, m);
  const ex = dd.expenses.filter(e => e.ledgerId === lid && (ym(e.date) === m || (S.sub.all && true))).sort((a,b) => (a.date || '') < (b.date || '') ? -1 : 1), inc = dd.incomes.filter(e => e.ledgerId === lid && (ym(e.date) === m || S.sub.all));
  const noDate = dd.expenses.filter(e => e.ledgerId === lid && !e.date);
  return `<div class="topbar"><div><h1>회계</h1><div class="sub">지출을 한 건씩 적으면 월 합계·누계·잔액·집행률이 계산됩니다</div></div><button class="btn p edit-only" id="v-new">지출결의서 작성</button></div>
  <div class="row" style="margin-bottom:12px">${dd.doc.ledgers.map(l => `<button class="btn ${l.id === lid ? 'p' : ''}" data-ledger="${esc(l.id)}">${esc(l.name)}</button>`).join('')}</div>
  <div class="stack">
    <div class="row">${monthNav(m)}<button class="btn s" id="l-all">${S.sub.all ? '이달만 보기' : '전체 보기'}</button></div>
    ${L.note ? `<div class="note">${esc(L.note)}</div>` : ''}
    <div class="tiles">
      ${L.kind === 'budget' && L.budget ? `<div class="tile"><div class="v">${won(L.budget)}</div><div class="l">연간 예산</div></div><div class="tile"><div class="v">${won(sm.prevEx)}</div><div class="l">전월 누계 지출</div></div><div class="tile"><div class="v">${won(sm.monEx)}</div><div class="l">${+m.slice(5)}월 지출</div></div><div class="tile"><div class="v">${won(sm.remain)}</div><div class="l">예산 잔액</div></div><div class="tile"><div class="v" style="color:var(--accent)">${sm.rate}%</div><div class="l">집행률 <span class="tag">자동</span><div class="bar" style="margin-top:4px"><i style="width:${Math.min(100, sm.rate)}%"></i></div></div></div>`
      : `<div class="tile"><div class="v">${won(sm.carryIn)}</div><div class="l">전월 이월</div></div><div class="tile"><div class="v">${won(sm.monIn)}</div><div class="l">${+m.slice(5)}월 수입</div></div><div class="tile"><div class="v">${won(sm.monEx)}</div><div class="l">${+m.slice(5)}월 지출</div></div><div class="tile"><div class="v">${won(sm.balance)}</div><div class="l">잔액 <span class="tag">자동</span></div></div><div class="tile"><div class="v">${won((L.carry||0) + sm.totalIn - sm.totalEx)}</div><div class="l">현재 잔액(전체)</div></div>`}
    </div>
    ${noDate.length ? `<div class="hint">날짜가 없는 지출 ${noDate.length}건(합계 ${won(sm.noDateEx)}원)은 월별 집계에서 빠져 있습니다. "전체 보기"에서 날짜를 넣어 주세요.</div>` : ''}
    <div class="card"><h2>${S.sub.all ? '전체' : +m.slice(5) + '월'} 지출 내역 <span class="r">${esc(L.name)} · ${ex.length}건</span></h2><div class="tw"><table><thead><tr><th>날짜</th><th>항목</th><th>세부 내역</th><th class="n">금액</th><th>청구</th><th class="c">영수증</th><th></th></tr></thead><tbody>
      ${ex.map(e => `<tr><td>${e.date ? e.date.slice(2) : '<span class="pill warn">날짜 없음</span>'}</td><td>${esc(e.category)}</td><td class="wrap">${esc(e.desc)}${e.note ? ` <span class="note">(${esc(e.note)})</span>` : ''}${e.flags && e.flags.length ? ` <span class="tag flag" title="${esc(e.flags.join(' / '))}">!</span>` : ''}</td><td class="n">${won(e.amount)}</td><td class="note">${esc(e.requester || '')}</td><td class="c">${e.receipt ? '○' : '—'}</td><td style="white-space:nowrap"><button class="btn s" data-voucher="${e.id}" title="지출결의서">결의서</button> <button class="btn s edit-only" data-edit-e="${e.id}">수정</button> <button class="btn s d edit-only" data-del-e="${e.id}">삭제</button></td></tr>`).join('') || '<tr><td colspan="7" class="note">지출이 없습니다.</td></tr>'}
      <tr class="sum"><td colspan="3">합계</td><td class="n">${won(ex.reduce((a, e) => a + (+e.amount || 0), 0))}</td><td colspan="3"></td></tr></tbody></table></div>
      <div class="fields edit-only" style="margin-top:12px"><label class="f"><span>날짜</span><input type="date" id="e-date" value="${today()}"></label><label class="f"><span>항목</span><select id="e-cat">${CATS.map(c => `<option>${c}</option>`).join('')}</select></label><label class="f" style="grid-column:span 2"><span>세부 내역</span><input type="text" id="e-desc" placeholder="예: 10월 생일 축하 케이크·선물 (4명)"></label><label class="f"><span>금액</span><input type="number" id="e-amt"></label><label class="f"><span>청구인</span><input type="text" id="e-req"></label><label class="f"><span>영수증</span><select id="e-rc"><option value="1">있음</option><option value="0">없음</option></select></label></div>
      <div class="row edit-only" style="margin-top:8px"><button class="btn p" id="e-add">지출 추가</button></div></div>
    <div class="card"><h2>${S.sub.all ? '전체' : +m.slice(5) + '월'} 수입 (찬조·회비·후원) <span class="r">${inc.length}건</span></h2><div class="tw"><table><thead><tr><th>날짜</th><th>내역</th><th class="n">금액</th><th></th></tr></thead><tbody>${inc.map(e => `<tr><td>${e.date ? e.date.slice(2) : '<span class="pill warn">날짜 없음</span>'}</td><td class="wrap">${esc(e.desc)}${e.note ? ` <span class="note">(${esc(e.note)})</span>` : ''}</td><td class="n">${won(e.amount)}</td><td><button class="btn s d edit-only" data-del-i="${e.id}">삭제</button></td></tr>`).join('') || '<tr><td colspan="4" class="note">수입이 없습니다.</td></tr>'}</tbody></table></div>
      <div class="row edit-only" style="margin-top:10px"><input type="date" id="i-date" value="${today()}" style="width:auto"><input type="text" id="i-desc" placeholder="내역" style="flex:1"><input type="number" id="i-amt" placeholder="금액" style="width:140px"><button class="btn" id="i-add">수입 추가</button></div></div>
    <div class="card edit-only"><h2>장부 설정</h2><div class="row"><label class="f" style="flex:1"><span>장부 이름</span><input type="text" id="l-name" value="${esc(L.name)}"></label><label class="f" style="flex:1"><span>종류</span><select id="l-kind"><option value="budget" ${L.kind === 'budget' ? 'selected' : ''}>연간 예산형 (집행률)</option><option value="balance" ${L.kind !== 'budget' ? 'selected' : ''}>잔액형 (찬조금·수련회·현금)</option></select></label><label class="f" style="flex:1"><span>연간 예산</span><input type="number" id="l-budget" value="${L.budget || 0}"></label><label class="f" style="flex:1"><span>연초 이월액</span><input type="number" id="l-carry" value="${L.carry || 0}"></label><button class="btn" id="l-save" style="align-self:flex-end">저장</button></div>
      <div class="row" style="margin-top:10px"><input type="text" id="l-new" placeholder="새 장부 (예: 여름수련회)" style="flex:1"><input type="number" id="l-new-budget" placeholder="연간 예산(0=잔액형)" style="width:160px"><button class="btn" id="l-add">장부 추가</button></div></div>
  </div>`;
};
BIND.ledger = () => {
  const dd = D(); const lid = S.sub.ledger || (dd.doc.ledgers[0] || {}).id; const L = dd.doc.ledgers.find(l => l.id === lid);
  if (S.sub.voucherView) { $('#v-back').onclick = () => { delete S.sub.voucherView; render(); }; $('#v-print').onclick = () => window.print(); $('#v-edit').onclick = () => { S.sub.voucherEdit = S.sub.voucherView; delete S.sub.voucherView; render(); }; return; }
  if (S.sub.voucherEdit) { bindVoucherForm(); $('#v-cancel').onclick = () => { delete S.sub.voucherEdit; render(); };
    $('#v-save').onclick = async () => { const isNew = S.sub.voucherEdit === 'new'; const e = isNew ? { id: 'e_' + uid(), dept: dd.id, approver: '', settled: '', source: '지출결의서' } : dd.expenses.find(x => x.id === S.sub.voucherEdit); readVoucherForm(e); if (!e.amount || !e.desc) { toast('적요와 금액을 넣어 주세요'); return; } await backend.set(`depts/${dd.id}/expenses/${e.id}`, e); if (isNew) dd.expenses.push(e); S.sub = { ledger: e.ledgerId, month: ym(e.date), voucherView: e.id }; render(); toast('저장했습니다 — 결의서를 인쇄하세요'); };
    return; }
  const vn = $('#v-new'); if (vn) vn.onclick = () => { S.sub.voucherEdit = 'new'; render(); };
  document.querySelectorAll('[data-voucher]').forEach(b => b.onclick = () => { S.sub.voucherView = b.dataset.voucher; render(); });
  bindMonthNav(); document.querySelectorAll('[data-ledger]').forEach(b => b.onclick = () => { S.sub.ledger = b.dataset.ledger; render(); });
  const la = $('#l-all'); if (la) la.onclick = () => { S.sub.all = !S.sub.all; render(); };
  const add = $('#l-add'); if (add) add.onclick = async () => { const n = $('#l-new').value.trim(); if (!n) return; const b = +$('#l-new-budget').value || 0; const id = `${dd.id}_${uid()}`; dd.doc.ledgers.push({ id, name: n, budget: b, carry: 0, kind: b ? 'budget' : 'balance', note: '', flags: [] }); await saveDeptDoc(dd.id); S.sub.ledger = id; render(); };
  if (!L) return;
  const ea = $('#e-add'); if (ea) ea.onclick = async () => { const a = +$('#e-amt').value; const ds = $('#e-desc').value.trim(); if (!a || !ds) { toast('내역과 금액을 넣어 주세요'); return; } const e = { id: 'e_' + uid(), dept: dd.id, ledgerId: lid, date: $('#e-date').value, category: $('#e-cat').value, desc: ds, amount: a, requester: $('#e-req').value.trim(), approver: '', receipt: $('#e-rc').value === '1', settled: '', note: '', flags: [], source: '앱 입력' }; await backend.set(`depts/${dd.id}/expenses/${e.id}`, e); dd.expenses.push(e); S.sub.month = ym(e.date); render(); toast('지출 추가'); };
  document.querySelectorAll('[data-del-e]').forEach(b => b.onclick = async () => { await backend.del(`depts/${dd.id}/expenses/${b.dataset.delE}`); dd.expenses = dd.expenses.filter(e => e.id !== b.dataset.delE); render(); });
  document.querySelectorAll('[data-edit-e]').forEach(b => b.onclick = () => { const e = dd.expenses.find(x => x.id === b.dataset.editE); openModal(`<h2>지출 수정<button class="btn s" id="modal-close">닫기</button></h2>${e.flags && e.flags.length ? `<div class="flags">${e.flags.map(esc).join('<br>')}</div>` : ''}<div class="fields" style="margin-top:8px"><label class="f"><span>날짜</span><input type="date" id="ee-date" value="${esc(e.date || '')}"></label><label class="f"><span>항목</span><select id="ee-cat">${CATS.map(c => `<option ${c === e.category ? 'selected' : ''}>${c}</option>`).join('')}${CATS.includes(e.category) ? '' : `<option selected>${esc(e.category)}</option>`}</select></label><label class="f" style="grid-column:span 2"><span>세부 내역</span><input type="text" id="ee-desc" value="${esc(e.desc)}"></label><label class="f"><span>금액</span><input type="number" id="ee-amt" value="${e.amount}"></label><label class="f"><span>청구인</span><input type="text" id="ee-req" value="${esc(e.requester || '')}"></label><label class="f"><span>영수증</span><select id="ee-rc"><option value="1" ${e.receipt ? 'selected' : ''}>있음</option><option value="0" ${e.receipt ? '' : 'selected'}>없음</option></select></label><label class="f"><span>장부</span><select id="ee-ledger">${dd.doc.ledgers.map(l => `<option value="${esc(l.id)}" ${l.id === e.ledgerId ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label><label class="f" style="grid-column:span 2"><span>메모</span><input type="text" id="ee-note" value="${esc(e.note || '')}"></label></div><div class="row" style="margin-top:10px"><button class="btn p" id="ee-save">저장</button></div>`); $('#ee-save').onclick = async () => { Object.assign(e, { date: $('#ee-date').value, category: $('#ee-cat').value, desc: $('#ee-desc').value.trim(), amount: +$('#ee-amt').value || 0, requester: $('#ee-req').value.trim(), receipt: $('#ee-rc').value === '1', ledgerId: $('#ee-ledger').value, note: $('#ee-note').value.trim(), flags: [] }); await backend.set(`depts/${dd.id}/expenses/${e.id}`, e); closeModal(); render(); }; });
  const ia = $('#i-add'); if (ia) ia.onclick = async () => { const a = +$('#i-amt').value; const ds = $('#i-desc').value.trim(); if (!a || !ds) return; const e = { id: 'i_' + uid(), dept: dd.id, ledgerId: lid, date: $('#i-date').value, desc: ds, amount: a, note: '', flags: [], source: '앱 입력' }; await backend.set(`depts/${dd.id}/incomes/${e.id}`, e); dd.incomes.push(e); render(); };
  document.querySelectorAll('[data-del-i]').forEach(b => b.onclick = async () => { await backend.del(`depts/${dd.id}/incomes/${b.dataset.delI}`); dd.incomes = dd.incomes.filter(e => e.id !== b.dataset.delI); render(); });
  const ls = $('#l-save'); if (ls) ls.onclick = async () => { L.name = $('#l-name').value.trim() || L.name; L.kind = $('#l-kind').value; L.budget = +$('#l-budget').value || 0; L.carry = +$('#l-carry').value || 0; await saveDeptDoc(dd.id); render(); toast('장부 저장'); };
};

/* ───────────── 지출결의서 ───────────── */
function voucherNo(dd, e) { const same = dd.expenses.filter(x => x.ledgerId === e.ledgerId && x.date && ym(x.date) === ym(e.date)).sort((a, b) => (a.date + a.id) < (b.date + b.id) ? -1 : 1); return `${(e.date || '').replace(/-/g, '').slice(2, 6)}-${pad2(same.indexOf(e) + 1)}`; }
function voucherPaper(dd, e) {
  const L = dd.doc.ledgers.find(l => l.id === e.ledgerId) || { name: '' };
  const sm = ledgerSummary(dd, e.ledgerId, ym(e.date || today()));
  const head = dd.doc.staff.find(t => t.status !== 'left' && /부장|회장/.test(t.role)), acc = dd.doc.staff.find(t => t.status !== 'left' && /회계/.test(t.role));
  const items = e.items && e.items.length ? e.items : [{ desc: e.desc, qty: '', price: '', amount: e.amount }];
  const kor = n => { const u = ['','십','백','천'], g = ['','만','억'], d = '영일이삼사오육칠팔구'; n = Math.floor(+n || 0); if (!n) return '영'; let out = '', gi = 0; while (n > 0) { let part = n % 10000, t = ''; for (let i = 0; part > 0; i++, part = Math.floor(part / 10)) { const x = part % 10; if (x) t = (x === 1 && i ? '' : d[x]) + u[i] + t; } if (t) out = t + g[gi] + out; n = Math.floor(n / 10000); gi++; } return out; };
  return `<section class="paper voucher">
    <div class="hd"><div><h1>지 출 결 의 서</h1><div class="sub">중앙성서교회 교육위원회 · ${esc(dd.doc.name)}</div></div>
      <table class="sign"><tr><th rowspan="2" style="width:22px">결<br>재</th><th>회계</th><th>부장</th><th>교육디렉터</th><th>교육위원장</th></tr><tr><td>${esc(acc ? acc.name : '')}</td><td>${esc(head ? head.name : '')}</td><td></td><td></td></tr></table></div>
    <table class="kv"><tbody>
      <tr><th>결의번호</th><td>${esc(voucherNo(dd, e))}</td><th>결의일</th><td>${esc(e.date ? fmtK(e.date) : '')}</td></tr>
      <tr><th>장부(예산)</th><td>${esc(L.name)}</td><th>항목</th><td>${esc(e.category || '')}</td></tr>
      <tr><th>금액</th><td colspan="3"><b>금 ${kor(e.amount)}원정</b> (₩${won(e.amount)})</td></tr>
      <tr><th>적요</th><td colspan="3">${esc(e.desc)}</td></tr>
      <tr><th>청구인</th><td>${esc(e.requester || '')}</td><th>지급 방법</th><td>${esc(e.payMethod || '')}${e.payTo ? ' · ' + esc(e.payTo) : ''}</td></tr>
    </tbody></table>
    <h2>지출 내역</h2><table><thead><tr><th>내역</th><th class="n">수량</th><th class="n">단가</th><th class="n">금액</th></tr></thead><tbody>${items.map(i => `<tr><td>${esc(i.desc)}</td><td class="n">${i.qty || ''}</td><td class="n">${i.price ? won(i.price) : ''}</td><td class="n">${won(i.amount)}</td></tr>`).join('')}<tr class="sum"><td colspan="3">합계</td><td class="n">${won(e.amount)}</td></tr></tbody></table>
    ${L.kind === 'budget' && L.budget ? `<h2>예산 현황 (${+ym(e.date || today()).slice(5)}월 기준)</h2><table><tbody><tr><th>연간 예산</th><td class="n">${won(L.budget)}</td><th>누계 지출(이 건 포함)</th><td class="n">${won(sm.cumEx)}</td><th>잔액</th><td class="n">${won(sm.remain)}</td></tr></tbody></table>` : ''}
    <div class="lines" style="margin-top:12px"><p>위와 같이 지출을 결의합니다.</p><p style="text-align:right">${esc(e.date ? fmtK(e.date) : '')} &nbsp; 청구인 ${esc(e.requester || '')} (인)</p></div>
    <div class="merge">영수증 ${e.receipt ? '첨부' : '미첨부'}${e.note ? ' · ' + esc(e.note) : ''} · 영수증은 뒷면에 붙여 제출합니다.</div>
    <div class="ft"><b>중앙성서교회 교육위원회</b><span>CBCS에서 생성 · 지출결의서 ${esc(voucherNo(dd, e))}</span></div>
  </section>`;
}
function voucherForm(dd, e) {
  const items = e.items && e.items.length ? e.items : [{ desc: e.desc || '', qty: '', price: '', amount: e.amount || '' }];
  return `<div class="fields">
    <label class="f"><span>결의일</span><input type="date" id="v-date" value="${esc(e.date || today())}"></label>
    <label class="f"><span>장부</span><select id="v-ledger">${dd.doc.ledgers.map(l => `<option value="${esc(l.id)}" ${l.id === e.ledgerId ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>
    <label class="f"><span>항목</span><select id="v-cat">${CATS.map(c => `<option ${c === e.category ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <label class="f"><span>청구인</span><input type="text" id="v-req" value="${esc(e.requester || '')}"></label>
    <label class="f" style="grid-column:span 2"><span>적요</span><input type="text" id="v-desc" value="${esc(e.desc || '')}" placeholder="예: 10월 생일 축하 간식"></label>
    <label class="f"><span>지급 방법</span><select id="v-pay">${['','현금','계좌이체','법인카드','개인카드(청구)'].map(k => `<option ${(e.payMethod || '') === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
    <label class="f"><span>받는 곳 / 계좌</span><input type="text" id="v-payto" value="${esc(e.payTo || '')}"></label>
    <label class="f"><span>영수증</span><select id="v-rc"><option value="1" ${e.receipt !== false ? 'selected' : ''}>있음</option><option value="0" ${e.receipt === false ? 'selected' : ''}>없음</option></select></label>
  </div>
  <h3 style="font-size:13px;margin:12px 0 6px">지출 내역 <span class="note">금액은 수량×단가로 자동 계산, 직접 넣어도 됩니다</span></h3>
  <div class="tw"><table id="v-items"><thead><tr><th>내역</th><th>수량</th><th>단가</th><th>금액</th><th></th></tr></thead><tbody>${items.map((i, k) => `<tr><td><input type="text" class="vi-desc" value="${esc(i.desc || '')}"></td><td><input type="number" class="vi-qty" value="${i.qty || ''}" style="width:70px"></td><td><input type="number" class="vi-price" value="${i.price || ''}" style="width:110px"></td><td><input type="number" class="vi-amt" value="${i.amount || ''}" style="width:120px"></td><td><button class="btn s d vi-del">×</button></td></tr>`).join('')}</tbody></table></div>
  <div class="row" style="margin-top:6px"><button class="btn s" id="v-add-item">줄 추가</button><span class="note" id="v-total"></span></div>
  <label class="f" style="margin-top:10px"><span>메모</span><input type="text" id="v-note" value="${esc(e.note || '')}"></label>`;
}
function bindVoucherForm() {
  const recalc = () => { let t = 0; document.querySelectorAll('#v-items tbody tr').forEach(tr => { const q = +tr.querySelector('.vi-qty').value, p = +tr.querySelector('.vi-price').value, a = tr.querySelector('.vi-amt'); if (q && p && document.activeElement !== a) a.value = q * p; t += +a.value || 0; }); $('#v-total').textContent = `합계 ${won(t)}원`; };
  const wire = () => { document.querySelectorAll('#v-items input').forEach(i => i.oninput = recalc); document.querySelectorAll('.vi-del').forEach(b => b.onclick = () => { if (document.querySelectorAll('#v-items tbody tr').length > 1) { b.closest('tr').remove(); recalc(); } }); };
  $('#v-add-item').onclick = () => { const tr = document.querySelector('#v-items tbody tr').cloneNode(true); tr.querySelectorAll('input').forEach(i => i.value = ''); document.querySelector('#v-items tbody').appendChild(tr); wire(); };
  wire(); recalc();
}
function readVoucherForm(e) {
  const items = [...document.querySelectorAll('#v-items tbody tr')].map(tr => ({ desc: tr.querySelector('.vi-desc').value.trim(), qty: +tr.querySelector('.vi-qty').value || '', price: +tr.querySelector('.vi-price').value || '', amount: +tr.querySelector('.vi-amt').value || 0 })).filter(i => i.desc || i.amount);
  Object.assign(e, { date: $('#v-date').value, ledgerId: $('#v-ledger').value, category: $('#v-cat').value, requester: $('#v-req').value.trim(), desc: $('#v-desc').value.trim() || (items[0] || {}).desc || '', payMethod: $('#v-pay').value, payTo: $('#v-payto').value.trim(), receipt: $('#v-rc').value === '1', note: $('#v-note').value.trim(), items, amount: items.reduce((a, i) => a + i.amount, 0), voucher: true, flags: [] });
  return e;
}

/* ───────────── 월간 보고서 ───────────── */
VIEWS.monthly = async () => {
  const m = S.sub.month || prevMonth(today().slice(0, 7));
  if (isCommittee()) {
    const d = S.sub.dept || 'kinder'; const dd = await loadDept(d);
    return `<div class="topbar no-print"><div><h1>월간 보고서</h1><div class="sub">부서를 고르면 그 달 보고서가 보입니다</div></div>${canEdit() ? '<button class="btn p" id="m-print">PDF로 저장 / 인쇄</button>' : ''}</div><div class="stack">${monthNav(m)}<div class="row no-print">${Object.entries(DEPTS).map(([k,v]) => `<button class="btn ${d === k ? 'p' : ''}" data-dept="${k}">${v}</button>`).join('')}</div>${monthlyPaper(dd, m)}</div>`;
  }
  const dd = D();
  return `<div class="topbar no-print"><div><h1>월간 보고서</h1><div class="sub">주일 보고서와 회계에서 자동으로 모입니다. 다음 달 계획만 적으면 됩니다.</div></div>${canEdit() ? '<button class="btn p" id="m-print">PDF로 저장 / 인쇄</button>' : ''}</div>
  <div class="stack">${monthNav(m)}
    <div class="card edit-only"><h2>${+nextMonth(m).slice(5)}월 계획 <span class="r">부장 입력 · 한 줄에 한 주</span></h2><textarea id="m-plan" placeholder="1주: …&#10;2주: …">${esc(dd.doc.monthlyPlans[nextMonth(m)] || '')}</textarea><div class="row" style="margin-top:8px"><button class="btn" id="m-save">저장</button></div></div>
    ${monthlyPaper(dd, m)}
  </div>`;
};
function monthlyPaper(dd, m) {
  const [y, mm] = m.split('-').map(Number); const reps = monthReports(dd, m); const suns = sundaysOf(y, mm);
  const rows = suns.map((dt, i) => { const r = dd.reports[dt]; if (!r) return `<tr><th>${i+1}주 (${dt.slice(5).replace('-','/')})</th><td colspan="8" class="note">미작성</td></tr>`; const s = reportStats(dd, r); return `<tr><th>${i+1}주 (${dt.slice(5).replace('-','/')})</th><td class="n">${won(r.offering.sunday)}</td><td class="n">${won(s.offSum - (r.offering.sunday||0))}</td><td class="n">${s.m}</td><td class="n">${s.f}</td><td class="n">${s.p}</td><td class="n">${s.total}</td><td class="n">${s.newc}</td><td>${isUnited(r) ? '세대통합예배 · ' : ''}${esc((r.special || '').split('\n')[0]).slice(0, 80)}</td></tr>`; });
  const stats = reps.map(r => reportStats(dd, r)); const n = stats.length || 1; const avg = k => Math.round(stats.reduce((a, s) => a + s[k], 0) / n * 10) / 10;
  const sumOff = stats.reduce((a, s) => a + s.offSum, 0), sumSun = reps.reduce((a, r) => a + (r.offering.sunday || 0), 0);
  const main = dd.doc.ledgers.find(l => l.kind === 'budget') || dd.doc.ledgers[0]; const sm = main ? ledgerSummary(dd, main.id, m) : null; const others = dd.doc.ledgers.filter(l => l !== main);
  const ex = main ? dd.expenses.filter(e => e.ledgerId === main.id && ym(e.date) === m).sort((a, b) => a.category < b.category ? -1 : 1) : [];
  const byCat = {}; ex.forEach(e => { (byCat[e.category] = byCat[e.category] || []).push(e); });
  const exRows = Object.entries(byCat).map(([c, list]) => list.map((e, i) => `<tr><td>${e.date.slice(5).replace('-','/')}</td><td>${esc(c)}</td><td>${esc(e.desc)}</td><td class="n">${won(e.amount)}</td>${i === 0 ? `<td class="n" rowspan="${list.length}">${won(list.reduce((a, x) => a + (+x.amount||0), 0))}</td>` : ''}<td class="c">${e.receipt ? '○' : '—'}</td></tr>`).join('')).join('');
  const head = dd.doc.staff.find(t => t.status !== 'left' && /부장|회장/.test(t.role)), sec = dd.doc.staff.find(t => t.status !== 'left' && /총무|서기/.test(t.role)), acc = dd.doc.staff.find(t => t.status !== 'left' && /회계/.test(t.role));
  const mt = (dd.doc.monthlyTexts || {})[m];
  const weekly = mt && mt.report && mt.report.length ? mt.report.map(l => { const [a, ...b] = l.split(':'); return `<tr><th style="width:18%">${esc(a)}</th><td>${esc(b.join(':').trim())}</td></tr>`; }).join('') : suns.map((dt, i) => { const r = dd.reports[dt]; return `<tr><th style="width:18%">${i+1}주</th><td>${r ? esc([r.activity, r.meeting].filter(Boolean).join(' · ')) : '—'}</td></tr>`; }).join('');
  const np = (dd.doc.monthlyPlans[nextMonth(m)] || '').split('\n').filter(Boolean);
  return `<section class="paper">
    <div class="hd"><div><h1>${y}년 ${mm}월 ${esc(dd.doc.name)} 월간 보고서</h1><div class="sub">중앙성서교회 교육위원회 제출 · 월 1회</div></div><div class="meta">부장 ${esc(head ? head.name : '')} · 총무 ${esc(sec ? sec.name : '')} · 회계 ${esc(acc ? acc.name : '')}<br>주일 보고서 ${reps.length}장 반영</div></div>
    <div class="grid2"><div><h2>1. ${mm}월 보고 <span class="tag">주일 보고서에서</span></h2><table class="kv"><tbody>${weekly}</tbody></table></div><div><h2>2. ${+nextMonth(m).slice(5)}월 계획</h2><table class="kv"><tbody>${np.map(l => { const [a, ...b] = l.split(':'); return `<tr><th style="width:18%">${esc(a)}</th><td>${esc(b.join(':').trim())}</td></tr>`; }).join('') || '<tr><td class="note">(다음 달 계획을 입력하세요)</td></tr>'}</tbody></table></div></div>
    <h2>3. 출석 현황 및 헌금 집계 <span class="tag">자동</span></h2><div class="tw"><table><thead><tr><th></th><th class="n">주일헌금</th><th class="n">기타헌금</th><th class="n">남</th><th class="n">여</th><th class="n">출석</th><th class="n">재적</th><th class="n">새친구</th><th>특이사항</th></tr></thead><tbody>${rows.join('')}<tr class="sum"><td>합계 (평균)</td><td class="n">${won(sumSun)}</td><td class="n">${won(sumOff - sumSun)}</td><td class="n">${avg('m')}</td><td class="n">${avg('f')}</td><td class="n">${avg('p')}</td><td class="n">${activeStudents(dd).length}</td><td class="n">${stats.reduce((a, s) => a + s.newc, 0)}</td><td>평균 출석률 <span style="color:#8a1f2b">${avg('rate')}%</span></td></tr></tbody></table></div>
    ${main ? `<h2>4. 예산 청구 및 지출 내역 <span class="tag">자동</span></h2><div class="tw"><table><thead><tr><th class="n">부서 예산 (연)</th><th class="n">전월 누계 지출</th><th class="n">${mm}월 지출</th><th class="n">누계 지출</th><th class="n">예산 잔액</th><th class="n">집행률</th></tr></thead><tbody><tr><td class="n">${won(main.budget)}</td><td class="n">${won(sm.prevEx)}</td><td class="n">${won(sm.monEx)}</td><td class="n">${won(sm.cumEx)}</td><td class="n">${won(sm.remain)}</td><td class="n" style="color:#8a1f2b">${sm.rate ?? '—'}%</td></tr></tbody></table></div>` : ''}
    ${others.length ? `<h2>5. 찬조금·행사 장부 현황 <span class="tag">자동</span></h2><div class="tw"><table><thead><tr><th>장부</th><th class="n">전월 이월</th><th class="n">${mm}월 수입</th><th class="n">${mm}월 지출</th><th class="n">잔액</th></tr></thead><tbody>${others.map(l => { const o = ledgerSummary(dd, l.id, m); return `<tr><td>${esc(l.name)}</td><td class="n">${won(o.carryIn)}</td><td class="n">${won(o.monIn)}</td><td class="n">${won(o.monEx)}</td><td class="n">${won(o.balance)}</td></tr>`; }).join('')}</tbody></table></div>` : ''}
    <h2>6. 회계 보고서 (지출 세부) <span class="tag">건별 입력 → 소계·합계 자동</span></h2><div class="tw"><table><thead><tr><th>날짜</th><th>항목</th><th>지출 세부 내역</th><th class="n">금액</th><th class="n">항목 소계</th><th class="c">영수증</th></tr></thead><tbody>${exRows || '<tr><td colspan="6" class="note">이달 지출 없음</td></tr>'}<tr class="sum"><td colspan="3">${mm}월 지출 합계</td><td class="n">${won(sm ? sm.monEx : 0)}</td><td class="n">${won(sm ? sm.monEx : 0)}</td><td></td></tr></tbody></table></div>
    ${dd.doc.notes && dd.doc.notes.merge ? `<div class="merge">※ ${esc(dd.doc.notes.merge)}</div>` : ''}
    <div class="ft"><b>중앙성서교회 교육위원회</b><span>CBCS에서 생성 · ${esc(dd.doc.name)}-${m}-월간.pdf · 부장·총무·회계 확인 후 월례회 제출</span></div>
  </section>`;
}
BIND.monthly = () => { bindMonthNav(); const p = $('#m-print'); if (p) p.onclick = () => window.print(); if (isCommittee()) { document.querySelectorAll('[data-dept]').forEach(b => b.onclick = () => { S.sub.dept = b.dataset.dept; render(); }); return; } const dd = D(); const m = S.sub.month || prevMonth(today().slice(0, 7)); const sv = $('#m-save'); if (sv) sv.onclick = async () => { dd.doc.monthlyPlans[nextMonth(m)] = $('#m-plan').value; await saveDeptDoc(dd.id); render(); toast('계획 저장'); }; };

/* ───────────── 연간 계획 ───────────── */
VIEWS.plan = async () => {
  const dd = D(); const total = dd.doc.budgetPlan.reduce((a, b) => a + (+b.amount || 0), 0); const main = dd.doc.ledgers.find(l => l.kind === 'budget');
  const evs = dd.events.slice().sort((a, b) => a.date < b.date ? -1 : 1);
  return `<div class="topbar"><div><h1>${YEAR}년 연간 계획</h1><div class="sub">연간교육계획안의 행사표와 예산안. 한 번 넣으면 달력·주일 보고서·회계가 이걸 씁니다.</div></div></div>
  <div class="grid2">
    <div class="card"><h2>행사·일정 <span class="r">${evs.length}건</span></h2><div class="list" style="max-height:600px;overflow:auto">${evs.map(e => `<div class="item"><div><div class="t">${esc(e.title)}</div><div class="d">${fmtK(e.date)}${e.end ? ' ~ ' + fmtK(e.end) : ''}${e.note ? ' · ' + esc(e.note) : ''}</div></div><button class="btn s d edit-only" data-del-ev="${e._id || e.id}">삭제</button></div>`).join('') || '<div class="note">일정이 없습니다.</div>'}</div>
      <div class="row edit-only" style="margin-top:10px"><input type="date" id="ev-date" style="width:auto"><input type="text" id="ev-title" placeholder="행사 이름" style="flex:1"><button class="btn" id="ev-add">추가</button></div></div>
    <div class="card"><h2>예산안 <span class="r">합계 ${won(total)}원</span></h2><div class="tw"><table><thead><tr><th>사역</th><th>품목</th><th class="n">금액</th><th></th></tr></thead><tbody>${dd.doc.budgetPlan.map((b, i) => `<tr><td>${esc(b.category)}</td><td>${esc(b.item)}${b.note ? ` <span class="note">(${esc(b.note)})</span>` : ''}</td><td class="n">${won(b.amount)}</td><td><button class="btn s d edit-only" data-del-b="${i}">삭제</button></td></tr>`).join('')}<tr class="sum"><td colspan="2">합계</td><td class="n">${won(total)}</td><td></td></tr></tbody></table></div>
      <div class="row edit-only" style="margin-top:10px"><input type="text" id="b-cat" placeholder="사역" style="width:90px"><input type="text" id="b-item" placeholder="품목" style="flex:1"><input type="number" id="b-amt" placeholder="금액" style="width:120px"><button class="btn" id="b-add">추가</button></div>
      ${main ? `<div class="note edit-only" style="margin-top:8px">회계 장부 "${esc(main.name)}"의 연간 예산(${won(main.budget)}원)과 맞추면 집행률이 정확해집니다. <button class="btn s" id="b-sync">예산안 합계를 장부에 반영</button></div>` : ''}</div>
  </div>`;
};
BIND.plan = () => {
  const dd = D();
  $('#ev-add') && ($('#ev-add').onclick = async () => { const dt = $('#ev-date').value, t = $('#ev-title').value.trim(); if (!dt || !t) return; const e = { id: 'ev_' + uid(), date: dt, end: '', title: t, note: '' }; await backend.set(`depts/${dd.id}/events/${e.id}`, e); dd.events.push({ _id: e.id, ...e }); render(); });
  document.querySelectorAll('[data-del-ev]').forEach(b => b.onclick = async () => { await backend.del(`depts/${dd.id}/events/${b.dataset.delEv}`); dd.events = dd.events.filter(e => (e._id || e.id) !== b.dataset.delEv); render(); });
  $('#b-add') && ($('#b-add').onclick = async () => { const a = +$('#b-amt').value, it = $('#b-item').value.trim(); if (!a || !it) return; dd.doc.budgetPlan.push({ category: $('#b-cat').value.trim(), item: it, amount: a, note: '' }); await saveDeptDoc(dd.id); render(); });
  document.querySelectorAll('[data-del-b]').forEach(b => b.onclick = async () => { dd.doc.budgetPlan.splice(+b.dataset.delB, 1); await saveDeptDoc(dd.id); render(); });
  $('#b-sync') && ($('#b-sync').onclick = async () => { const main = dd.doc.ledgers.find(l => l.kind === 'budget'); main.budget = dd.doc.budgetPlan.reduce((a, b) => a + (+b.amount || 0), 0); await saveDeptDoc(dd.id); render(); toast('장부 연간 예산을 맞췄습니다'); });
};

/* ───────────── 통계 ───────────── */
VIEWS.stats = async () => {
  const dd = D(); const reps = Object.values(dd.reports).filter(r => r.date.startsWith(String(YEAR))).sort((a, b) => a.date < b.date ? -1 : 1);
  const last4 = reps.slice(-4);
  const rows = activeStudents(dd).map(s => { const cnt = reps.filter(r => (r.att || {})[s.id]).length; const streak = last4.length >= 4 && last4.every(r => !(r.att || {})[s.id]); return { s, cnt, rate: reps.length ? Math.round(cnt / reps.length * 100) : 0, streak }; }).sort((a, b) => a.rate - b.rate);
  const trend = reps.map(r => ({ date: r.date, s: reportStats(dd, r) }));
  return `<div class="topbar"><div><h1>출석 통계</h1><div class="sub">${YEAR}년 주일 보고서 ${reps.length}장 기준</div></div></div>
  <div class="stack">
    <div class="card"><h2>주별 출석 추이</h2>${trend.length ? svgTrend(trend) : '<div class="note">보고서가 쌓이면 그래프가 그려집니다.</div>'}</div>
    <div class="grid2">
      <div class="card"><h2>장기 결석 (최근 4주 연속)</h2><div class="list">${rows.filter(r => r.streak).map(r => `<div class="item"><div class="t">${esc(r.s.name)} <span class="note">${esc((classOf(dd, r.s) || {}).name || '')}</span></div><span class="pill bad">4주 결석</span></div>`).join('') || `<div class="note">${reps.length < 4 ? '보고서가 4장 이상 쌓이면 자동으로 찾습니다.' : '해당자가 없습니다.'}</div>`}</div><div class="note" style="margin-top:8px">연말 제적 정리 후보도 여기서 뽑습니다.</div></div>
      <div class="card"><h2>학생별 출석률 <span class="r">낮은 순</span></h2><div class="tw" style="max-height:480px;overflow:auto"><table><thead><tr><th>이름</th><th>${esc(dd.doc.classLabel)}</th><th class="n">출석</th><th class="n">출석률</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.s.name)}</td><td class="note">${esc((classOf(dd, r.s) || {}).name || '')}</td><td class="n">${r.cnt}/${reps.length}</td><td class="n">${r.rate}%</td></tr>`).join('')}</tbody></table></div></div>
    </div>
  </div>`;
};
function svgTrend(t) {
  const W = 640, H = 170, pl = 36, pr = 12, pt = 16, pb = 30; const max = Math.max(...t.map(x => x.s.total), 1);
  const X = i => pl + (t.length === 1 ? 0 : (W - pl - pr) * i / (t.length - 1)), Y = v => pt + (H - pt - pb) * (1 - v / max);
  const path = t.map((x, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(x.s.p).toFixed(1)}`).join(' ');
  const total = t.map((x, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(x.s.total).toFixed(1)}`).join(' ');
  const step = Math.max(1, Math.ceil(t.length / 12));
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:100%;height:auto;font-size:11px" role="img" aria-label="주별 출석 추이">
    ${[0, .5, 1].map(f => `<line x1="${pl}" x2="${W - pr}" y1="${Y(max * f)}" y2="${Y(max * f)}" stroke="var(--line-soft)"/><text x="${pl - 6}" y="${Y(max * f) + 4}" text-anchor="end" fill="var(--muted)">${Math.round(max * f)}</text>`).join('')}
    <path d="${total}" fill="none" stroke="var(--line)" stroke-dasharray="4 3" stroke-width="1.5"/>
    <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2"/>
    ${t.map((x, i) => `<circle cx="${X(i)}" cy="${Y(x.s.p)}" r="2.5" fill="var(--accent)"><title>${x.date} 출석 ${x.s.p}/${x.s.total}</title></circle>${i % step === 0 ? `<text x="${X(i)}" y="${H - 10}" text-anchor="middle" fill="var(--muted)">${x.date.slice(5).replace('-','/')}</text>` : ''}`).join('')}
    <text x="${W - pr}" y="${pt + 8}" text-anchor="end" fill="var(--muted)">점선 = 재적</text>
  </svg>`;
}

/* ───────────── 보관함 ───────────── */
VIEWS.archive = async () => {
  const idx = S.archive || (S.archive = await backend.list('archive'));
  const mine = isCommittee() ? idx : idx.filter(a => a.dept === S.dept);
  const year = S.sub.year || (mine.some(a => a.year === 2025) ? 2025 : YEAR);
  const kinds = [...new Set(mine.map(a => a.kind))];
  const kind = S.sub.kind || '';
  const list = mine.filter(a => a.year === year && (!kind || a.kind === kind)).sort((a, b) => (a.dept + (a.origDept || '') + (a.date || a.month || '')) < (b.dept + (b.origDept || '') + (b.date || b.month || '')) ? -1 : 1);
  // 2026년 이후 앱에서 만든 보고서도 목록에 포함
  const gen = []; const depts = isCommittee() ? Object.keys(DEPTS) : [S.dept];
  for (const d of depts) { const dd = S.data[d]; if (!dd) continue; Object.values(dd.reports).forEach(r => { if (+r.date.slice(0, 4) === year) gen.push({ dept: d, kind: '주일보고서', date: r.date, title: `${DEPTS[d]} 주일 보고서 ${r.date}`, app: true }); }); }
  return `<div class="topbar"><div><h1>보관함</h1><div class="sub">2025년 이전 원본 파일은 시놀로지 드라이브에 그대로 있고, 여기에는 목록만 있습니다. ${YEAR}년부터는 앱에서 PDF를 바로 만듭니다.</div></div>
    <div class="row"><select id="ar-year" style="width:auto">${[2024, 2025, 2026, 2027].map(y => `<option ${y === year ? 'selected' : ''}>${y}</option>`).join('')}</select><select id="ar-kind" style="width:auto"><option value="">모든 종류</option>${kinds.map(k => `<option ${k === kind ? 'selected' : ''}>${k}</option>`).join('')}</select></div></div>
  <div class="card"><div class="tw"><table><thead><tr><th>부서</th><th>종류</th><th>날짜</th><th>제목</th><th>위치</th></tr></thead><tbody>
    ${gen.filter(a => !kind || a.kind === kind).map(a => `<tr><td>${DEPTS[a.dept]}</td><td>${a.kind}</td><td>${a.date}</td><td>${esc(a.title)}</td><td><button class="btn s" data-go="reports" data-sub='${JSON.stringify({ dept: a.dept, preview: a.date })}'>앱에서 보기</button></td></tr>`).join('')}
    ${list.map(a => `<tr><td>${DEPTS[a.dept] || a.dept}${a.origDept && a.origDept !== DEPTS[a.dept] ? ` <span class="pill mute">${esc(a.origDept)}</span>` : ''}</td><td>${esc(a.kind)}</td><td>${a.date || a.month || ''}</td><td class="wrap">${esc(a.title)}${a.note ? ` <span class="note">(${esc(a.note)})</span>` : ''}</td><td class="wrap note">${esc(a.rel || a.path)}</td></tr>`).join('')}
    ${!list.length && !gen.length ? '<tr><td colspan="5" class="note">해당 자료가 없습니다.</td></tr>' : ''}
  </tbody></table></div>
  ${year <= 2025 ? '<div class="note" style="margin-top:8px">※ 2025년까지는 중등부·고등부가 따로 보고했습니다(2026년 중고등부로 통합). 원본 열기는 시놀로지 드라이브의 같은 경로에서 합니다.</div>' : ''}</div>`;
};
BIND.archive = () => { $('#ar-year').onchange = e => { S.sub.year = +e.target.value; render(); }; $('#ar-kind').onchange = e => { S.sub.kind = e.target.value; render(); }; };

/* ───────────── 멤버 (모바일) ───────────── */
VIEWS.members = async () => { const dd = D(); return `<div class="topbar"><div><h1>멤버</h1><div class="sub">${esc(dd.doc.name)} 교사·임원과 반 편성</div></div></div><div class="stack"><div class="card"><h2>교사·임원</h2><div class="list">${dd.doc.staff.filter(t => t.status !== 'left').map(t => `<div class="item"><div><div class="t">${esc(t.name)}</div><div class="d">${esc(t.role)}${t.classId ? ' · ' + esc(t.classId) : ''}</div></div>${t.phone ? `<a href="tel:${esc(t.phone)}" class="note">${esc(t.phone)}</a>` : ''}</div>`).join('')}</div></div><div class="card"><h2>${esc(dd.doc.classLabel)} 편성</h2><div class="list">${dd.doc.classes.map(c => `<div class="item"><div><div class="t">${esc(c.name)}</div><div class="d">담임 ${esc(c.teacher || '미정')} · ${classStudents(dd, c.id).map(s => esc(s.name)).join(', ')}</div></div></div>`).join('')}</div></div></div>`; };

/* ───────────── 장학 (교육위원회) ───────────── */
VIEWS.scholarship = async () => {
  const all = S.scholarship || (S.scholarship = await backend.list('scholarship'));
  const years = [...new Set(all.map(s => s.year))].sort((a, b) => b - a); const year = S.sub.year || years[0] || YEAR;
  const list = all.filter(s => s.year === year).sort((a, b) => (a.status === '확정' ? 0 : 1) - (b.status === '확정' ? 0 : 1) || (a.origDept || '').localeCompare(b.origDept || '') || a.name.localeCompare(b.name));
  const total = list.filter(s => s.status === '확정').reduce((a, s) => a + (+s.amount || 0), 0);
  const show = S.sub.showAcct;
  return `<div class="topbar"><div><h1>장학</h1><div class="sub">교육위원회 전용 · 2018년부터의 장학생 명단과 지급 내역</div></div><div class="row"><select id="sc-year" style="width:auto">${years.map(y => `<option ${y === year ? 'selected' : ''}>${y}</option>`).join('')}</select>${canEdit() ? `<button class="btn s" id="sc-acct">${show ? '계좌 숨기기' : '계좌 보기'}</button><button class="btn p" id="sc-new">대상자 추가</button>` : ''}</div></div>
  <div class="stack">
    <div class="tiles"><div class="tile"><div class="v">${list.filter(s => s.status === '확정').length}</div><div class="l">${year}년 확정</div></div><div class="tile"><div class="v">${list.filter(s => s.status !== '확정').length}</div><div class="l">후보·제외</div></div><div class="tile"><div class="v">${won(total)}</div><div class="l">확정 합계(원)</div></div></div>
    <div class="card"><div class="tw"><table><thead><tr><th>상태</th><th>이름</th><th>소속</th><th>학교·학년</th><th class="n">금액</th><th>사유·비고</th>${show ? '<th>계좌</th>' : ''}<th></th></tr></thead><tbody>
    ${list.map(s => `<tr><td><span class="pill ${s.status === '확정' ? 'ok' : s.status === '후보' ? 'info' : 'mute'}">${esc(s.status || '')}</span></td><td>${esc(s.name)}${s.flags && s.flags.length ? ` <span class="tag flag" title="${esc(s.flags.join(' / '))}">!</span>` : ''}</td><td>${esc(s.origDept || DEPTS[s.dept] || '')}</td><td class="wrap note">${esc([s.school, s.grade].filter(Boolean).join(' '))}</td><td class="n">${s.amount ? won(s.amount) : '—'}</td><td class="wrap note">${esc([s.reason, s.note].filter(Boolean).join(' · ')).slice(0, 90)}</td>${show ? `<td class="mask note">${esc([s.bank, s.account, s.holder].filter(Boolean).join(' '))}</td>` : ''}<td>${canEdit() ? `<button class="btn s" data-sc="${s._id}">수정</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="note">자료가 없습니다.</td></tr>'}
    </tbody></table></div></div>
  </div>`;
};
function scholarshipForm(s) { return `<div class="fields"><label class="f"><span>연도</span><input type="number" id="sf-year" value="${s.year || YEAR}"></label><label class="f"><span>상태</span><select id="sf-status">${['확정','후보','제외'].map(k => `<option ${s.status === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label><label class="f"><span>이름</span><input type="text" id="sf-name" value="${esc(s.name || '')}"></label><label class="f"><span>소속</span><input type="text" id="sf-dept" value="${esc(s.origDept || '')}" placeholder="청년부 / 성서선교회 등"></label><label class="f"><span>학교</span><input type="text" id="sf-school" value="${esc(s.school || '')}"></label><label class="f"><span>학년</span><input type="text" id="sf-grade" value="${esc(s.grade || '')}"></label><label class="f"><span>금액</span><input type="number" id="sf-amount" value="${s.amount || 0}"></label><label class="f"><span>생년월일</span><input type="text" id="sf-birth" value="${esc(s.birth || '')}"></label><label class="f"><span>은행</span><input type="text" id="sf-bank" value="${esc(s.bank || '')}"></label><label class="f"><span>계좌번호</span><input type="text" id="sf-account" value="${esc(s.account || '')}"></label><label class="f"><span>예금주</span><input type="text" id="sf-holder" value="${esc(s.holder || '')}"></label><label class="f"><span>수여식</span><input type="date" id="sf-ceremony" value="${esc(s.ceremony || '')}"></label><label class="f" style="grid-column:span 2"><span>선정 사유</span><input type="text" id="sf-reason" value="${esc(s.reason || '')}"></label><label class="f" style="grid-column:span 2"><span>비고</span><input type="text" id="sf-note" value="${esc(s.note || '')}"></label></div>`; }
function readScholarshipForm(s) { Object.assign(s, { year: +$('#sf-year').value, status: $('#sf-status').value, name: $('#sf-name').value.trim(), origDept: $('#sf-dept').value.trim(), school: $('#sf-school').value.trim(), grade: $('#sf-grade').value.trim(), amount: +$('#sf-amount').value || 0, birth: $('#sf-birth').value.trim(), bank: $('#sf-bank').value.trim(), account: $('#sf-account').value.trim(), holder: $('#sf-holder').value.trim(), ceremony: $('#sf-ceremony').value, reason: $('#sf-reason').value.trim(), note: $('#sf-note').value.trim(), flags: [] }); }
BIND.scholarship = () => {
  $('#sc-year').onchange = e => { S.sub.year = +e.target.value; render(); };
  const ac = $('#sc-acct'); if (ac) ac.onclick = () => { S.sub.showAcct = !S.sub.showAcct; render(); };
  const nw = $('#sc-new'); if (nw) nw.onclick = () => { const s = { id: 'sc_' + uid(), year: S.sub.year || YEAR, status: '후보', name: '', origDept: '', dept: '', sex: '', birth: '', school: '', grade: '', amount: 0, bank: '', account: '', holder: '', reason: '', note: '', ceremony: '', flags: [], source: ['앱 입력'] }; openModal(`<h2>장학 대상자 추가<button class="btn s" id="modal-close">닫기</button></h2>${scholarshipForm(s)}<div class="row" style="margin-top:10px"><button class="btn p" id="sf-save">저장</button></div>`); $('#sf-save').onclick = async () => { readScholarshipForm(s); if (!s.name) return; await backend.set(`scholarship/${s.id}`, s); S.scholarship.push({ _id: s.id, ...s }); closeModal(); render(); }; };
  document.querySelectorAll('[data-sc]').forEach(b => b.onclick = () => { const s = S.scholarship.find(x => x._id === b.dataset.sc); openModal(`<h2>${esc(s.name)} (${s.year})<button class="btn s" id="modal-close">닫기</button></h2>${s.flags && s.flags.length ? `<div class="flags">${s.flags.map(esc).join('<br>')}</div>` : ''}<div style="margin-top:8px">${scholarshipForm(s)}</div><div class="row" style="margin-top:10px"><button class="btn p" id="sf-save">저장</button><button class="btn d" id="sf-del">삭제</button></div>`); $('#sf-save').onclick = async () => { readScholarshipForm(s); const { _id, ...data } = s; await backend.set(`scholarship/${_id}`, data); closeModal(); render(); }; $('#sf-del').onclick = async () => { await backend.del(`scholarship/${s._id}`); S.scholarship = S.scholarship.filter(x => x._id !== s._id); closeModal(); render(); }; });
};

/* ───────────── 데이터 가져오기 (교육위원회) ───────────── */
VIEWS.import = async () => `<div class="topbar"><div><h1>데이터 가져오기</h1><div class="sub">변환된 초기 데이터(JSON)를 올립니다. 같은 id는 덮어쓰고, 앱에서 새로 만든 자료는 건드리지 않습니다.</div></div></div>
  <div class="stack"><div class="card"><input type="file" id="im-file" accept="application/json,.json"><div class="row" style="margin-top:10px"><button class="btn p" id="im-go" disabled>올리기</button><label class="row" style="font-size:12.5px"><input type="checkbox" id="im-reports" checked> 주일 보고서</label><label class="row" style="font-size:12.5px"><input type="checkbox" id="im-students" checked> 출석부</label><label class="row" style="font-size:12.5px"><input type="checkbox" id="im-money" checked> 회계</label><label class="row" style="font-size:12.5px"><input type="checkbox" id="im-plan" checked> 연간 계획·월간</label><label class="row" style="font-size:12.5px"><input type="checkbox" id="im-sch" checked> 장학</label><label class="row" style="font-size:12.5px"><input type="checkbox" id="im-arch" checked> 보관 색인</label></div><pre class="progress" id="im-log" style="margin-top:12px"></pre></div>
  <div class="card"><h2>엑셀 가져오기 (앞으로)</h2><div class="note">출석부·회계 엑셀을 정해진 양식으로 올리면 바로 반영하는 기능은 전 부서 시행 후 양식을 정해 추가합니다.</div></div></div>`;
BIND.import = () => {
  let payload = null; const log = m => { $('#im-log').textContent += m + '\n'; };
  $('#im-file').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { payload = JSON.parse(await f.text()); $('#im-go').disabled = false; log(`파일 확인: 부서 ${Object.keys(payload.depts || {}).join(', ')} · 장학 ${(payload.scholarship || []).length}건 · 보관 색인 ${(payload.archiveIndex || []).length}건`); } catch (err) { log('JSON을 읽지 못했습니다: ' + err.message); } };
  $('#im-go').onclick = async () => {
    if (!payload) return; $('#im-go').disabled = true; const on = id => $('#' + id).checked;
    const items = payloadToItems(payload, { students: on('im-students'), reports: on('im-reports'), money: on('im-money'), plan: on('im-plan'), sch: on('im-sch'), arch: on('im-arch') });
    log(`문서 ${items.length}개를 올립니다…`);
    try { await backend.batchSet(items, (a, b) => { $('#im-log').textContent = $('#im-log').textContent.replace(/\n진행.*$/, '') + `\n진행 ${a}/${b}`; }); log('완료. 새로고침하면 반영됩니다.'); S.data = {}; S.committee = null; S.scholarship = null; S.archive = null; }
    catch (err) { log('실패: ' + (err.code || err.message) + ' — Firestore 보안 규칙과 로그인 계정을 확인하세요.'); $('#im-go').disabled = false; }
  };
};

function payloadToItems(payload, on) {
  const items = [];
  for (const [d, dep] of Object.entries(payload.depts || {})) {
    items.push({ path: `depts/${d}`, data: { ...dep.doc } });
    if (on.students) (dep.students || []).forEach(s => items.push({ path: `depts/${d}/students/${s.id}`, data: s }));
    if (on.reports) (dep.reports || []).forEach(r => items.push({ path: `depts/${d}/reports/${r.date}`, data: r }));
    if (on.money) { (dep.expenses || []).forEach(x => items.push({ path: `depts/${d}/expenses/${x.id}`, data: x })); (dep.incomes || []).forEach(x => items.push({ path: `depts/${d}/incomes/${x.id}`, data: x })); }
    if (on.plan) { (dep.events || []).forEach(x => items.push({ path: `depts/${d}/events/${x.id}`, data: x })); (dep.notices || []).forEach(x => items.push({ path: `depts/${d}/notices/${x.id}`, data: x })); }
  }
  const c = payload.committee || {}; items.push({ path: 'committee/main', data: { staff: c.staff || [] } });
  (c.events || []).forEach(x => items.push({ path: `committee/main/events/${x.id}`, data: x })); (c.notices || []).forEach(x => items.push({ path: `committee/main/notices/${x.id}`, data: x }));
  if (on.sch) (payload.scholarship || []).forEach(x => items.push({ path: `scholarship/${x.id}`, data: x }));
  if (on.arch) (payload.archiveIndex || []).forEach(x => items.push({ path: `archive/${x.id}`, data: x }));
  items.push({ path: 'meta/import', data: { at: new Date().toISOString(), count: items.length, generated: payload.generated || '' } });
  return items;
}

/* ───────────── 사용 안내 ───────────── */
VIEWS.tutorial = async () => {
  const c = isCommittee(); const mob = isMobile();
  return `<div class="topbar"><div><h1>사용 안내</h1><div class="sub">${c ? '교육위원회 화면' : '부서 화면'} · ${mob ? '휴대폰에서는 열람과 출석 체크만 됩니다' : '한 달 동안 이 순서대로 쓰면 됩니다'}</div></div><button class="btn p" data-go="home">시작하기</button></div>
  <div class="hint info" style="margin-bottom:14px">PC에서는 작성·수정·출력 전부, 휴대폰에서는 메인·일정·보고서 열람·통계·멤버 연락처·출석 체크. 2026년 보고서는 HWP에서 변환해 넣었고, 2027년 1월부터 앱에서 직접 작성합니다.</div>
  <div class="steps">
    ${c ? `
    <div class="step"><div><h3>메인에서 제출 현황 보기</h3><p>지난 주일 보고서를 어느 부서가 냈는지, 출석·헌금이 얼마인지 한 표로 봅니다. 날짜를 바꿔 지난 주도 볼 수 있습니다.</p><div class="who">교육위원장 · 교육디렉터</div></div></div>
    <div class="step"><div><h3>공지와 공통 일정 올리기</h3><p>메인의 공지·공통 일정에 적으면 모든 부서 메인 화면과 주일 보고서 "이달 일정"에 나타납니다.</p><div class="who">교육위원장 · PC</div></div></div>
    <div class="step"><div><h3>월례회 전에 월간 보고서 열람</h3><p>월간 보고서 화면에서 부서를 고르면 그 달 보고서가 보입니다. 부서가 출력해 온 종이와 같은 내용입니다.</p><div class="who">교육위원회</div></div></div>
    <div class="step"><div><h3>장학 관리</h3><p>장학 메뉴에서 연도별 명단·금액·계좌를 봅니다. 계좌번호는 "계좌 보기"를 눌러야 보입니다. 후보 추가와 확정 처리도 여기서 합니다.</p><div class="who">교육위원회 · PC</div></div></div>
    <div class="step"><div><h3>데이터 가져오기</h3><p>변환된 초기 데이터 파일이나, 앞으로 정해진 양식의 자료를 올립니다. 처음 한 번만 하면 됩니다.</p><div class="who">관리자</div></div></div>
    ` : `
    <div class="step"><div><h3>연초에 한 번: 출석부와 연간 계획</h3><p><b>출석부</b>에서 반(또는 팸·학년) 편성, 학생, 교사·임원을 넣습니다. <b>연간 계획</b>에 행사표와 예산안을 넣습니다. 연간교육계획안을 그대로 옮기면 됩니다.</p><div class="who">교역자 · 총무 — 11~12월 · PC</div>${mob ? '' : '<button class="btn s" data-go="roster">출석부 열기</button> <button class="btn s" data-go="plan">연간 계획 열기</button>'}</div></div>
    <div class="step"><div><h3>매주 주일: 출석 체크와 보고서</h3><p>예배 후 담임은 휴대폰 <b>출석 체크</b>에서 학생 이름을 누릅니다(한 번 출석, 두 번 온라인·본당, 세 번 결석). 총무는 PC <b>주일 보고서</b>에서 설교·헌금·회의 내용을 채웁니다. 남·여·합계·출석률은 앱이 셉니다.</p><div class="who">담임(휴대폰) · 총무(PC) — 예배 후 10분</div><button class="btn s" data-go="${mob ? 'attend' : 'weekly'}">${mob ? '출석 체크 열기' : '주일 보고서 열기'}</button></div></div>
    <div class="step"><div><h3>작성 완료 → PDF → 종이로 보고</h3><p>"작성 완료"를 누르면 보고서 모양 그대로 미리보기가 뜹니다. "PDF로 저장 / 인쇄"를 누르고 브라우저 인쇄 창에서 "PDF로 저장"을 고르면 됩니다. 지금처럼 부장에게 종이로 보고합니다.</p><div class="who">총무 → 부장 서명 · PC</div></div></div>
    <div class="step"><div><h3>지출이 생길 때마다: 회계</h3><p><b>회계</b>에서 "지출결의서 작성"으로 날짜·항목·내역·금액을 넣고 결의서를 인쇄해 결재를 받습니다(영수증은 뒷면에). 월 합계, 누계, 예산 잔액, 집행률이 바로 계산됩니다. 찬조금·수련회처럼 잔액을 따로 보는 돈은 장부를 하나 더 만듭니다.</p><div class="who">회계 — 지출 당일 · PC</div>${mob ? '' : '<button class="btn s" data-go="ledger">회계 열기</button>'}</div></div>
    <div class="step"><div><h3>월말: 월간 보고서는 이미 만들어져 있습니다</h3><p><b>월간 보고서</b>를 열면 그 달 주일 보고서 4~5장과 회계가 모여 있습니다. 부장은 "다음 달 계획" 칸만 적고, 부장·총무·회계가 확인한 뒤 PDF로 출력해 교육위원회 월례회에 냅니다.</p><div class="who">부장 · 총무 · 회계 — 매월 마지막 주 · PC</div>${mob ? '' : '<button class="btn s" data-go="monthly">월간 보고서 열기</button>'}</div></div>
    <div class="step"><div><h3>가끔: 통계와 공지</h3><p><b>출석 통계</b>에서 주별 추이와 4주 연속 결석자를 봅니다(심방·연말 제적 정리에 씁니다). <b>메인</b>의 공지는 부서 교사들에게, 교육위원회 공지는 모든 부서에 보입니다.</p><div class="who">부장 · 교역자</div><button class="btn s" data-go="stats">출석 통계 열기</button></div></div>
    `}
  </div>
  <div class="card" style="margin-top:14px"><h2>변환 자료의 "!" 표시</h2><div class="note">HWP·엑셀에서 옮기면서 숫자가 안 맞거나 확인이 필요한 항목에는 <span class="tag flag">!</span>가 붙어 있습니다. 마우스를 올리면 내용이 보이고, 열어서 "확인했음"을 누르면 표시가 사라집니다.</div></div>`;
};

/* ───────────── 시작 ───────────── */
backend.onSession(async d => {
  if (d) { S.user = d; S.dept = d === 'committee' ? null : d; }
  else { S.user = null; S.dept = null; }
  await render();
});
window.addEventListener('error', e => { const t = $('#toast'); if (t) toast('오류: ' + e.message, 4000); });
