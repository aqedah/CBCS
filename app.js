/* CBCS — 중앙성서교회 교육부 보고서·출결·회계 (GitHub Pages + Firebase) */

/* ───────────── 공통 ───────────── */
const YEAR = window.CBCS_YEAR || new Date().getFullYear();
const DEPTS = window.CBCS_DEPT_NAMES || { kinder:'영유치부', elem:'초등부', youth:'중고등부', young:'청년부' };
const ACCOUNTS = window.CBCS_ACCOUNTS || { kinder:'kinder', elem:'elem', youth:'youth', young:'young', committee:'committee' };
const deptOfAccount = local => Object.keys(ACCOUNTS).find(k => ACCOUNTS[k] === local) || null;
const QS = new URLSearchParams(location.search);
const DEMO = QS.has('demo'); // 체험 모드: 가상 자료(demo-data.js)만 쓰고 실제 서버에는 접속하지 않음
const MOCK = QS.has('mock') || DEMO;
const $ = s => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10);
const DEL = Symbol('delete-field'); // backend.update에서 칸 지우기
const won = n => (Number(n) || 0).toLocaleString('ko-KR');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const DAYS = ['일','월','화','수','목','금','토'];
const fmtK = d => { if (!d) return ''; const [y,m,dd] = d.split('-'); return `${y}년 ${+m}월 ${+dd}일 (${DAYS[new Date(d+'T00:00:00').getDay()]})`; };
const today = () => { if (DEMO) return '2026-10-12'; const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const ym = d => (d || '').slice(0, 7);
const pad2 = n => String(n).padStart(2, '0');
function sundaysOf(y, m) { const r = []; const d = new Date(y, m-1, 1); while (d.getMonth() === m-1) { if (d.getDay() === 0) r.push(`${y}-${pad2(m)}-${pad2(d.getDate())}`); d.setDate(d.getDate()+1); } return r; }
function weekIndex(date) { const [y,m] = date.split('-').map(Number); const i = sundaysOf(y,m).indexOf(date); return i >= 0 ? i+1 : Math.ceil(Number(date.slice(8))/7); }
function lastSunday() { if (DEMO) return '2026-10-11'; const d = new Date(); d.setDate(d.getDate()-d.getDay()); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function nextMonth(m) { const [y,mm] = m.split('-').map(Number); const d = new Date(y, mm, 1); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`; }
function prevMonth(m) { const [y,mm] = m.split('-').map(Number); const d = new Date(y, mm-2, 1); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`; }
let toastT; function toast(m, ms = 2200) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms); }
const isMobile = () => matchMedia('(max-width:760px)').matches;
function openModal(html) { $('#modal-box').innerHTML = html; $('#modal').hidden = false; $('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); }; const c = $('#modal-close'); if (c) c.onclick = closeModal; }
function closeModal() { $('#modal').hidden = true; $('#modal-box').innerHTML = ''; }

/* ───────────── 데이터 계층 ───────────── */
let fb = null;
const backend = MOCK ? mockBackend() : await firebaseBackend();
// 쓰기 결과 기록: "저장"을 눌렀을 때 실제로 서버 저장이 성공했는지 보고 미저장 표시를 푼다
backend._raw = {}; // 시험에서 쓰기 실패를 흉내 낼 때 여기를 바꾼다
['set', 'setMerge', 'update', 'del', 'batchSet', 'list', 'get'].forEach(k => { const f = backend[k]; if (typeof f !== 'function') return; backend._raw[k] = f; if (k === 'list' || k === 'get') { backend[k] = (...a) => backend._raw[k].apply(backend, a); return; } backend[k] = async (...a) => { S.writes.pending++; try { const r = await backend._raw[k].apply(backend, a); S.writes.ok++; return r; } catch (e) { S.writes.err++; throw e; } finally { S.writes.pending--; } }; });

async function firebaseBackend() {
  const FB = 'https://www.gstatic.com/firebasejs/10.14.1/';
  const [{ initializeApp }, { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged }, { getFirestore, doc, getDoc, setDoc, updateDoc, deleteField, FieldPath, deleteDoc, collection, getDocs, writeBatch }] = await Promise.all([import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-firestore.js')]);
  // 한 기기에서 여러 부서 계정을 함께 로그인해 둘 수 있다(초등부 교사 + 교육위원회 임원 등). 부서마다 따로 로그인 상태를 둔다.
  const cfg = window.CBCS_FIREBASE; const base = initializeApp(cfg);
  const mk = app => ({ app, auth: getAuth(app), db: getFirestore(app) });
  const baseSlot = mk(base); const slots = {}; const named = {};
  const deptOfUser = u => u ? deptOfAccount((u.email || '').split('@')[0]) : null;
  const ready = a => a.authStateReady ? a.authStateReady() : new Promise(ok => { const off = onAuthStateChanged(a, () => { off(); ok(); }); });
  const slotFor = d => named[d] || (named[d] = mk(initializeApp(cfg, 'cbcs-' + d)));
  let saved = []; try { saved = JSON.parse(localStorage.getItem('cbcs-sessions') || '[]'); } catch (e) {}
  let active = null; try { active = localStorage.getItem('cbcs-active'); } catch (e) {}
  await ready(baseSlot.auth); { const d = deptOfUser(baseSlot.auth.currentUser); if (d) slots[d] = baseSlot; else if (baseSlot.auth.currentUser) await signOut(baseSlot.auth); }
  await Promise.all(saved.filter(d => ACCOUNTS[d] && !slots[d]).map(async d => { const sl = slotFor(d); await ready(sl.auth); if (deptOfUser(sl.auth.currentUser) === d) slots[d] = sl; }));
  const persist = () => { try { localStorage.setItem('cbcs-sessions', JSON.stringify(Object.keys(slots))); if (active) localStorage.setItem('cbcs-active', active); else localStorage.removeItem('cbcs-active'); } catch (e) {} };
  if (!slots[active]) active = Object.keys(slots)[0] || null; persist();
  const cur = () => slots[active] || baseSlot;
  fb = { get auth() { return cur().auth; }, get db() { return cur().db; } };
  const emailOf = d => `${ACCOUNTS[d] || d}@${window.CBCS_EMAIL_DOMAIN}`;
  const ref = p => doc(cur().db, ...p.split('/'));
  return {
    async login(d, pw) {
      const baseFree = !Object.values(slots).includes(baseSlot) && !baseSlot.auth.currentUser;
      const sl = slots[d] || (baseFree ? baseSlot : slotFor(d));
      await signInWithEmailAndPassword(sl.auth, emailOf(d), pw); slots[d] = sl; active = d; persist(); return d;
    },
    sessions() { return Object.keys(slots).filter(d => slots[d].auth.currentUser); },
    current() { return active; },
    switchTo(d) { if (!slots[d] || !slots[d].auth.currentUser) return false; active = d; persist(); return true; },
    async logoutOne(d) { const sl = slots[d]; if (sl) { await signOut(sl.auth); delete slots[d]; } if (active === d) active = Object.keys(slots)[0] || null; persist(); return active; },
    async logout() { for (const d of Object.keys(slots)) { await signOut(slots[d].auth); delete slots[d]; } active = null; persist(); },
    onSession(cb) { cb(active); },
    async get(p) { const s = await getDoc(ref(p)); return s.exists() ? s.data() : null; },
    async set(p, data) { await setDoc(ref(p), data); },
    async setMerge(p, data) { await setDoc(ref(p), data, { merge: true }); }, // 있는 칸은 남기고 합친다(지도형 칸은 안쪽까지)
    // 바뀐 칸만 고친다: changes = [[['att','학생id'], 값 또는 DEL], ...] — 다른 사람이 동시에 고친 다른 칸을 덮어쓰지 않음
    async update(p, changes) { const args = changes.flatMap(([path, v]) => [new FieldPath(...path), v === DEL ? deleteField() : v]); await updateDoc(ref(p), ...args); },
    async del(p) { await deleteDoc(ref(p)); },
    async list(p) { const s = await getDocs(collection(cur().db, ...p.split('/'))); return s.docs.map(x => ({ _id: x.id, ...x.data() })); },
    async batchSet(items, progress) { // items: [{path, data}]
      for (let i = 0; i < items.length; i += 400) {
        const b = writeBatch(cur().db); items.slice(i, i+400).forEach(it => b.set(ref(it.path), it.data)); await b.commit();
        if (progress) progress(Math.min(i+400, items.length), items.length);
      }
    }
  };
}
function mockBackend() { // 로컬 시험용: data/import_data.json을 읽어 메모리에서 동작, localStorage에 저장
  let store = {}; const KEY = DEMO ? 'cbcs-demo-store' : 'cbcs-mock-store'; const SKEY = DEMO ? 'cbcs-demo-session' : 'cbcs-mock-session';
  try { store = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} };
  let session = null, mockList = []; try { session = localStorage.getItem(SKEY); mockList = JSON.parse(localStorage.getItem(SKEY + 's') || '[]'); } catch (e) {}
  const seeded = (async () => { if (Object.keys(store).length) return; try { let payload; if (DEMO) payload = (await import('./demo-data.js')).default; else { const r = await fetch('data/import_data.json'); if (!r.ok) return; payload = await r.json(); } payloadToItems(payload, { students: 1, reports: 1, money: 1, plan: 1, sch: 1, arch: 1 }).forEach(it => { store[it.path] = it.data; }); save(); } catch (e) { console.warn('mock seed 실패', e); } })();
  return {
    async login(d) { await seeded; session = d; mockList = [...new Set([...mockList, d])]; try { localStorage.setItem(SKEY, d); localStorage.setItem(SKEY + 's', JSON.stringify(mockList)); } catch (e) {} return d; },
    sessions() { return session ? [...new Set([...mockList, session])] : []; },
    current() { return session; },
    switchTo(d) { if (!this.sessions().includes(d)) return false; session = d; try { localStorage.setItem(SKEY, d); } catch (e) {} return true; },
    async logoutOne(d) { mockList = mockList.filter(x => x !== d); if (session === d) session = mockList[0] || null; try { localStorage.setItem(SKEY + 's', JSON.stringify(mockList)); if (session) localStorage.setItem(SKEY, session); else localStorage.removeItem(SKEY); } catch (e) {} return session; },
    async logout() { session = null; mockList = []; try { localStorage.removeItem(SKEY); localStorage.removeItem(SKEY + 's'); } catch (e) {} },
    reset() { try { localStorage.removeItem(KEY); localStorage.removeItem(SKEY); } catch (e) {} },
    onSession(cb) { seeded.then(() => cb(session)); },
    async get(p) { return store[p] ? JSON.parse(JSON.stringify(store[p])) : null; },
    async set(p, data) { store[p] = JSON.parse(JSON.stringify(data)); save(); },
    async setMerge(p, data) { const deep = (a, b) => { Object.entries(b).forEach(([k, v]) => { if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) deep(a[k], v); else a[k] = JSON.parse(JSON.stringify(v)); }); return a; }; store[p] = deep(store[p] || {}, data); save(); },
    async update(p, changes) { const o = store[p]; if (!o) throw new Error('not-found'); changes.forEach(([path, v]) => { let t = o; path.slice(0, -1).forEach(k => { t = t[k] = t[k] && typeof t[k] === 'object' ? t[k] : {}; }); const k = path[path.length - 1]; if (v === DEL) delete t[k]; else t[k] = JSON.parse(JSON.stringify(v)); }); save(); },
    async del(p) { delete store[p]; save(); },
    async list(p) { const pre = p + '/'; return Object.keys(store).filter(k => k.startsWith(pre) && !k.slice(pre.length).includes('/')).map(k => ({ _id: k.slice(pre.length), ...JSON.parse(JSON.stringify(store[k])) })); },
    async batchSet(items, progress) { items.forEach(it => { store[it.path] = it.data; }); save(); if (progress) progress(items.length, items.length); }
  };
}

/* 세션·캐시 */
const S = { user: null, dept: null, data: {}, committee: null, view: 'home', sub: {}, loaded: false }; window.CBCS = S;
S.writes = { ok: 0, err: 0, pending: 0 }; // 쓰기 결과 기록(아래 backend 감싸기와 함께 씀)
const isCommittee = () => S.user === 'committee';
const isCare = () => !!(S.careKey && S.careDept === S.dept); // 부서 관리자 모드(심방 카드 열림) — 비밀번호로 만든 열쇠가 메모리에만 있음
const canEdit = () => !isMobile();
async function loadDept(d, force) {
  if (S.data[d] && !force) return S.data[d];
  const young = d === 'young';
  const [docu, students, reports, expenses, incomes, events, notices, assets, officers, timeline, retreats, care] = await Promise.all([
    backend.get(`depts/${d}`), backend.list(`depts/${d}/students`), backend.list(`depts/${d}/reports`),
    backend.list(`depts/${d}/expenses`), backend.list(`depts/${d}/incomes`), backend.list(`depts/${d}/events`), backend.list(`depts/${d}/notices`), backend.list(`depts/${d}/assets`),
    young ? backend.list(`depts/${d}/officers`) : [], backend.list(`depts/${d}/timeline`), young ? backend.list(`depts/${d}/retreats`) : [],
    isCommittee() ? [] : backend.list(`depts/${d}/care`).catch(() => [])]);
  const dd = { id: d, doc: docu || { name: DEPTS[d], classLabel: '반', year: YEAR, classes: [], staff: [], ledgers: [], budgetPlan: [], monthlyPlans: {}, monthlyTexts: {}, notes: {} },
    students, reports: Object.fromEntries(reports.map(r => [r.date, r])), expenses, incomes, events, notices, assets: assets.map(a => ({ ...a, id: a.id || a._id })), officers: officers.map(o => ({ ...o, role: canonRole(o.role) })), timeline, retreats, careRaw: care, care: [] };
  if (d === 'young') dd.doc.classLabel = youngUnit(YEAR); // 청년부 소속 단위: 2026년까지 팸, 2027년부터 목장
  if (S.careKey && S.careDept === d) await decryptCare(dd);
  dd.doc.ledgers = dd.doc.ledgers || []; dd.doc.classes = dd.doc.classes || []; dd.doc.staff = dd.doc.staff || []; dd.doc.budgetPlan = dd.doc.budgetPlan || []; dd.doc.monthlyPlans = dd.doc.monthlyPlans || {}; dd.doc.monthlyTexts = dd.doc.monthlyTexts || {}; dd.doc.notes = dd.doc.notes || {};
  Object.keys(dd.reports).forEach(k => { dd.reports[k] = { ...blankReport(dd, k), ...dd.reports[k] }; }); // 빠진 칸은 빈 양식 값으로 채워 보이기만 한다(저장하지 않음)
  dd.reportBase = clone(dd.reports); // 저장할 때 무엇이 바뀌었는지 비교할 기준(서버에서 읽은 그대로)
  dd.students.forEach(normalizeFaith); // 화면에만 정리된 값으로 보인다 — 열람만으로는 저장하지 않는다(학생 카드에서 저장할 때 함께 저장됨)
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
  const st = dd.students.filter(inRoll);
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
// 학생 상태: 재적·새친구·장기결석·제적과, 재적은 유지하되 잠시 못 나오는 사정(군입대·학업·사업·직접 입력)
const STATUS_OPTS = [['active', '재적'], ['newcomer', '새친구'], ['longabsent', '장기결석'], ['military', '군입대'], ['study', '학업'], ['business', '사업'], ['custom', '직접 입력'], ['left', '제적'], ['archived', '보관']];
const AWAY = ['longabsent', 'military', 'study', 'business', 'custom'];
const PAUSE = ['military', 'study', 'business', 'custom']; // 정지: 군입대·학업·사업 등으로 잠시 쉬는 회원 (장기결석과 따로 본다)
const inRoll = s => (s.status === 'active' || AWAY.includes(s.status)) && !isGrad(s) && !(isYoungStu(s) && s.group === '팸장');
const statusName = s => s.status === 'left' && s.archived ? '보관' : statusName0(s);
const statusName0 = s => (S.data && S.data.young && isYoungStu(s) && isFamStaff(S.data.young, s) && (isGrad(s) || s.status === 'left' || s.group === '팸장')) ? '팸장' : isGrad(s) ? `자격 종료(${s.married ? '결혼' : s.churchRole ? '직분' : s.leftKind || '졸업'})` : isYoungStu(s) && s.group === '팸장' && s.status !== 'left' ? '팸장' : s.status === 'custom' ? (s.statusText || '기타') : (Object.fromEntries(STATUS_OPTS)[s.status] || s.status || '');
const statusPill = s => `<span class="pill ${isGrad(s) || (isYoungStu(s) && (s.group === '팸장' || statusName(s) === '팸장')) ? 'info' : s.status === 'active' ? 'ok' : s.status === 'newcomer' ? 'info' : AWAY.includes(s.status) ? 'warn' : 'mute'}">${esc(statusName(s))}</span>`;
const activeStudents = dd => dd.students.filter(inRoll);
// 교사·임원 표시 순서: 교역자 → 부장 → 부감 → 회장 → 부회장 → 총무 → 서기 → 회계 → 부총무 등 → 팀장 → 팸장 → 담임·보조 → 나머지 (같은 순위면 등록 순서)
// 교사·임원 표시 순서(모든 화면, 표기상 순서일 뿐 — 교역자와 부장·부감은 협력 관계): 교역자 → 부장 → 부감 → 교사(팸장·담임·보조 등) → 임원(회장·부회장·총무·서기·회계, 부임원) → 팀장(사역팀) · 같은 자리면 등록 순서
const STAFF_GROUPS = ['교역자', '부장', '부감', '교사', '임원', '팀장'];
const OFFICER_SEQ = ['회장', '부회장', '총무', '서기', '회계', '부총무', '부서기', '부회계'];
function staffGroup(part) { const r = String(part || '').trim(); if (/교역자|목사|전도사|디렉터/.test(r)) return 0; if (/^부장/.test(r)) return 1; if (/^부감/.test(r)) return 2; if (/^임원/.test(r) || OFFICER_SEQ.includes(r)) return 4; if (/팀장|리더|인도자/.test(r)) return 5; return 3; }
const staffRank = t => { const parts = String(t.role || '').split(/[,·\/]/).map(x => x.trim()).filter(Boolean); if (!parts.length) return [3, 99]; const g = Math.min(...parts.map(staffGroup)); const p = parts.find(x => staffGroup(x) === g) || ''; const sub = g === 4 ? OFFICER_SEQ.indexOf(p) : g === 3 ? (/^팸장|^담임/.test(p) ? 0 : /^부팸장/.test(p) ? 1 : /보조/.test(p) ? 3 : 2) : 0; return [g, sub < 0 ? 50 : sub]; };
const staffCmp = (a, b) => { const x = staffRank(a), y = staffRank(b); return x[0] - y[0] || x[1] - y[1]; };
const visibleStaff = dd => dd.doc.staff.filter(t => t.status !== 'left').map((t, i) => [t, i]).sort((a, b) => staffCmp(a[0], b[0]) || a[1] - b[1]).map(x => x[0]);
const sName = (dd, sid) => { const s = dd.students.find(x => x.id === sid); return s ? s.name : sid; };
const classOf = (dd, s) => dd.doc.classes.find(c => c.id === s.classId);
const classStudents = (dd, cid) => activeStudents(dd).filter(s => s.classId === cid);
// 신급 보기: 빈값은 '모름'(아직 확인 안 함), '없음'은 신급이 없음(세례교인 아님). 출석부·총회자료 공통
const FAITH_OPTS = ['', '없음', '유아세례', '학습', '세례', '입교'];
const faithOptions = s => { const cur = s.faith === '모름' || s.faith === '미정' ? '' : (s.faith || ''); return FAITH_OPTS.map(k => `<option value="${esc(k)}" ${cur === k ? 'selected' : ''}>${k || '모름'}</option>`).join('') + (FAITH_OPTS.includes(cur) ? '' : `<option selected>${esc(cur)}</option>`); };
// 교회 직분 (청년부 회원 자격 판정: 직분자는 회원 아님 — 회칙 4조)
const CHURCH_ROLES = ['서리집사', '안수집사', '권사', '명예권사', '시무장로', '은퇴장로', '원로장로', '교육전도사', '부목사', '담임목사'];
const churchRoleOptions = cur => `<option value="">없음</option>${CHURCH_ROLES.map(k => `<option ${cur === k ? 'selected' : ''}>${k}</option>`).join('')}${cur && !CHURCH_ROLES.includes(cur) ? `<option selected>${esc(cur)}</option>` : ''}`;
const NOTE_TAGS = ['학습대상자', '세례대상자', '입교대상자', '어린이세례(타교단)'];
// 신급 칸 정리: 신급에는 없음·모름·유아세례·학습·입교·세례만 둔다. "학습대상"·"?" 같은 값과 연도 표기는 비고로 옮긴다.
function normalizeFaith(s) {
  const raw = String(s.faith || '').trim(); if (!raw || FAITH_OPTS.includes(raw)) return false;
  if (raw === '모름' || raw === '미정') { s.faith = ''; return true; }
  const yr = raw.match(/\(?\s*(\d{2}|\d{4})\s*(상|하)?\s*\)?\s*$/);
  let base = '', tag = '';
  if (/어린이\s*세례/.test(raw)) { tag = '어린이세례(타교단)'; }
  else if (/^[?？\s]*$|확인\s*필요/.test(raw)) { tag = '신급 확인 필요'; }
  else if (/^미\s*대상/.test(raw)) { tag = `신급 기록: ${raw}`; }
  else if (/타\s*(교회|교단)/.test(raw)) { base = /유아\s*세례/.test(raw) ? '유아세례' : /입교/.test(raw) ? '입교' : /세례/.test(raw) ? '세례' : /학습/.test(raw) ? '학습' : ''; tag = raw.replace(/^(유아\s*세례|세례|입교|학습)\s*[(（]\s*(타\s*(?:교회|교단))\s*[)）]$/, '$1($2)'); }
  else if (/대상/.test(raw)) { base = ''; tag = /입교\s*대상/.test(raw) ? '입교대상자' : /학습\s*대상/.test(raw) ? '학습대상자' : /세례\s*대상/.test(raw) ? '세례대상자' : '학습대상자'; if (/유아세례/.test(raw)) base = '유아세례'; }
  else if (/유아\s*세례/.test(raw)) base = '유아세례';
  else if (/입교/.test(raw)) base = '입교';
  else if (/세례/.test(raw)) base = '세례';
  else if (/학습/.test(raw)) base = '학습';
  else if (/없음/.test(raw)) base = '없음';
  if (!tag && base && yr && !s.faithYear) { const y = yr[1].length === 2 ? 2000 + +yr[1] : +yr[1]; s.faithYear = y; if (yr[2]) s.faithHalf = yr[2]; }
  else if (!tag && !(base && raw.replace(/\s+/g, '') === base)) tag = /^[?？]+$/.test(raw) ? '신급 확인 필요' : !base ? `신급 기록: ${raw}` : (yr ? '' : `신급 기록: ${raw}`);
  s.faith = base; s.faithRaw = s.faithRaw || raw;
  if (tag) { const parts = String(s.note || '').split(/\s*[,，]\s*/).filter(Boolean); if (!parts.includes(tag)) s.note = [...parts, tag].join(', '); }
  return true;
}
const noteTagsHTML = inputId => `<div class="tags" style="margin-top:4px">${NOTE_TAGS.map(t => `<button type="button" class="btn s" data-notetag="${esc(inputId)}" data-tag="${esc(t)}">+ ${t}</button>`).join(' ')}</div>`;
const bindNoteTags = () => document.querySelectorAll('[data-notetag]').forEach(b => b.onclick = () => { const el = document.getElementById(b.dataset.notetag); if (!el) return; const parts = el.value.split(/[,，]\s*/).map(x => x.trim()).filter(Boolean); if (parts.includes(b.dataset.tag)) return; parts.push(b.dataset.tag); el.value = parts.join(', '); el.dispatchEvent(new Event('input')); });
const faithLabel = s => { if (!s.faith) return ''; const y = s.faithYear ? String(s.faithYear).slice(-2) + (s.faithHalf || '') : ''; return y ? `${s.faith}(${y})` : s.faith; };
const phoneLabel = s => s.phone ? `${s.phone} (본인)` : s.guardianPhone ? `${s.guardianPhone} (${s.guardianRel || '보호자'})` : '';
const youngUnit = y => +y >= 2027 ? '목장' : '팸';
const isUnited = r => !!(r.united || /세대통합/.test(r.type || ''));

/* ───────────── 화면 뼈대 ───────────── */
// PC 메뉴 순서: 출석부 · 계획서 · 보고서 · 회계 · 물품대장 · (청년부) 회칙·총회 · DB · 사용 안내
const NAV_PC = [['home','메인','⌂'],['roster','출석부','☰'],['plan','계획서','▦'],['weekly','보고서','✎'],['ledger','회계','₩'],['assets','물품대장','▢'],['archive','DB','▣'],['tutorial','사용 안내','?']];
const NAV_MOBILE = [['home','홈'],['attend','출결'],['ledger','회계'],['reports','보고서'],['tutorial','안내']];
// 휴대폰: 출석부(출석 체크·명단·통계), 회계(열람·영수증)는 위쪽 탭으로 나눈다
const M_ROSTER_TABS = [['attend', '출석 체크'], ['members', '명단'], ['stats', '통계']];
const M_MONEY_TABS = [['ledger', '회계 열람'], ['receipt', '영수증']];
const NAV_COMMITTEE = [['home','메인','⌂'],['roster','출석부 열람','☰'],['plan','계획서','▦'],['reports','보고서 열람','✎'],['assets','물품대장 열람','▢'],['archive','DB','▣'],['tutorial','사용 안내','?']];
const NAV_COMMITTEE_MOBILE = [['home','메인'],['reports','보고서'],['scholarship','장학'],['tutorial','안내']];
const VIEWS = {}, BIND = {};
// 메뉴 묶음: 사이드 메뉴에서 누르면 아래로 펼쳐지는 하위 메뉴 (휴대폰은 화면 위 탭)
const DOC_TABS = () => [[isCommittee() || isMobile() ? 'reports' : 'weekly', '주일 보고서'], ['monthly', '월간 보고서'], ['meetings', isCommittee() ? '회의록' : meetLabel(S.dept)], ['plan', '연간계획서']];
// 계획서 묶음: 연간계획서 + 주말학습계획서(행사별 계획) + 차량 신청(주말학습계획서 첨부 1)
const PLAN_TABS = () => [['plan', '연간계획서'], ['outings', '주말학습'], ['vehicles', '차량 신청']];
const REPORT_TABS = () => [[isCommittee() ? 'reports' : 'weekly', '주일 보고서'], ['monthly', '월간 보고서'], ['meetings', isCommittee() ? '회의록' : meetLabel(S.dept)]];
// DB 묶음: 쌓아 두는 자료 — 보관함(지난 문서), 교육위원회는 장학·백업·복원까지
const DB_TABS = () => [['archive', '보관함'], ...(isCommittee() ? [['scholarship', '장학'], ['backup', '백업·복원']] : [])];
const YOUNG_TABS = () => [['bylaws', '회칙·헌장'], ['assembly', '총회 자료'], ['minutes', '총회 회의록']];
const ROSTER_TABS = () => [['roster', isCommittee() ? '출석부 열람' : '출석부'], ['attlog', '출석 기록'], ...(isCommittee() ? [] : [['stats', '출석 통계']]), ...(isCommittee() ? [] : [['care', isCare() ? '♥ 심방 카드' : '🔒 심방 카드']])];
const NAV_GROUPS = () => isMobile() ? (isCommittee() ? [{ id: 'docs', items: DOC_TABS() }] : [{ id: 'docs', items: DOC_TABS() }, { id: 'mroster', items: M_ROSTER_TABS }, { id: 'mmoney', items: M_MONEY_TABS }]) : [{ id: 'roster', items: ROSTER_TABS() }, { id: 'plans', items: PLAN_TABS() }, { id: 'docs', items: REPORT_TABS() }, { id: 'young', items: YOUNG_TABS() }, ...(DB_TABS().length > 1 ? [{ id: 'db', items: DB_TABS() }] : [])];
const groupOfView = v => NAV_GROUPS().find(g => g.items.some(t => t[0] === v));
const navKeyOf = v => { const g = groupOfView(v); return g ? g.items[0][0] : v; };
const docTabBar = () => { const g = groupOfView(S.view); return g ? `<div class="doc-tabs no-print">${g.items.map(([k, l]) => `<button data-doctab="${esc(k)}" class="${S.view === k ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''; };
S.navOpen = {};
function navButton(n) {
  const g = NAV_GROUPS().find(x => x.items[0][0] === n[0]);
  if (!g) return `<button data-nav="${n[0]}" class="${navKeyOf(S.view) === n[0] ? 'on' : ''}"><span class="k">${n[2] || ''}</span>${n[1]}</button>`;
  const inside = g.items.some(t => t[0] === S.view); const open = S.navOpen[g.id] ?? inside;
  return `<button data-navgroup="${esc(g.id)}" class="grp ${inside ? 'in' : ''} ${open ? 'open' : ''}"><span class="k">${n[2] || ''}</span>${n[1]}<span class="caret">${open ? '▴' : '▾'}</span></button>${open ? `<div class="sub-nav">${g.items.map(([k, l]) => `<button data-nav="${esc(k)}" class="${S.view === k ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}`;
}
const FOOTER = `<footer class="foot"><p>🔒 모든 자료는 교육부 전용 데이터베이스(Google Firebase)에 보관되며, 부서 비밀번호로 로그인한 사람만 볼 수 있습니다. 교회 밖에 공개하거나 넘기지 않습니다.</p><p>제작자: 이삭 목사 · 중앙성서교회</p></footer>`;

// 같은 화면에서 저장·복적처럼 고친 뒤 다시 그릴 때는 보던 위치를 그대로 둔다
const renderHere = () => { S.keepScroll = window.scrollY; return render(); };
/* 저장하지 않고 떠나기 경고: 저장 단추가 있는 작성 화면(보고서·월간·계획서·회칙 본문·주말학습·차량 등)에서
   글을 고친 뒤 저장하지 않고 다른 메뉴로 가거나 창을 닫으려 하면 한 번 묻는다. 바로 저장되는 칸(출석 체크 등)은 해당 없음. */
const PAGE_SAVES = ['a-save', 'w-save', 'm-save', 'pl-save', 'bt-save', 'ot-save', 'vh-save', 'mn-save', 'as-save'];
S.dirty = false;
function trackDirty() {
  if (!(S.dirty === 'saving' && S.writes.pending)) S.dirty = false; const main = document.querySelector('.main'); if (!main) return;
  if (!PAGE_SAVES.some(id => document.getElementById(id))) return;
  main.addEventListener('input', e => { if (!e.target.closest('.modal') && e.target.matches('input:not([type=file]):not([type=checkbox]), textarea, select')) S.dirty = true; });
  // 저장 단추: 누르는 순간이 아니라, 서버 저장이 실제로 성공한 뒤에 미저장 표시를 푼다. 실패하면 그대로 남는다
  PAGE_SAVES.forEach(id => { const b = document.getElementById(id); if (b) b.addEventListener('click', () => { if (!S.dirty) return; const ok0 = S.writes.ok, err0 = S.writes.err; S.dirty = 'saving'; let n = 0;
    const tick = () => { if (S.dirty !== 'saving') return; if (S.writes.err > err0) { S.dirty = true; return; } if (S.writes.ok > ok0 && !S.writes.pending) { S.dirty = false; return; } if (++n < 100) setTimeout(tick, 200); else S.dirty = true; }; setTimeout(tick, 200); }, true); });
}
function leaveOk(fn) {
  if (!S.dirty) return fn();
  // 바로 저장 중(결석 사유 등)이면 끝날 때까지 잠깐 기다렸다가 다시 판단한다
  if (S.dirty === 'saving') { let n = 0; const w = () => { if (S.dirty !== 'saving' || ++n > 25) return leaveOk(fn); setTimeout(w, 200); }; return setTimeout(w, 200); }
  openModal(`<h2>저장하지 않은 내용<button class="btn s" id="modal-close">닫기</button></h2><p>이 화면에서 고친 내용을 아직 저장하지 않았습니다. 저장하지 않고 이동하면 고친 내용이 사라집니다.</p><div class="row"><button class="btn" id="lv-stay">머물기</button><button class="btn d" id="lv-go">저장 안 하고 이동</button></div>`);
  $('#modal-close').onclick = closeModal; $('#lv-stay').onclick = closeModal; $('#lv-go').onclick = () => { closeModal(); S.dirty = false; fn(); };
}
window.addEventListener('beforeunload', e => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });
async function render() {
  const root = $('#root');
  if (!S.user) { root.innerHTML = loginView(); bindLogin(); return; }
  const mob = isMobile();
  let nav = isCommittee() ? (mob ? NAV_COMMITTEE_MOBILE : NAV_COMMITTEE) : (mob ? NAV_MOBILE : NAV_PC);
  if (!mob && (S.dept === 'young' || isCommittee())) { const at = nav.findIndex(n => n[0] === 'archive'); nav = [...nav.slice(0, at), ['bylaws', isCommittee() ? '청년부 회칙·총회' : '회칙·총회', '§'], ...nav.slice(at)]; }
  if (!nav.some(n => n[0] === navKeyOf(S.view)) && !(S.view && VIEWS[S.view] && (S.sub.print || S.keepView))) S.view = 'home';
  let body = '';
  try { await loadCommittee(); if (S.dept) await loadDept(S.dept); body = await (VIEWS[S.view] ? VIEWS[S.view]() : ''); if (mob && groupOfView(S.view)) body = docTabBar() + body; } catch (e) { console.error(e); body = `<div class="hint">화면을 그리는 중 문제가 생겼습니다: ${esc(e.message)}</div>`; }
  root.innerHTML = `<div class="app ${mob ? 'ro' : ''}">
    <aside class="side">
      <div class="brand">CBCS<small>중앙성서교회 교육부</small></div>
      <div class="dept-chip"><button class="who" data-account title="로그인 정보 · 다른 부서로 옮기기"><b>${esc(acctName(S.user))}</b>${isCare() ? ' <span class="pill info">관리자 모드</span>' : ''}<span class="sw">${backend.sessions().length > 1 ? `⇄ ${backend.sessions().length}개 부서` : '부서 바꾸기 ▾'}</span></button><button class="btn s" data-logout>나가기</button></div>
      ${!isCommittee() && !mob ? (isCare() ? `<button class="btn s" id="admin-off" style="margin:0 0 8px">관리자 모드 끝내기</button>` : `<button class="btn s" id="admin-mode" style="margin:0 0 8px">🔒 관리자 모드</button>`) : ''}
      <nav class="nav">${nav.filter(n => n[0] === 'home').map(n => `<button data-nav="home" class="home ${S.view === 'home' ? 'on' : ''}"><span class="k">${n[2] || '⌂'}</span>${n[1]}</button>`).join('')}
      <div class="nav-sep"></div>
      ${nav.filter(n => n[0] !== 'home' && n[0] !== 'import').map(navButton).join('')}
      <div class="nav-bottom"><div class="sec">${DEMO ? '체험 모드 (가상 자료)' : MOCK ? '시험 모드 (로컬)' : 'CBCS · ' + YEAR}</div>
      ${nav.filter(n => n[0] === 'import').map(n => `<button data-nav="import" class="${S.view === 'import' ? 'on' : ''}"><span class="k">⇪</span>${n[1]}</button>`).join('')}
      <button data-refresh><span class="k">↻</span>새로고침</button></div></nav>
      ${FOOTER}
    </aside>
    <main class="main" id="main">${DEMO ? `<div class="demo-bar no-print"><b>체험 모드</b> · 모든 이름과 숫자는 가상입니다. 바꾼 내용은 이 브라우저에만 저장됩니다.<span style="flex:1"></span><button class="btn s" data-tour>튜토리얼</button><button class="btn s" data-demo-reset>체험 자료 초기화</button></div>` : ''}${body}<div class="main-foot">${FOOTER}</div></main>
    <nav class="mobile-nav">${nav.map(n => `<button data-nav="${n[0]}" class="${navKeyOf(S.view) === n[0] ? 'on' : ''}">${n[1]}</button>`).join('')}<button data-account>${esc(acctShort(S.user))} ⇄</button></nav>
  </div>`;
  const go = v => leaveOk(() => go0(v)); const go0 = v => { const same = groupOfView(v) && groupOfView(v) === groupOfView(S.view); const keep = same && S.sub.dept ? { dept: S.sub.dept } : {}; S.view = v; S.sub = keep; S.navOpen = {}; render(); };
  root.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => go(b.dataset.nav));
  root.querySelectorAll('[data-navgroup]').forEach(b => b.onclick = () => { const g = NAV_GROUPS().find(x => x.id === b.dataset.navgroup); const inside = g.items.some(t => t[0] === S.view); const open = S.navOpen[g.id] ?? inside; if (!open && !inside) go(g.items[0][0]); else { S.navOpen = { [g.id]: !open }; render(); } });
  root.querySelectorAll('[data-doctab]').forEach(b => b.onclick = () => go(b.dataset.doctab));
  root.querySelectorAll('[data-logout]').forEach(b => b.onclick = async () => { const others = backend.sessions().filter(d => d !== S.user); if (others.length) { accountDialog(); return; } await backend.logout(); enterAccount(null); });
  root.querySelectorAll('[data-account]').forEach(b => b.onclick = () => accountDialog());
  const am = $('#admin-mode'); if (am) am.onclick = () => adminModeDialog(D());
  const ao = $('#admin-off'); if (ao) ao.onclick = () => { S.careKey = null; S.careDept = null; if (D()) D().care = []; if (S.view === 'care') S.view = 'roster'; render(); toast('관리자 모드를 끝냈습니다'); };
  const rf = root.querySelector('[data-refresh]'); if (rf) rf.onclick = async () => { S.data = {}; S.committee = null; toast('다시 불러오는 중…'); await render(); toast('새로고침 완료'); };
  root.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { S.view = b.dataset.go; S.sub = b.dataset.sub ? JSON.parse(b.dataset.sub) : {}; render(); });
  if (BIND[S.view]) { try { BIND[S.view](); } catch (e) { console.error(e); } }
  root.querySelectorAll('[data-tour]').forEach(b => b.onclick = () => startTour());
  root.querySelectorAll('[data-demo-reset]').forEach(b => b.onclick = () => { backend.reset(); location.href = location.pathname + '?demo=1'; });
  if (S.keepScroll != null) { const y = S.keepScroll; S.keepScroll = null; window.scrollTo(0, y); } else window.scrollTo(0, 0);
  trackDirty();
  if (window.CBCS_TOUR) window.CBCS_TOUR.afterRender();
}
// 튜토리얼: 체험 모드에서만 돈다(실제 자료 화면에서는 체험 모드를 새 창으로 연다)
function startTour() { if (!DEMO) { window.open(location.pathname + '?demo=1&tour=1', '_blank'); return; } if (window.CBCS_TOUR) window.CBCS_TOUR.start(); }
// 화면 폭이 바뀌면(휴대폰 ↔ PC 화면) 다시 그린다. 단, 인쇄 중에는 다시 그리지 않는다:
// 인쇄할 때 브라우저가 종이 폭(A4 약 720px)으로 다시 배치하면서 "휴대폰 폭"으로 바뀌었다고 알려 와,
// 휴대폰 메뉴에 없는 화면(총회 자료 등)이 메인으로 바뀌어 메인 페이지가 인쇄되던 문제
S.printing = false;
window.addEventListener('beforeprint', () => { S.printing = true; });
window.addEventListener('afterprint', () => { S.printing = false; if (S.user && S.mqStale) { S.mqStale = false; render(); } });
const doPrint = () => { S.printing = true; window.print(); setTimeout(() => { S.printing = false; }, 1500); };
// 폭이 바뀌어 다시 그릴 때는 보던 화면을 그대로 둔다(휴대폰 메뉴에 없는 화면이어도 메인으로 보내지 않음)
matchMedia('(max-width:760px)').addEventListener('change', () => { if (!S.user) return; if (S.printing || S.dirty) { S.mqStale = true; return; } S.keepView = true; render().finally(() => { S.keepView = false; }); }); // 쓰던 글이 있으면 다시 그리지 않는다(초안 보존)

/* ───────────── 로그인 ───────────── */
const acctName = d => d === 'committee' ? '교육위원회' : DEPTS[d] || '';
const acctShort = d => d === 'committee' ? '위원회' : (DEPTS[d] || '').replace('부', '') || '';
function enterAccount(d, view) {
  Object.assign(S, { user: d || null, dept: d && d !== 'committee' ? d : null, careKey: null, careDept: null, data: {}, committee: null, scholarship: null, archive: null, view: view || 'home', sub: {}, navOpen: {} });
  render();
}
// 로그인 정보: 이 기기에 로그인해 둔 부서 사이를 비밀번호 없이 오가고, 다른 부서는 그 부서 비밀번호로 더한다(권한이 있는 사람만 비밀번호를 앎)
function accountDialog() {
  const on = backend.sessions(); const all = [...Object.keys(DEPTS), 'committee'];
  openModal(`<h2>로그인 정보<button class="btn s" id="modal-close">닫기</button></h2>
    <p class="note">지금: <b>${esc(acctName(S.user))}</b>. 두 부서 이상을 맡은 분(예: 초등부 교사이면서 교육위원회 임원)은 그 부서 비밀번호로 한 번 더 로그인해 두면, 다음부터는 여기서 바로 옮겨 갈 수 있습니다.</p>
    <div class="acct-list">${all.map(d => { const me = d === S.user, has = on.includes(d); return `<div class="acct ${me ? 'me' : ''}"><div><b>${esc(acctName(d))}</b> <span class="note">${me ? '지금 보는 중' : has ? '로그인되어 있음' : ''}</span></div><div class="row" style="gap:6px">${me ? (on.length > 1 ? `<button class="btn s" data-acct-out="${esc(d)}">이 부서에서 나가기</button>` : '') : has ? `<button class="btn s p" data-acct-go="${esc(d)}">이 부서로 옮기기</button><button class="btn s" data-acct-out="${esc(d)}">나가기</button>` : `<button class="btn s" data-acct-add="${esc(d)}">비밀번호로 추가</button>`}</div></div>`; }).join('')}</div>
    <div id="acct-pw" class="stack" hidden style="margin-top:10px"><label class="f"><span id="acct-pw-l">비밀번호</span><input type="password" id="acct-pw-in" autocomplete="current-password"></label><div id="acct-err" class="note" style="color:var(--bad)" hidden></div><div class="row"><button class="btn p" id="acct-pw-go">로그인하고 옮기기</button></div></div>
    <div class="row" style="margin-top:14px;justify-content:space-between"><span class="note">공용 컴퓨터에서는 다 쓰고 "모두 나가기"를 눌러 주세요.</span><button class="btn d" id="acct-all-out">모두 나가기</button></div>`);
  document.querySelectorAll('[data-acct-go]').forEach(b => b.onclick = () => { if (backend.switchTo(b.dataset.acctGo)) { closeModal(); enterAccount(b.dataset.acctGo); toast(`${acctName(b.dataset.acctGo)}(으)로 옮겼습니다`); } else toast('로그인이 끝났습니다. 비밀번호로 다시 추가해 주세요'); });
  document.querySelectorAll('[data-acct-out]').forEach(b => b.onclick = async () => { const d = b.dataset.acctOut; const next = await backend.logoutOne(d); closeModal(); if (d === S.user) enterAccount(next); else accountDialog(); toast(`${acctName(d)}에서 나갔습니다`); });
  let target = null;
  document.querySelectorAll('[data-acct-add]').forEach(b => b.onclick = () => { target = b.dataset.acctAdd; $('#acct-pw').hidden = false; $('#acct-pw-l').textContent = `${acctName(target)} 비밀번호`; $('#acct-err').hidden = true; $('#acct-pw-in').value = ''; $('#acct-pw-in').focus(); });
  const add = async () => { if (!target) return; const btn = $('#acct-pw-go'); btn.disabled = true; btn.textContent = '확인 중…';
    try { await backend.login(target, $('#acct-pw-in').value); closeModal(); enterAccount(target); toast(`${acctName(target)}(으)로 옮겼습니다`); }
    catch (e) { const el = $('#acct-err'); el.hidden = false; el.textContent = /password|credential|user-not-found|invalid/i.test(e.code || e.message) ? '비밀번호가 맞지 않습니다. 이 부서 권한이 있는 분만 추가할 수 있습니다.' : '로그인 실패: ' + (e.code || e.message); btn.disabled = false; btn.textContent = '로그인하고 옮기기'; } };
  $('#acct-pw-go').onclick = add; $('#acct-pw-in').onkeydown = e => { if (e.key === 'Enter') add(); };
  $('#acct-all-out').onclick = async () => { await backend.logout(); closeModal(); enterAccount(null); };
}
function loginView() {
  return `<div class="login"><div class="box">
    <div class="brand">CBCS</div><p>중앙성서교회 교육부 보고서·출결·회계</p>
    <div class="stack">
      <label class="f"><span>부서</span><select id="lg-dept">${Object.entries(DEPTS).map(([k,v]) => `<option value="${esc(k)}">${v}</option>`).join('')}<option value="committee">교육위원회 (전 부서 열람)</option></select></label>
      <label class="f"><span>부서 비밀번호</span><input type="password" id="lg-pw" placeholder="비밀번호" autocomplete="current-password"></label>
      <div id="lg-err" class="note" style="color:var(--bad)" hidden></div>
      <button class="btn p" id="lg-go">들어가기</button>
    </div>
    <p class="note" style="margin-top:14px">PC에서는 작성·수정·출력, 휴대폰에서는 열람과 출석 체크를 합니다. 비밀번호를 모르면 부서 부장이나 교육위원회에 문의하세요.${MOCK ? `<br><b>${DEMO ? '체험 모드' : '시험 모드'}</b>: 아무 비밀번호나 됩니다. ${DEMO ? '모든 이름과 숫자는 가상이며, ' : ''}데이터는 이 브라우저에만 저장됩니다.` : ''}</p>
    <div class="demo-entry">${DEMO ? '<button class="btn p" id="lg-tour">튜토리얼로 둘러보기</button>' : `<a class="btn" href="?demo=1&tour=1">가상 자료로 체험하기 (튜토리얼)</a>`}<span class="note">${DEMO ? '초등부 화면부터 차례로 안내합니다.' : '실제 자료 없이 가상의 교육부로 모든 화면을 눌러 볼 수 있습니다.'}</span></div>
    ${FOOTER}
  </div></div>`;
}
function bindLogin() {
  const go = async () => {
    const d = $('#lg-dept').value, pw = $('#lg-pw').value; const btn = $('#lg-go'); btn.disabled = true; btn.textContent = '확인 중…';
    try { await backend.login(d, pw); S.user = d; S.dept = d === 'committee' ? null : d; S.view = 'home'; S.sub = {}; let seen = false; try { seen = localStorage.getItem('cbcs-tutorial-' + d); } catch (e) {} if (!seen) { S.view = 'tutorial'; try { localStorage.setItem('cbcs-tutorial-' + d, '1'); } catch (e) {} } render(); }
    catch (e) { const el = $('#lg-err'); el.hidden = false; el.textContent = /password|credential|user-not-found|invalid/i.test(e.code || e.message) ? '비밀번호가 맞지 않습니다.' : '로그인 실패: ' + (e.code || e.message); btn.disabled = false; btn.textContent = '들어가기'; }
  };
  const lt = $('#lg-tour'); if (lt) lt.onclick = () => startTour();
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
function bindMonthNav() { document.querySelectorAll('[data-month]').forEach(b => b.onclick = () => { S.sub.month = b.dataset.month; delete S.sub.mLive; render(); }); }
function eventListHTML(events, m) { const ev = events.filter(e => ym(e.date) === m || (e.end && e.date <= m+'-31' && e.end >= m+'-01')).sort((a,b) => a.date < b.date ? -1 : 1); return `<div class="list">${ev.map(e => `<div class="item"><div><div class="t">${esc(e.title)}</div><div class="d">${fmtK(e.date)}${e.end ? ' ~ ' + fmtK(e.end) : ''}${e.note ? ' · ' + esc(e.note) : ''}</div></div>${e.c ? '<span class="pill mute">교육위원회</span>' : ''}</div>`).join('') || '<div class="note">이달 일정이 없습니다.</div>'}</div>`; }

/* ───────────── 패치 현황 전광판 ───────────── */
const PATCHES = window.CBCS_PATCHES || [];
const patchDay = d => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
function patchBoard() {
  if (!PATCHES.length) return '';
  const top = Array.from({ length: 5 }, (_, i) => PATCHES[i % PATCHES.length]); // 최근 5건을 차례로 넘김(끝에 첫 줄을 한 번 더 붙여 이음매 없이)
  const line = (p, hide) => `<div class="ln"${hide ? ' aria-hidden="true"' : ''}><span class="dt">${patchDay(p.d)}</span><b>${esc(p.t)}</b><span class="mm">${esc(p.m)}</span></div>`;
  return `<button type="button" class="board no-print" id="board" title="패치 내역 전체 보기"><span class="lab">패치 현황</span><span class="win"><span class="roll">${top.map((p, i) => line(p, i > 0)).join('')}${line(top[0], true)}</span></span><span class="more">전체 ${PATCHES.length}건 ›</span></button>`;
}
function bindBoard() {
  const b = $('#board'); if (!b) return;
  b.onclick = () => openModal(`<h2>패치 현황<button class="btn s" id="modal-close">닫기</button></h2><div class="note" style="margin-bottom:10px">최근 순서입니다. 가장 최근 패치: ${fmtK(PATCHES[0].d)}</div><div class="list">${PATCHES.map(p => `<div class="item"><div><div class="t">${esc(p.t)}</div><div class="d">${esc(p.m)}</div></div><span class="note" style="white-space:nowrap">${patchDay(p.d)}</span></div>`).join('')}</div>`);
}

/* ───────────── 메인 ───────────── */
/* 메인 맨 위 "오늘 할 일": 출석 체크 · 아직 끝내지 않은 주일 보고서 · 회계에 안 붙인 영수증 */
async function todoCard(dd) {
  const ls = lastSunday(); const isSun = new Date().getDay() === 0 && !DEMO;
  const r = dd.reports[ls]; const att = r && r.att ? Object.values(r.att).filter(v => v === 'P' || v === 'O').length : 0; const reg = activeStudents(dd).length;
  const suns = sundaysOfYear(+ls.slice(0, 4)).filter(d => d <= ls).slice(-8);
  const todo = suns.filter(d => !(dd.reports[d] && dd.reports[d].status === 'done'));
  try { await loadReceipts(dd); } catch (e) {} const pend = pendingReceipts(dd);
  const item = (cls, title, desc, btn) => `<div class="todo ${cls}"><div><div class="t">${title}</div><div class="d">${desc}</div></div>${btn || ''}</div>`;
  return `<div class="card todo-card"><h2>오늘 할 일 <span class="r">${fmtK(today())}</span></h2><div class="todo-list">
    ${item(r ? 'ok' : 'warn', `${isSun ? '오늘' : '지난'} 주일 출석 ${r ? `${att}명 체크` : '아직 없음'}`, `${fmtK(ls)} · 재적 ${reg}명`, `<button class="btn s" data-goto="${isMobile() ? 'attend' : 'roster'}">출석 체크 ›</button>`)}
    ${(() => { const f = famDoneCount(dd, r); if (!r || !f.ids.length) return ''; const L = dd.doc.classLabel; return item(f.wait.length ? 'warn' : 'ok', f.wait.length ? `${L} 출석 확인 ${f.done.length}/${f.ids.length}` : `${L} 출석 모두 확인 (${f.ids.length}개)`, f.wait.length ? '기다리는 ' + L + ': ' + f.wait.map(c => esc(c.name)).join(', ') : '서기는 보고서를 마무리하면 됩니다', f.wait.length ? `<button class="btn s" data-goto="${isMobile() ? 'attend' : 'report'}" data-date="${esc(ls)}">출석 보기 ›</button>` : ''); })()}
    ${item(todo.length ? 'warn' : 'ok', todo.length ? `끝내지 않은 주일 보고서 ${todo.length}건` : '최근 8주 보고서 모두 작성 완료', todo.length ? todo.slice(-4).reverse().map(d => d.slice(5).replace('-', '/')).join(' · ') + (todo.length > 4 ? ' 외' : '') : '수고하셨습니다', todo.length && canEdit() ? `<button class="btn s" data-goto="report" data-date="${esc(todo[todo.length - 1])}">보고서 쓰기 ›</button>` : '')}
    ${item(pend.length ? 'warn' : 'ok', pend.length ? `회계에 안 붙인 영수증 ${pend.length}장` : '처리할 영수증 없음', pend.length ? pend.slice(0, 3).map(x => `${(x.date || '').slice(5).replace('-', '/')} ${esc(x.vendor || x.memo || '')} ${x.amount ? won(x.amount) + '원' : ''}`.trim()).join(' · ') : '사진으로 올린 영수증은 회계 지출에 붙이면 사라집니다', pend.length ? `<button class="btn s" data-goto="ledger">회계로 ›</button>` : '')}
  </div></div>`;
}
VIEWS.home = async () => {
  await loadCommittee();
  await loadShared(isCommittee() ? null : await loadDept(S.dept));
  const m = S.sub.month || today().slice(0, 7);
  if (isCommittee()) {
    const ls = S.sub.date || lastSunday();
    const rows = []; const plans = [];
    for (const d of Object.keys(DEPTS)) { const dd = await loadDept(d); const r = dd.reports[ls]; rows.push({ d, dd, r, s: r ? reportStats(dd, r) : null }); plans.push({ d, dd, cur: await loadPlan(dd, YEAR), next: await loadPlan(dd, YEAR + 1) }); }
    return `<div class="topbar"><div><h1>교육위원회</h1><div class="sub">전 부서 제출 현황과 공지</div></div><div class="row"><button class="btn s" data-tour>튜토리얼</button><input type="date" id="c-date" value="${esc(ls)}" style="width:auto"><button class="btn s" id="c-date-go">조회</button></div></div>
    <div class="stack">
      ${committeeExtras()}
      <div class="card"><h2>주일 보고서 제출 현황 <span class="r">${fmtK(ls)}</span></h2><div class="tw"><table><thead><tr><th>부서</th><th>상태</th><th class="n">재적</th><th class="n">출석</th><th class="n">출석률</th><th class="n">헌금</th><th>특이사항</th><th></th></tr></thead><tbody>
      ${rows.map(({ d, dd, r, s }) => r ? `<tr><td>${DEPTS[d]}</td><td><span class="pill ok">제출</span></td><td class="n">${s.total}</td><td class="n">${s.p}</td><td class="n">${s.rate}%</td><td class="n">${won(s.offSum)}</td><td class="wrap note">${isUnited(r) ? '<span class="pill info">세대통합</span> ' : ''}${esc((r.special||'').split('\n')[0]).slice(0,60)}</td><td><button class="btn s" data-go="reports" data-sub='${JSON.stringify({ dept: d, preview: ls })}'>보기</button></td></tr>`
        : `<tr><td>${DEPTS[d]}</td><td><span class="pill warn">미제출</span></td><td class="n">${activeStudents(dd).length}</td><td class="n">—</td><td class="n">—</td><td class="n">—</td><td></td><td></td></tr>`).join('')}
      </tbody></table></div></div>
      <div class="card"><h2>부서 연간계획서 <span class="r">확정된 계획서의 표어·말씀</span></h2><div class="tw"><table><thead><tr><th>부서</th><th>${YEAR}년</th><th>표어</th><th>${YEAR + 1}년</th><th></th></tr></thead><tbody>${plans.map(({ d, cur, next }) => `<tr><td>${DEPTS[d]}</td><td>${cur && cur.status === 'confirmed' ? '<span class="pill ok">확정</span>' : cur ? '<span class="pill warn">작성 중</span>' : '<span class="pill mute">없음</span>'}</td><td class="wrap">${esc((cur && cur.slogan) || '')}${cur && cur.verseRef ? ` <span class="note">(${esc(cur.verseRef)})</span>` : ''}</td><td>${next && next.status === 'confirmed' ? `<span class="pill ok">확정</span> <span class="note">${esc(next.slogan)}</span>` : next ? '<span class="pill warn">작성 중</span>' : '<span class="pill mute">미작성</span>'}</td><td><button class="btn s" data-go="plan" data-sub='${JSON.stringify({ dept: d, year: next ? YEAR + 1 : YEAR })}'>보기</button></td></tr>`).join('')}</tbody></table></div></div>
      <div class="grid2">
        <div class="card"><h2>공지 <span class="r">교육위원회 → 전 부서</span></h2><div class="list">${C().notices.sort((a,b) => a.date < b.date ? 1 : -1).map(n => `<div class="item"><div><div class="t">${esc(n.title)}</div><div class="d">${n.date} · ${esc(n.body)}</div></div><button class="btn s d edit-only" data-del-cn="${esc(n._id)}">삭제</button></div>`).join('') || '<div class="note">공지가 없습니다.</div>'}</div>
          <div class="row edit-only" style="margin-top:10px"><input type="text" id="cn-title" placeholder="공지 제목" style="flex:2"><input type="text" id="cn-body" placeholder="내용" style="flex:3"><button class="btn" id="cn-add">올리기</button></div></div>
        <div class="card"><h2>공통 일정 <span class="r">${m.replace('-','년 ')}월</span></h2>${monthNav(m)}${eventListHTML(C().events.map(e => ({ ...e, c: false })), m)}
          <div class="row edit-only" style="margin-top:10px"><input type="date" id="ce-date" style="width:auto"><input type="text" id="ce-title" placeholder="일정" style="flex:2"><button class="btn" id="ce-add">추가</button></div>
          <div class="list" style="margin-top:8px">${C().events.filter(e => ym(e.date) === m).map(e => `<div class="item edit-only"><div class="d">${e.date} ${esc(e.title)}</div><button class="btn s d" data-del-ce="${esc(e._id)}">삭제</button></div>`).join('')}</div></div>
      </div>
      <div class="card"><h2>${m.replace('-','년 ')}월 달력 <span class="r">교육위원회 공통 일정</span></h2>${calendarHTML(m, C().events.map(e => ({ ...e, c: true })))}</div>
    </div>`;
  }
  const dd = await loadDept(S.dept); const ls = lastSunday(); const r = dd.reports[ls]; const s = r ? reportStats(dd, r) : null;
  const curPlan = await loadPlan(dd, YEAR), nextPlan = await loadPlan(dd, YEAR + 1);
  const notices = [...C().notices.map(n => ({ ...n, from: '교육위원회', own: false })), ...dd.notices.map(n => ({ ...n, from: dd.doc.name, own: true }))].sort((a,b) => a.date < b.date ? 1 : -1);
  return `<div class="topbar"><div><h1>${esc(dd.doc.name)}</h1><div class="sub">${fmtK(today())}${dd.doc.notes && dd.doc.notes.merge ? ' · ' + esc(dd.doc.notes.merge) : ''}</div></div><div class="row"><button class="btn s" data-tour>튜토리얼</button>${canEdit() ? `<button class="btn p" data-go="weekly" data-sub='${JSON.stringify({ date: ls })}'>이번 주 보고서 작성</button>` : `<button class="btn p" data-go="attend">출석 체크</button>`}</div></div>
  <div class="stack">
    ${await todoCard(dd)}
    ${planBanner(dd, nextPlan && nextPlan.status === 'confirmed' && new Date().getMonth() >= 10 ? nextPlan : curPlan)}
    ${nextPlan && nextPlan.status === 'confirmed' && new Date().getMonth() < 10 ? planBanner(dd, nextPlan, true) : ''}
    <div class="tiles">
      <button class="tile go" data-goto="roster" title="출석부로 가기"><div class="v">${activeStudents(dd).length}</div><div class="l">재적 ›</div></button>
      <button class="tile go" data-goto="roster" title="출석부로 가기"><div class="v">${s ? s.p : '—'}</div><div class="l">지난 주일 출석 ${s ? `(${s.rate}%)` : ''} ›</div></button>
      <button class="tile go" data-goto="ledger" title="회계로 가기"><div class="v">${s ? won(s.offSum) : '—'}</div><div class="l">지난 주일 헌금(원) ›</div></button>
      <button class="tile go" data-goto="report" data-date="${esc(ls)}" title="보고서로 가기"><div class="v">${r ? (r.status === 'done' ? '<span class="pill ok">작성 완료</span>' : '<span class="pill warn">작성 중</span>') : '<span class="pill warn">미작성</span>'}</div><div class="l">${fmtK(ls)} 보고서 ›</div></button>
    </div>
    ${homeExtras(dd)}
    <div class="grid2">
      <div class="card"><h2>공지</h2><div class="list">${notices.map(n => `<div class="item"><div><div class="t">${esc(n.title)} <span class="pill mute">${n.from}</span></div><div class="d">${n.date} · ${esc(n.body)}</div></div>${n.own ? `<button class="btn s d edit-only" data-del-n="${esc(n._id)}">삭제</button>` : ''}</div>`).join('') || '<div class="note">공지가 없습니다.</div>'}</div>
        <div class="row edit-only" style="margin-top:10px"><input type="text" id="n-title" placeholder="부서 공지 제목" style="flex:2"><input type="text" id="n-body" placeholder="내용" style="flex:3"><button class="btn" id="n-add">올리기</button></div></div>
      <div class="card"><h2>${m.replace('-','년 ')}월 일정 <span class="r">회색 표시는 교육위원회 공통</span></h2>${monthNav(m)}${eventListHTML(homeEvents(dd), m)}</div>
    </div>
    <div class="card"><h2>${m.replace('-','년 ')}월 달력</h2>${calendarHTML(m, homeEvents(dd))}</div>
  </div>`;
};
BIND.home = () => {
  bindMonthNav(); bindBoard(); bindHomeExtras();
  document.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => { const g = b.dataset.goto; S.navOpen = {}; if (g === 'report') { S.view = isCommittee() || isMobile() ? 'reports' : 'weekly'; S.sub = { date: b.dataset.date }; } else { S.view = isMobile() && g === 'roster' ? 'members' : g; S.sub = {}; } render(); });
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
  const want = out.map(({ s, toDept, toClass }) => ({ id: `${nextYear}_${s.id}`, year: nextYear, fromDept: dd.id, toDept, toClass, studentId: s.id, name: s.name, sex: s.sex, birth: s.birth || '', fromClass: s.classId || '', phone: s.phone || '', guardianPhone: s.guardianPhone || '', guardianRel: s.guardianRel || '', father: s.father || '', mother: s.mother || '', faith: s.faith || '', faithYear: s.faithYear || '', faithHalf: s.faithHalf || '', address: s.address || '', siblings: sibs(s), school: s.school || '', note: s.note || '', received: (existing.find(e => e._id === `${nextYear}_${s.id}`) || {}).received || false }));
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
const LEFT_KINDS = ['제적', '졸업', '상급 부서 진급', '결혼', '직분', '이사', '타 교회', '기타']; // 결혼·직분: 회칙 4조로 회원 자격 종료(장년 소속)
// 총회 직전 1년의 달력상 주일(52주): (기준일-12개월, 기준일] — 보고서가 없는 주일도 결석으로 분모에 들어간다 (회칙 5조 4항 '1년 이내 출석률', 사용자 확정)
// 기준일(총회일) 이하의 마지막 주일부터 거꾸로 52주. 총회 당일이 주일이면 그날 출석까지 포함
function yearSundays(dd, base) { const d = new Date(base + 'T00:00:00'); while (d.getDay() !== 0) d.setDate(d.getDate() - 1); const out = []; for (let i = 0; i < 52; i++) { const dt = iso(d); out.unshift(dd.reports[dt] || { date: dt, att: {}, missing: true }); d.setDate(d.getDate() - 7); } return out; }
const namedReports = dd => Object.values(dd.reports).filter(r => r.date <= today() && Object.keys(r.att || {}).length && !(r.imported && !Object.keys(r.att).length)).sort((a, b) => a.date < b.date ? -1 : 1);
function lastAttended(dd, s) { const r = namedReports(dd).filter(r => (r.att || {})[s.id]); return r.length ? r[r.length - 1].date : ''; }
function absentStreak(dd, s) { const reps = namedReports(dd); let n = 0; for (let i = reps.length - 1; i >= 0; i--) { if ((reps[i].att || {})[s.id]) break; n++; } return { n, of: reps.length }; }
const leftRule = dd => dd.id === 'young' ? { weeks: 52, label: '1년 이상 연속 결석 (회칙 6조 · 유학·군복무·온라인 출석은 제외)' } : { weeks: 12, label: '12주(약 3개월) 이상 연속 결석' };
function setLeft(s, date, kind, reason) { (s.statusLog = s.statusLog || []).push({ date, from: s.status, to: 'left', kind, reason }); Object.assign(s, { status: 'left', leftDate: date, leftKind: kind, leftReason: reason }); }
// 과거 기록만 있는 사람: 최근 2년(올해·작년) 소속 이력이 없고, 앱에서 재적으로 되돌린 적도 없는 제적자 — 보관 후보
const pastOnly = s => !(s.history || []).some(h => +h.year >= YEAR - 1) && !(s.statusLog || []).some(l => l.to && l.to !== 'left');
function archivedSection(dd, edit) {
  const list = rosterCats(dd).archived.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const lastYear = s => Math.max(0, ...(s.history || []).map(h => +h.year || 0)) || '';
  return `<div class="card"><h2>보관 명단 <span class="r">${list.length}명</span></h2>
    ${edit && list.length ? `<div class="row" style="margin-bottom:8px;gap:8px"><button class="btn" id="ab-left" disabled>선택한 사람 제적 명단으로</button><button class="btn p" id="ab-active" disabled>선택한 사람 복적</button><span class="note" id="ab-count">사람을 체크하세요</span></div>` : ''}
    ${list.length ? `<div class="tw"><table><thead><tr>${edit ? '<th style="width:34px"><input type="checkbox" id="ab-all" title="모두 선택"></th>' : ''}<th class="n no">번호</th><th>이름</th><th>성별</th><th>생년월일</th><th class="n">마지막 소속 연도</th><th>처리일</th><th>비고</th></tr></thead><tbody>
    ${list.map((s, i) => `<tr>${edit ? `<td><input type="checkbox" data-ab="${esc(s.id)}" aria-label="${esc(s.name)} 선택"></td>` : ''}<td class="n no">${i + 1}</td><td><button class="chip" data-student="${esc(s.id)}">${esc(s.name)}</button></td><td>${esc(s.sex || '')}</td><td>${esc(s.birth || '')}</td><td class="n">${esc(lastYear(s))}</td><td>${esc(s.leftDate || '')}</td><td class="wrap note">${esc(s.note || '')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="note">보관한 사람이 없습니다. "제적" 칸에서 사람을 골라 "보관으로" 옮기거나, 학생 카드에서 상태를 "보관"으로 바꾸면 여기에 모입니다.</div>'}</div>`;
}
function leftSection(dd, edit) {
  const rule = leftRule(dd);
  const cands = activeStudents(dd).map(s => ({ s, st: absentStreak(dd, s), last: lastAttended(dd, s) })).filter(x => x.st.n >= Math.min(rule.weeks, x.st.of) && x.st.of >= 4 && !s_excused(x.s)).sort((a, b) => b.st.n - a.st.n);
  const left = rosterCats(dd).left.sort((a, b) => (b.leftDate || '') < (a.leftDate || '') ? -1 : (b.leftDate || '') > (a.leftDate || '') ? 1 : a.name.localeCompare(b.name, 'ko'));
  const kinds = {}; left.forEach(s => { const k = s.leftKind || '기록 없음'; kinds[k] = (kinds[k] || 0) + 1; });
  return `<div class="card"><h2>제적 대상 후보 <span class="r">기준: ${esc(rule.label)} · 주일 보고서 출석 체크로 자동 계산</span></h2>
    ${cands.length ? `<div class="tw"><table><thead><tr>${edit ? '<th style="width:34px"></th>' : ''}<th>이름</th><th>${esc(dd.doc.classLabel)}</th><th>마지막 출석</th><th class="n">연속 결석</th><th>비고</th></tr></thead><tbody>${cands.map(x => `<tr>${edit ? `<td><input type="checkbox" data-lc="${esc(x.s.id)}"></td>` : ''}<td><button class="chip" data-student="${esc(x.s.id)}">${esc(x.s.name)}</button></td><td>${esc((classOf(dd, x.s) || {}).name || x.s.classId || '')}</td><td>${x.last || '기록 없음'}</td><td class="n">${x.st.n}주${x.st.n >= x.st.of ? ' (보고서 전체)' : ''}</td><td class="wrap note">${esc(x.s.note || '')}</td></tr>`).join('')}</tbody></table></div>
      ${edit ? `<div class="row" style="margin-top:10px"><button class="btn p" id="lc-go">선택한 학생 제적 처리</button><span class="note">처리 날짜·구분·사유를 묻고, 출석부의 "제적" 목록으로 옮깁니다. 언제든 복적할 수 있습니다.</span></div>` : ''}`
      : `<div class="note">${namedReports(dd).length < 4 ? '출석 체크된 주일 보고서가 4장 이상 쌓이면 자동으로 찾습니다.' : '해당자가 없습니다.'}</div>`}
    <div class="note" style="margin-top:6px">${dd.id === 'young' ? '유학·군복무·온라인 출석 중인 사람은 학생 카드의 비고에 "유학", "군복무", "온라인"을 적어 두면 후보에서 빠집니다.' : '사정이 있는 학생은 학생 카드의 비고에 "유학", "군복무", "병가" 등을 적어 두면 후보에서 빠집니다.'}</div></div>
  <div class="card"><h2>제적 명단 <span class="r">${left.length}명 · ${Object.entries(kinds).map(([k, n]) => `${esc(k)} ${n}`).join(' · ')}</span></h2>
    ${edit && left.length ? `<div class="row" style="margin-bottom:8px;gap:8px;flex-wrap:wrap"><button class="btn p" id="rs-batch" disabled>선택한 학생 복적</button><button class="btn" id="ar-batch" disabled>선택한 학생 보관으로</button><button class="btn s" id="ar-pick">과거 기록만 있는 사람 고르기 (${left.filter(pastOnly).length}명)</button><span class="note" id="rs-count">학생을 체크하세요</span></div>` : ''}
    <div class="tw"><table><thead><tr>${edit ? '<th style="width:34px"><input type="checkbox" id="rs-all" title="모두 선택"></th>' : ''}<th class="n no">번호</th><th>이름</th><th>성별</th><th>생년월일</th><th>처리일</th><th>구분</th><th>사유</th><th>마지막 출석</th><th>연락처</th>${edit ? '<th></th>' : ''}</tr></thead><tbody>
    ${left.map((s, i) => `<tr>${edit ? `<td><input type="checkbox" data-rs="${esc(s.id)}" aria-label="${esc(s.name)} 선택"></td>` : ''}<td class="n no">${i + 1}</td><td><button class="chip" data-student="${esc(s.id)}">${esc(s.name)}</button></td><td>${esc(s.sex || '')}</td><td>${esc(s.birth || '')}</td><td>${esc(s.leftDate || '')}</td><td>${s.leftKind ? `<span class="pill mute">${esc(s.leftKind)}</span>` : ''}</td><td class="wrap note">${esc(s.leftReason || s.note || '')}</td><td>${lastAttended(dd, s) || ''}</td><td>${esc(phoneLabel(s))}</td>${edit ? `<td><button class="btn s" data-restore="${esc(s.id)}">복적</button></td>` : ''}</tr>`).join('') || `<tr><td colspan="11" class="note">제적한 학생이 없습니다.</td></tr>`}
    </tbody></table></div>${canEdit() ? '<div class="row" style="margin-top:10px"><button class="btn" id="lf-print">제적 명단 출력</button></div>' : ''}</div>`;
}
const s_excused = s => /유학|군복무|군 복무|입대|병가|온라인/.test((s.note || '') + (s.leftReason || ''));
function leftPaper(dd) {
  const left = dd.students.filter(s => s.status === 'left').sort((a, b) => (a.leftDate || '9') < (b.leftDate || '9') ? -1 : 1);
  return `<section class="paper"><div class="hd"><div><h1>${esc(dd.doc.name)} 제적 명단</h1><div class="sub">중앙성서교회 교육위원회</div></div><div class="meta">${today()} 기준 · ${left.length}명</div></div>
    <table><thead><tr><th class="n">번호</th><th>이름</th><th>성별</th><th>처리일</th><th>구분</th><th>사유</th><th>마지막 출석</th></tr></thead><tbody>${left.map((s, i) => `<tr><td class="n">${i + 1}</td><td>${esc(s.name)}</td><td>${esc(s.sex || '')}</td><td>${esc(s.leftDate || '')}</td><td>${esc(s.leftKind || '')}</td><td>${esc(s.leftReason || s.note || '')}</td><td>${lastAttended(dd, s)}</td></tr>`).join('')}</tbody></table>
    <div class="ft"><b>중앙성서교회 교육위원회</b><span>CBCS에서 생성 · ${esc(dd.doc.name)}-제적명단.pdf</span></div></section>`;
}
// 출석부 표에서 신급·연락처·비고를 눌러 바로 고치기 (PC, 부서 계정)
function inlineEditor(dd, s, td, kind, done) {
  document.querySelectorAll('.ie-pop').forEach(x => x.remove());
  const pop = document.createElement('div'); pop.className = 'ie-pop';
  const hist = [s.faithRaw && s.faithRaw !== s.faith ? `처음 들어온 값: ${s.faithRaw}` : '', s.faithPrev !== undefined && s.faithPrev !== s.faith ? `임시 표기 전: ${s.faithPrev || '모름'}` : '', s.faith && s.faithYear ? `지금: ${faithLabel(s)}` : '', ...(s.flags || []).filter(f => /신급/.test(f))].filter(Boolean);
  pop.innerHTML = kind === 'faith' ? `<b>신급 — ${esc(s.name)}</b>
      <div class="ie-opts">${FAITH_OPTS.map(k => `<label><input type="radio" name="ie-f" value="${esc(k)}" ${(s.faith || '') === k ? 'checked' : ''}> ${k || '모름'}</label>`).join('')}</div>
      <div class="row" style="gap:4px;margin-top:6px"><input type="number" id="ie-fy" placeholder="연도 (예: 2019)" value="${esc(s.faithYear || '')}" style="width:120px"><select id="ie-fh" style="width:auto"><option value="">반기</option><option ${s.faithHalf === '상' ? 'selected' : ''}>상</option><option ${s.faithHalf === '하' ? 'selected' : ''}>하</option></select></div>
      ${hist.length ? `<details class="ie-hist" open><summary>기존 내역</summary>${hist.map(h => `<div>• ${esc(h)}</div>`).join('')}</details>` : '<div class="note" style="margin-top:6px">기존 내역 없음</div>'}`
    : kind === 'status' ? (() => { const cur = s.status === 'left' && s.archived ? 'archived' : s.status; return `<b>상태 — ${esc(s.name)}</b>
      <div class="ie-opts">${STATUS_OPTS.map(([k, v]) => `<label><input type="radio" name="ie-st" value="${esc(k)}" ${cur === k ? 'checked' : ''}> ${v}</label>`).join('')}</div>
      <label class="f" id="ie-st-c" ${cur === 'custom' ? '' : 'hidden'}><span>상태 직접 입력</span><input type="text" id="ie-stext" value="${esc(s.statusText || '')}" placeholder="예: 해외 체류"></label>
      <div id="ie-st-l" ${cur === 'left' || cur === 'archived' ? '' : 'hidden'}><div class="row" style="gap:4px;margin-top:6px"><input type="date" id="ie-ld" value="${esc(s.leftDate || today())}" style="width:auto"><select id="ie-lk" style="width:auto"><option value="">구분</option>${LEFT_KINDS.map(k => `<option ${s.leftKind === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div><input type="text" id="ie-lr" value="${esc(s.leftReason || '')}" placeholder="사유 (선택)" style="margin-top:4px"></div>
      ${(s.statusLog || []).length ? `<details class="ie-hist"><summary>상태 기록 ${s.statusLog.length}건</summary>${s.statusLog.slice(-5).reverse().map(q => `<div>• ${esc(q.date || '')} ${esc(q.reason || q.kind || '')} ${esc(q.from || '')}→${esc(q.to || '')}</div>`).join('')}</details>` : ''}`; })()
    : kind === 'phone' ? `<b>연락처 — ${esc(s.name)}</b><label class="f"><span>본인</span><input type="tel" id="ie-p" value="${esc(s.phone || '')}"></label><label class="f"><span>보호자</span><div class="row" style="gap:4px"><input type="tel" id="ie-gp" value="${esc(s.guardianPhone || '')}" style="flex:1"><select id="ie-gr" style="width:auto">${['모', '부', '보호자'].map(r => `<option ${(s.guardianRel || '보호자') === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div></label>`
    : `<b>비고 — ${esc(s.name)}</b><textarea id="ie-n" rows="3">${esc(s.note || '')}</textarea>`;
  pop.innerHTML += `<div class="row" style="gap:6px;margin-top:8px"><button class="btn s p" id="ie-save">저장</button><button class="btn s" id="ie-cancel">취소</button><span class="note">Esc 닫기${kind === 'faith' || kind === 'status' ? '' : ' · Enter 저장'}</span></div>`;
  if (kind === 'status') pop.querySelectorAll('input[name=ie-st]').forEach(x => x.onchange = () => { const v = x.value; pop.querySelector('#ie-st-c').hidden = v !== 'custom'; pop.querySelector('#ie-st-l').hidden = !(v === 'left' || v === 'archived'); place(); });
  document.body.appendChild(pop);
  // 창 위치: 칸 아래에 두되 화면 밑으로 넘치면 칸 위로, 그래도 안 되면 화면 안에 맞춰 올린다. 내용이 늘어나면(제적·보관 칸 등) 다시 맞춘다
  const r = td.getBoundingClientRect(); const w = Math.min(340, innerWidth - 16); pop.style.width = w + 'px'; pop.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
  const place = () => { const h = pop.offsetHeight, below = r.bottom + 4, above = r.top - h - 4; pop.style.top = (below + h <= innerHeight - 8 ? below : above >= 8 ? above : Math.max(8, innerHeight - h - 8)) + 'px'; };
  place();
  const close = () => { pop.remove(); document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', key, true); };
  const outside = e => { if (!pop.contains(e.target)) close(); };
  const save = async () => {
    if (kind === 'faith') { const v = (pop.querySelector('input[name=ie-f]:checked') || {}).value || ''; if (s.faith !== v && s.faith) s.faithPrev = s.faith; s.faith = v; s.faithYear = +$('#ie-fy').value || ''; s.faithHalf = $('#ie-fh').value; if (v) s.flags = (s.flags || []).filter(f => !/신급 임시/.test(f)); }
    else if (kind === 'status') {
      // 학생 카드의 상태 저장과 같은 규칙: 제적·보관은 날짜·구분·사유를 남기고, 제적에서 돌아오면 "복적"으로 기록. 그 밖의 변경도 상태 기록에 남긴다
      const ns0 = (pop.querySelector('input[name=ie-st]:checked') || {}).value || s.status; const arch = ns0 === 'archived', ns = arch ? 'left' : ns0, was = s.status;
      const ld = $('#ie-ld').value || today(), lk = $('#ie-lk').value || (arch ? '보관' : '제적'), lr = $('#ie-lr').value.trim();
      if (ns === 'left' && was !== 'left') setLeft(s, ld, lk, lr);
      else if (ns !== 'left' && was === 'left') { (s.statusLog = s.statusLog || []).push({ date: today(), from: 'left', to: ns, reason: '복적' }); Object.assign(s, { status: ns, leftDate: '', leftKind: '', leftReason: '' }); }
      else if (ns === 'left') Object.assign(s, { leftDate: ld, leftKind: lk, leftReason: lr });
      else if (ns !== was) { (s.statusLog = s.statusLog || []).push({ date: today(), from: was, to: ns, reason: '상태 변경' }); s.status = ns; }
      s.archived = arch; s.statusText = ns === 'custom' ? ($('#ie-stext').value.trim() || '기타') : '';
    }
    else if (kind === 'phone') Object.assign(s, { phone: $('#ie-p').value.trim(), guardianPhone: $('#ie-gp').value.trim(), guardianRel: $('#ie-gr').value });
    else s.note = $('#ie-n').value.trim();
    $('#ie-save').disabled = true; await backend.set(`depts/${dd.id}/students/${s.id}`, s); close(); done(); toast('저장했습니다');
  };
  const key = e => { if (e.key === 'Escape') { e.preventDefault(); close(); } else if (e.key === 'Enter' && kind !== 'faith' && kind !== 'status' && !e.shiftKey) { e.preventDefault(); save(); } };
  setTimeout(() => { document.addEventListener('mousedown', outside, true); document.addEventListener('keydown', key, true); }, 0);
  $('#ie-cancel').onclick = close; $('#ie-save').onclick = save;
  const first = pop.querySelector('input:checked, input, textarea'); if (first) first.focus();
}
function studentRow(dd, s, edit, no, div) {
  const c = classOf(dd, s);
  return `<tr class="click" data-student="${esc(s.id)}">${no ? `<td class="n no">${no}</td>` : ''}${div ? `<td><span class="pill ${div === '라피끄' ? 'info' : 'mute'}">${div}</span></td>` : ''}<td>${esc(s.name)}${s.flags && s.flags.length ? ` <span class="tag flag" title="${esc(s.flags.join(' / '))}">!</span>` : ''}</td><td>${esc(c ? c.name : s.classId)}</td><td>${esc(s.sex)}</td><td>${s.birth || ''}</td><td class="ie" data-ie="faith" title="${esc(faithLabel(s))}">${s.faith ? esc(s.faith) : '<span class="note">모름</span>'}</td><td class="ie" data-ie="phone">${esc(phoneLabel(s)) || '<span class="note">—</span>'}</td><td class="wrap note" title="${esc(s.school || '')}"><div class="clamp2">${esc(s.school || '')}</div></td><td class="wrap note ie" data-ie="note" title="${esc(s.note || '')}">${s.note ? `<div class="clamp2">${esc(s.note)}</div>` : '<span class="note">—</span>'}</td><td class="ie" data-ie="status">${statusPill(s)}</td></tr>`;
}
VIEWS.roster = async () => {
  let dd; if (isCommittee()) { const d = S.sub.dept || 'kinder'; dd = await loadDept(d); } else dd = D();
  const nextYear = YEAR + 1; const plan = promotionPlan(dd, nextYear);
  if (!isCommittee() && canEdit()) { try { await syncPromotions(dd, nextYear); } catch (e) { console.warn('진급 동기화 실패', e); } }
  await loadShared(); if (!isCommittee() && canEdit()) { try { await syncSiblings(dd); } catch (e) {} }
  const promos = S.promotions || (S.promotions = await backend.list('promotions'));
  const incoming = promos.filter(p => p.toDept === dd.id && p.year === nextYear && !p.received).sort((a, b) => (a.birth || '') < (b.birth || '') ? -1 : 1);
  if (S.sub.promoPrint) return `<div class="topbar no-print"><div><h1>진급자 명단</h1><div class="sub">${nextYear}년 기준 · 인쇄하거나 PDF로 저장</div></div><div class="row"><button class="btn" id="pp-back">출석부로</button><button class="btn p" id="pp-print">PDF로 저장 / 인쇄</button></div></div>${promotionPaper(dd, nextYear, plan, incoming)}`;
  if (S.sub.leftPrint) return `<div class="topbar no-print"><div><h1>제적 명단 출력</h1></div><div class="row"><button class="btn" id="lf-back">출석부로</button><button class="btn p" id="lf-pr">PDF로 저장 / 인쇄</button></div></div>${leftPaper(dd)}`;
  // ── 출석부: 한 화면에서 탭으로 나눈다 ──
  // 청년부: 재적 회원 · 새친구 · 장기결석 · 팸장 · 제적 · 졸업·자격 종료(결혼·직분, 회칙 4조) / 지난 해: 그해 명단(1청년·2청년·라피끄) · 그해 팸장
  const young = dd.id === 'young'; const grp = young ? '청년' : '';
  const years = [...new Set([...dd.students.flatMap(s => (s.history || []).filter(h => !h.dept || h.dept === dd.id).map(h => +h.year)), ...Object.keys(dd.reports).map(d => +d.slice(0, 4)), YEAR])].filter(y => y >= 2015 && y <= YEAR).sort((a, b) => b - a);
  const yr = S.sub.year || YEAR;
  const cats = rosterCats(dd);
  const TABS = yr !== YEAR ? [['yr', `${yr}년 명단`], ...(young ? [['fam', `${yr}년 팸장`]] : [])]
    : [['active', young ? '재적 회원' : '재적'], ['newcomer', '새친구'], ['away', '장기결석'], ['paused', '정지'], ...(young ? [['fam', '팸장']] : []), ['left', '제적'], ...(young ? [['grad', '졸업·자격 종료']] : []), ['archived', '보관']];
  let show = S.sub.show || (yr !== YEAR ? 'yr' : 'active'); if (!TABS.some(t => t[0] === show)) show = TABS[0][0];
  const count = k => k === 'fam' ? famLeaders(dd, yr).length : k === 'yr' ? '' : (cats[k] || []).length;
  const deptPick = isCommittee() ? `<div class="row" style="margin-bottom:10px">${Object.entries(DEPTS).map(([k, v]) => `<button class="btn ${dd.id === k ? 'p' : ''}" data-dept="${esc(k)}">${v}</button>`).join('')}</div>` : '';
  const head = `<div class="topbar"><div><h1>출석부 — ${esc(dd.doc.name)}${yr !== YEAR ? ` <span class="pill warn">${yr}년</span>` : ''}</h1><div class="sub">${yr !== YEAR ? `${yr}년 기록 보기 · 과거 출석부 엑셀과 주일 보고서에서 옮긴 기록` : `재적 ${cats.active.length}명${cats.away.length ? ` · 장기결석 ${cats.away.length}명` : ''}${cats.paused.length ? ` · 정지 ${cats.paused.length}명` : ''} · 교사·임원 ${visibleStaff(dd).length}명 · 이름을 누르면 학생 카드`}</div></div>
    <div class="row no-print"><label class="row" style="gap:6px"><span class="note">연도</span><select id="ro-year" style="width:auto">${years.map(y => `<option value="${esc(y)}" ${y === yr ? 'selected' : ''}>${y === YEAR ? `${y} (올해)` : y}</option>`).join('')}</select></label>${yr === YEAR && canEdit() ? `<button class="btn s" id="pp-open">진급자 명단 출력</button>` : ''}${young && canEdit() && !isCommittee() ? '<button class="btn s" id="ya-import">과거 출석부 가져오기</button>' : ''}</div></div>
  ${deptPick}
  <div class="ro-tabs no-print">${TABS.map(([k, l]) => `<button data-show="${esc(k)}" class="${show === k ? 'on' : ''}">${l}${count(k) !== '' ? ` <span class="n">${count(k)}</span>` : ''}</button>`).join('')}</div>
  <div class="ro-desc note">${{ archived: '보관: 예전 출석부·보고서에 이름만 남은 사람처럼, 제적 명단과 따로 기록만 보관하는 사람입니다. 출석·총회 판정에는 들어가지 않고, 언제든 제적 명단으로 되돌리거나 복적할 수 있습니다.', active: young ? '청년부 회원(재적)입니다. 결혼·직분자는 회칙 4조에 따라 여기서 빠지고 "졸업·자격 종료"로 갑니다.' : '재적 학생입니다.', newcomer: '등록 전 새친구입니다. 학생 카드에서 상태를 "재적"으로 바꾸면 재적으로 옮겨집니다.', away: '장기결석: 특별한 사유 없이 오래 나오지 않는 회원입니다. 재적은 유지됩니다.', paused: '정지: 군입대·학업(유학 등)·사업처럼 사유가 있어 잠시 쉬는 회원입니다. 재적은 유지되고 회원 자격은 일시 정지됩니다. 돌아오면 상태 칸을 눌러 "재적"으로 바꾸세요.', fam: '팸장·부팸장은 재적(회원)에 넣지 않고 따로 관리합니다.', left: '제적 처리된 사람과, 오래 결석해 제적 대상이 된 후보입니다.', grad: '결혼·직분으로 청년부 회원 자격이 끝났거나(회칙 4조) 청년부를 졸업한 사람입니다. 출석부·출석 체크·통계에서 빠집니다.', yr: young ? '그해 소속 명단입니다. 그해에 있던 구분(1청년·2청년·라피끄)이 함께 보입니다.' : '그해 소속 명단입니다.' }[show] || ''}</div>`;
  if (show === 'yr') return head + yearRosterBody(dd, yr);
  if (show === 'fam') return head + famLeaderBody(dd, yr);
  if (show === 'left') return head + `<div class="stack">${leftSection(dd, canEdit() && !isCommittee())}</div>`;
  if (show === 'archived') return head + `<div class="stack">${archivedSection(dd, canEdit() && !isCommittee())}</div>`;
  if (show === 'grad') return head + gradSection(dd, cats.grad);
  const list = cats[show] || [];
  const sort = S.sub.sort || 'name';
  const corder = s => { const i = dd.doc.classes.findIndex(c => c.id === s.classId); return i < 0 ? 999 : i; };
  const byName = (a, b) => a.name.localeCompare(b.name, 'ko');
  const curDiv = young && list.some(s => youngDiv(s, YEAR) !== '1청년');
  const sorted = list.slice().sort(sort === 'name' ? byName : sort === 'gradeDesc' ? ((a, b) => corder(b) - corder(a) || byName(a, b)) : ((a, b) => corder(a) - corder(b) || byName(a, b)));
  return head + `<div class="stack">
    <div class="card"><h2><span class="row" style="display:inline-flex;gap:4px">${[['name', '이름 가나다순'], ['gradeAsc', dd.doc.classLabel + ' 오름차순'], ['gradeDesc', dd.doc.classLabel + ' 내림차순']].map(([k, v]) => `<button class="btn s ${sort === k ? 'p' : ''}" data-sort="${esc(k)}">${esc(v)}</button>`).join('')}</span> <span class="r">생년월일·연락처·주소는 부서 안에서만 보이고 PDF에는 이름만 나갑니다</span></h2>
      <div class="tw"><table class="roster"><colgroup><col style="width:46px">${curDiv ? '<col style="width:70px">' : ''}<col style="width:84px"><col style="width:104px"><col style="width:44px"><col style="width:92px"><col style="width:64px"><col style="width:150px"><col style="width:110px"><col><col style="width:76px"></colgroup><thead><tr><th class="n no">번호</th>${curDiv ? '<th>구분</th>' : ''}<th>이름</th><th>${esc(dd.doc.classLabel)}</th><th>성별</th><th>생년월일</th><th>신급</th><th>연락처</th><th>학교</th><th>비고</th><th>상태</th></tr></thead><tbody>
      ${sorted.map((s, i) => studentRow(dd, s, false, i + 1, curDiv ? youngDiv(s, YEAR) : '')).join('') || `<tr><td colspan="11" class="note">해당하는 사람이 없습니다.</td></tr>`}
      </tbody></table></div>
      ${show === 'active' && canEdit() && !isCommittee() ? `<div class="fields edit-only" style="margin-top:12px">
        <label class="f"><span>이름</span><input type="text" id="s-name"></label>
        <label class="f"><span>${esc(dd.doc.classLabel)}</span><select id="s-class">${dd.doc.classes.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label>
        <label class="f"><span>성별</span><select id="s-sex"><option>남</option><option>여</option></select></label>
        <label class="f"><span>생년월일</span><input type="date" id="s-birth"></label>
        <label class="f"><span>연락처 (본인)</span><input type="tel" id="s-p"></label>
        <label class="f"><span>보호자 연락처</span><div class="row" style="gap:4px"><input type="tel" id="s-gp" style="flex:1"><select id="s-grel" style="width:auto"><option>모</option><option>부</option><option>보호자</option></select></div></label>
        <label class="f"><span>비고</span><input type="text" id="s-n" placeholder="형제자매, 특이사항"></label>
      </div><div class="row edit-only" style="margin-top:8px"><button class="btn p" id="s-add">학생 추가</button><span class="note">새친구는 주일 보고서에서 등록하면 자동으로 들어옵니다. 세부 정보는 학생 카드에서 고칩니다.</span></div>` : ''}
    </div>
    ${show === 'active' ? (incoming.length || plan.out.length ? `<div class="card"><h2>${nextYear}년 진급 예정 <span class="r">생년월일·학년으로 자동 계산 · 연초에 "출석부에 받기"를 누르면 재적으로 들어옵니다</span></h2>
      ${incoming.length ? `<div class="note" style="margin-bottom:4px">입학 예정 (${incoming.length}명)</div><div class="tw"><table><thead><tr><th class="n no">번호</th><th>이름</th><th>성별</th><th>생년월일</th><th>배정 ${esc(dd.doc.classLabel)}</th><th>이전 소속</th><th>연락처</th></tr></thead><tbody>${incoming.map((x, i) => `<tr><td class="n no">${i + 1}</td><td>${esc(x.name)}</td><td>${esc(x.sex || '')}</td><td>${esc(x.birth || '')}</td><td>${esc(x.toClass || '')}</td><td>${esc(DEPTS[x.fromDept] || x.fromDept)} ${esc(x.fromClass || '')}</td><td>${esc(phoneLabel(x))}</td></tr>`).join('')}</tbody></table></div>${canEdit() && !isCommittee() ? `<div class="row edit-only" style="margin-top:8px"><button class="btn p" id="pp-receive">${nextYear}년 입학 예정자 ${incoming.length}명을 출석부에 받기</button><span class="note">받은 뒤에는 "${dd.doc.classLabel}"과 상태를 출석부에서 고칠 수 있습니다.</span></div>` : ''}` : ''}
      ${plan.out.length ? `<div class="note" style="margin:10px 0 4px">졸업·상급 부서 진급 예정 (${plan.out.length}명) — 상대 부서 출석부에 자동으로 표시됩니다</div><div class="row" style="gap:6px">${plan.out.map(({ s, toDept, toClass }) => `<span class="pill mute">${esc(s.name)} → ${DEPTS[toDept]} ${esc(toClass)}</span>`).join('')}</div>` : ''}
    </div>` : '') : ''}
    ${show === 'active' ? `    <div class="grid2">
      <div class="card"><h2>${esc(dd.doc.classLabel)} 편성 <span class="r">누르면 학생 이름이 보입니다</span></h2><div class="list">${dd.doc.classes.map(c => { const st = classStudents(dd, c.id); return `<details class="item cls-item"><summary><div><div class="t">${esc(c.name)} <span class="note">${st.length}명</span></div><div class="d">담임 ${esc(c.teacher || '미정')}${c.assistant ? ' · 보조 ' + esc(c.assistant) : ''}</div></div>${canEdit() && !isCommittee() ? `<span class="row edit-only"><button class="btn s" data-edit-c="${esc(c.id)}">수정</button><button class="btn s d" data-del-c="${esc(c.id)}">삭제</button></span>` : ''}</summary><div class="cls-names">${st.map(x => `<button class="chip" data-student="${esc(x.id)}">${esc(x.name)}</button>`).join('') || '<span class="note">학생 없음</span>'}</div>${c.flags && c.flags.length ? `<div class="flags">${c.flags.map(esc).join('<br>')}</div>` : ''}</details>`; }).join('')}</div>
        ${canEdit() && !isCommittee() ? `<div class="row edit-only" style="margin-top:10px"><input type="text" id="c-name" placeholder="새 ${esc(dd.doc.classLabel)} 이름" style="flex:1"><input type="text" id="c-teacher" placeholder="담임" style="width:120px"><button class="btn" id="c-add">추가</button></div>` : ''}</div>
      <div class="card"><h2>교사·임원</h2><div class="tw"><table><thead><tr><th class="n no">번호</th><th>이름</th><th>역할</th><th>반</th><th>연락처</th><th>비고</th><th></th></tr></thead><tbody>${visibleStaff(dd).map((t, i) => `<tr><td class="n no">${i + 1}</td><td>${esc(t.name)}${t.flags && t.flags.length ? ' <span class="tag flag" title="' + esc(t.flags.join(' / ')) + '">!</span>' : ''}</td><td>${esc(t.role)}${dd.id === 'young' ? ' ' + [...new Set(roleParts(t.role).map(roleKind))].map(k => `<span class="pill ${ROLE_PILL[k] || 'mute'}">${k}</span>`).join(' ') : ''}</td><td>${esc(t.classId || '')}</td><td>${esc(t.phone || '')}</td><td class="wrap note">${esc(t.note || '')}</td><td>${canEdit() && !isCommittee() ? `<button class="btn s edit-only" data-edit-t="${esc(i)}">수정</button> <button class="btn s d edit-only" data-del-t="${esc(i)}">삭제</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
        ${canEdit() && !isCommittee() ? `<div class="row edit-only" style="margin-top:10px"><input type="text" id="t-name" placeholder="이름" style="flex:1"><input type="text" id="t-role" placeholder="역할 (부장, 총무, 회계, 담임…)" style="flex:2"><input type="tel" id="t-phone" placeholder="연락처" style="width:140px"><button class="btn" id="t-add">추가</button></div>` : ''}
        ${dd.doc.staff.some(t => t.status === 'left') ? `<div class="note" style="margin-top:8px">이전 교역자·교사: ${dd.doc.staff.filter(t => t.status === 'left').map(t => esc(t.name) + '(' + esc(t.role) + ')').join(', ')}</div>` : ''}</div>
    </div>` : ''}
  </div>`;
};
/* ───────────── 출석 기록 (연도별 주일 × 학생 표) ───────────── */
VIEWS.attlog = async () => {
  let dd; if (isCommittee()) dd = await loadDept(S.sub.dept || 'kinder'); else dd = D();
  const years = [...new Set(Object.keys(dd.reports).map(d => +d.slice(0, 4)))].sort((a, b) => b - a);
  const year = S.sub.year || (years.includes(YEAR) ? YEAR : years[0] || YEAR);
  const mon = S.sub.mon || 0;
  const sundays = []; { const d = new Date(year, 0, 1); while (d.getDay() !== 0) d.setDate(d.getDate() + 1); while (d.getFullYear() === year) { const ds = `${year}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; if (ds <= today() && (!mon || d.getMonth() + 1 === mon)) sundays.push(ds); d.setDate(d.getDate() + 7); } }
  const reps = sundays.map(ds => dd.reports[ds] || null);
  const inYear = new Set(); Object.values(dd.reports).forEach(r => { if (r.date.startsWith(String(year))) Object.keys(r.att || {}).forEach(id => inYear.add(id)); });
  const corder = s => { const i = dd.doc.classes.findIndex(c => c.id === s.classId); return i < 0 ? 999 : i; };
  const alSort = S.sub.sort || 'name'; const list0 = dd.students.filter(s => s.status !== 'left' || inYear.has(s.id)).sort((a, b) => (alSort === 'name' ? 0 : corder(a) - corder(b)) || a.name.localeCompare(b.name, 'ko'));
  const isMem = s => inRoll(s) || (s.status === 'newcomer' && !isGrad(s)); const list = [...list0.filter(isMem), ...list0.filter(x => !isMem(x))]; const firstOut = list.findIndex(x => !isMem(x));
  const withRep = reps.filter(Boolean).length;
  const unmatched = {}; reps.forEach(r => r && Object.keys(r.attUnmatched || {}).forEach(n => { unmatched[n] = (unmatched[n] || 0) + 1; }));
  const pick = isCommittee() ? `<div class="row" style="margin-bottom:10px">${Object.entries(DEPTS).map(([k, v]) => `<button class="btn ${dd.id === k ? 'p' : ''}" data-dept="${esc(k)}">${v}</button>`).join('')}</div>` : '';
  const cell = (r, s) => { if (!r) return '<td class="al-none" title="보고서 없음"></td>'; const a = (r.att || {})[s.id]; const why = (r.absent || {})[s.id]; return a === 'P' ? '<td class="al-p" title="출석">●</td>' : a === 'O' ? '<td class="al-o" title="온라인·본당">◐</td>' : `<td class="al-x"${why ? ` title="${esc(why)}"` : ''}>${why ? '·' : ''}</td>`; };
  const head = sundays.map((ds, i) => `<th class="al-d ${reps[i] ? '' : 'al-none'}" title="${ds}${reps[i] ? '' : ' (보고서 없음)'}">${+ds.slice(5, 7)}/${+ds.slice(8)}</th>`).join('');
  const staffRole = s => { const t = dd.doc.staff.find(x => x.status !== 'left' && normName(x.name) === normName(s.name)); return t ? t.role : ''; };
  const rows = list.map((s, i) => { const n = reps.filter(r => r && (r.att || {})[s.id]).length; const sr = s.status === 'left' || (isYoungStu(s) && s.group === '팸장') ? staffRole(s) : ''; const divider = i === firstOut ? `<tr class="al-div"><th class="al-name" colspan="1">회원 아님 <span class="note">자격 종료·팸장·제적 — 그해 출석만 남김</span></th><td colspan="${reps.length + 2}"></td></tr>` : ''; return `${divider}<tr${isMem(s) ? '' : ' class="al-out"'}><th class="al-name"><span class="no-in">${i + 1}</span><button class="al-who" data-alwho="${esc(s.id)}" title="세부 정보"><b>${esc(s.name)}</b></button>${s.flags && s.flags.length ? ' <span class="tag flag" title="' + esc(s.flags.join(' / ')) + '">!</span>' : ''}${sr ? ` <span class="pill info">${esc(sr)}</span>` : isGrad(s) ? ' ' + statusPill(s) : s.status === 'left' ? ' <span class="pill mute">제적</span>' : AWAY.includes(s.status) || s.status === 'newcomer' ? ' ' + statusPill(s) : ''}<span class="note"> ${esc((classOf(dd, s) || {}).name || s.classId || '')}</span></th>${reps.map(r => cell(r, s)).join('')}<td class="n al-sum">${n}/${withRep}</td><td class="n al-sum">${withRep ? Math.round(n / withRep * 100) : 0}%</td></tr>`; }).join('');
  const foot = `<tr class="sum"><th class="al-name">출석(명단)</th>${reps.map(r => `<td class="n">${r ? Object.keys(r.att || {}).length : ''}</td>`).join('')}<td></td><td></td></tr><tr class="sum"><th class="al-name">출석(보고서 숫자)</th>${reps.map(r => `<td class="n">${r ? reportStats(dd, r).p : ''}</td>`).join('')}<td></td><td></td></tr>`;
  return `<div class="topbar"><div><h1>출석 기록 — ${esc(dd.doc.name)}</h1><div class="sub">${year}년${mon ? ` ${mon}월` : ''} · 주일 ${sundays.length}번 중 보고서 ${withRep}장 · ● 출석 ◐ 온라인·본당 · 결석 사유가 있으면 · (점에 마우스를 올리면 사유)</div></div>
    <div class="row no-print"><select id="al-year" style="width:auto">${(years.length ? years : [YEAR]).map(y => `<option ${y === year ? 'selected' : ''}>${y}</option>`).join('')}</select>${canEdit() ? '<button class="btn" id="al-print">출력</button>' : ''}</div></div>
  ${pick}
  <div class="row no-print" style="gap:4px;margin-bottom:6px">${[['name', '이름 가나다순'], ['class', esc(dd.doc.classLabel) + ' 순']].map(([k, l]) => `<button class="btn s ${alSort === k ? 'p' : ''}" data-alsort="${esc(k)}">${l}</button>`).join('')}</div>
  <div class="row no-print" style="gap:4px;margin-bottom:10px">${[0, ...Array.from({ length: 12 }, (_, i) => i + 1)].map(m => `<button class="btn s ${mon === m ? 'p' : ''}" data-mon="${esc(m)}">${m ? m + '월' : '1년 전체'}</button>`).join('')}</div>
  <div class="card"><div class="tw al-wrap"><table class="attlog"><thead><tr><th class="al-name">이름</th>${head}<th class="n">출석</th><th class="n">출석률</th></tr></thead><tbody>${rows || `<tr><td class="note">학생이 없습니다.</td></tr>`}</tbody><tfoot>${foot}</tfoot></table></div>
    <div class="note" style="margin-top:8px">회색 칸은 그 주일 보고서가 없는 날입니다. "출석(명단)"은 이름으로 체크된 수, "출석(보고서 숫자)"는 보고서에 적힌 숫자라 서로 다를 수 있습니다(새친구·다른 부서 출석 등).</div>
    ${Object.keys(unmatched).length ? `<div class="hint" style="margin-top:8px">출석부와 연결되지 않은 출석 이름(다른 부서로 옮긴 학생 등): ${Object.entries(unmatched).sort((a, b) => b[1] - a[1]).map(([n, k]) => `${esc(n)} ${k}회`).join(', ')}</div>` : ''}</div>`;
};
// 출석 기록에서 이름을 누르면: 기본 정보와 그해 출석·결석 사유를 한눈에
function attPersonModal(dd, s, year) {
  const reps = Object.values(dd.reports).filter(r => r.date.startsWith(String(year))).sort((a, b) => a.date < b.date ? -1 : 1);
  const named = reps.filter(r => Object.keys(r.att || {}).length);
  const p = named.filter(r => (r.att || {})[s.id] === 'P').length, o = named.filter(r => (r.att || {})[s.id] === 'O').length;
  const absences = named.filter(r => !(r.att || {})[s.id]); const why = absences.filter(r => (r.absent || {})[s.id]);
  const months = Array.from({ length: 12 }, (_, i) => { const m = `${year}-${pad2(i + 1)}`; const rs = named.filter(r => r.date.startsWith(m)); const c = rs.filter(r => (r.att || {})[s.id]).length; return { m: i + 1, c, n: rs.length }; });
  const t = dd.doc.staff.find(x => x.status !== 'left' && normName(x.name) === normName(s.name));
  const c = classOf(dd, s); const last = lastAttended(dd, s);
  const kv = [['상태', t && s.status === 'left' ? `${esc(t.role)} (교사·임원 명단)` : statusPill(s)], [dd.doc.classLabel, esc(c ? c.name : s.classId || '')], ['성별', esc(s.sex || '')], ['생년월일', esc(s.birth || '')], ['신급', esc(faithLabel(s) || '모름')], ['연락처', esc(phoneLabel(s) || (t && t.phone) || '')], ['마지막 출석', esc(last || '—')], ['비고', esc(s.note || '')]];
  return `<h2>${esc(s.name)} <span class="note">${year}년 출석</span><button class="btn s" id="modal-close">닫기</button></h2>
    ${s.flags && s.flags.length ? `<div class="hint" style="margin-bottom:10px"><b>확인할 점</b>${s.flags.map(f => `<div>• ${esc(f)}</div>`).join('')}</div>` : ''}
    <div class="grid2 sc-grid"><dl class="kvl">${kv.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    <div><div class="tiles" style="grid-template-columns:repeat(3,1fr);margin:0 0 10px"><div class="tile"><div class="v">${p + o}<small>/${named.length}</small></div><div class="l">출석 (온라인 ${o})</div></div><div class="tile"><div class="v">${named.length ? Math.round((p + o) / named.length * 100) : 0}%</div><div class="l">출석률</div></div><div class="tile"><div class="v">${absences.length}</div><div class="l">결석 (사유 ${why.length})</div></div></div>
    <div class="al-months">${months.map(x => `<div class="${x.n ? '' : 'none'}"><b>${x.m}월</b><span>${x.n ? `${x.c}/${x.n}` : '—'}</span></div>`).join('')}</div>
    <div class="ystrip" style="margin-top:8px">${named.map(r => { const v = (r.att || {})[s.id]; return `<span class="yw ${v === 'P' ? 'p' : v === 'O' ? 'o' : 'x'}" title="${r.date}${(r.absent || {})[s.id] ? ' ' + esc(r.absent[s.id]) : ''}"></span>`; }).join('')}</div></div></div>
    <h3 style="margin:14px 0 6px">결석 사유 <span class="note">${why.length ? why.length + '건' : '적힌 사유 없음'}</span></h3>
    ${why.length ? `<div class="tw" style="max-height:220px;overflow:auto"><table><tbody>${why.map(r => `<tr><td style="white-space:nowrap">${fmtK(r.date)}</td><td>${esc(r.absent[s.id])}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${!isMobile() ? `<div class="row" style="margin-top:12px"><button class="btn" id="ap-card">출석부 학생 카드 열기</button></div>` : ''}`;
}
BIND.attlog = () => {
  const dd = isCommittee() ? S.data[S.sub.dept || 'kinder'] : D();
  document.querySelectorAll('[data-alwho]').forEach(b => b.onclick = () => { const s = dd.students.find(x => x.id === b.dataset.alwho); if (!s) return; const yr = +($('#al-year') || {}).value || YEAR; openModal(attPersonModal(dd, s, yr)); const ac = $('#ap-card'); if (ac) ac.onclick = () => { closeModal(); S.view = 'roster'; S.sub = { ...(isCommittee() ? { dept: dd.id } : {}), show: s.status === 'left' ? 'all' : (s.status === 'newcomer' ? 'newcomer' : 'active'), open: s.id }; render(); }; });
  document.querySelectorAll('[data-dept]').forEach(b => b.onclick = () => { S.sub = { dept: b.dataset.dept }; render(); });
  $('#al-year').onchange = e => { S.sub.year = +e.target.value; S.sub.mon = 0; render(); };
  document.querySelectorAll('[data-mon]').forEach(b => b.onclick = () => { S.sub.mon = +b.dataset.mon; renderHere(); });
  document.querySelectorAll('[data-alsort]').forEach(b => b.onclick = () => { S.sub.sort = b.dataset.alsort; renderHere(); });
  const pr = $('#al-print'); if (pr) pr.onclick = doPrint;
};
VIEWS.dropouts = async () => { S.view = 'roster'; S.sub.show = 'left'; return VIEWS.roster(); };
function studentCard(dd, s) {
  const c = classOf(dd, s); const reps = Object.values(dd.reports).filter(r => r.date.startsWith(String(YEAR))).sort((a,b) => a.date < b.date ? -1 : 1);
  const attRows = reps.map(r => ({ date: r.date, v: (r.att || {})[s.id] || '', reason: (r.absent || {})[s.id] || '' }));
  const present = attRows.filter(a => a.v).length;
  const f = k => esc(s[k] || '');
  const edit = canEdit() && !isCommittee();
  return `<h2>${esc(s.name)} <span class="note" style="margin:0 auto 0 10px">${esc(c ? c.name : s.classId)} · ${esc(s.sex)}</span><button class="btn s" id="modal-close">닫기</button></h2>
    ${s.flags && s.flags.length ? `<div class="flags">${s.flags.map(esc).join('<br>')}</div>` : ''}
    <div class="grid2 sc-grid" style="margin-top:10px">
      <dl class="kvl"><dt>생년월일</dt><dd>${f('birth')}</dd><dt>신급</dt><dd>${esc(faithLabel(s))}</dd><dt>학교</dt><dd>${f('school')}</dd>${dd.id === 'young' ? `<dt>직분</dt><dd>${esc(s.churchRole || '없음')}</dd>` : ''}${dd.id === 'young' ? `<dt>결혼</dt><dd>${s.married ? `기혼${s.marriedDate ? ' (' + esc(s.marriedDate) + ')' : ''}` : '미혼'}</dd>` : ''}<dt>연락처(본인)</dt><dd>${f('phone')}</dd><dt>보호자 연락처</dt><dd>${f('guardianPhone')}${s.guardianPhone ? ' (' + esc(s.guardianRel || '보호자') + ')' : ''}</dd><dt>아버지</dt><dd>${f('father')}</dd><dt>어머니</dt><dd>${f('mother')}</dd><dt>주소</dt><dd>${f('address')}${mapToggle(s.address)}</dd><dt>전도자</dt><dd>${f('evangelist')}</dd><dt>장학</dt><dd>${esc((s.scholarship || []).join(', '))}</dd><dt>비고</dt><dd>${f('note')}</dd></dl>
      <div><div class="note" style="margin-bottom:4px">소속 이력 · 등록</div>
        <div class="hist-reg">등록일(청년부 첫 출석) <b>${esc(s.joinDate || '모름')}</b>${canEdit() && !isCommittee() ? ` <input type="date" id="hr-join" value="${esc(s.joinDate || '')}" style="width:auto"> <button class="btn s" id="hr-join-save">등록일 저장</button>` : ''}</div>
        <table class="hist-tbl"><tbody>${(s.history || []).map((h, i) => `<tr data-hi="${esc(i)}"><td>${h.year}</td><td>${esc(DEPTS[h.dept] || h.dept)}${h.origDept && h.origDept !== DEPTS[h.dept] ? ' (' + esc(h.origDept) + ')' : ''}</td><td>${esc(h.classId || '')}</td><td class="note">${esc(h.note || '')}</td>${canEdit() && !isCommittee() ? `<td class="hist-act"><button class="btn s" data-h-edit="${esc(i)}">수정</button><button class="btn s d" data-h-del="${esc(i)}">삭제</button></td>` : ''}</tr>`).join('') || '<tr><td class="note" colspan="5">기록 없음</td></tr>'}<tr><td>${YEAR}</td><td>${esc(dd.doc.name)}</td><td>${esc(c ? c.name : s.classId)}</td><td class="note">현재</td>${canEdit() && !isCommittee() ? '<td></td>' : ''}</tr></tbody></table>
        ${canEdit() && !isCommittee() ? `<div class="row hist-add" style="gap:4px;margin-top:6px;flex-wrap:wrap"><input type="number" id="ha-year" value="${esc(YEAR)}" style="width:80px"><input type="text" id="ha-fam" placeholder="${esc(dd.doc.classLabel)} (예: 김팸장·이팸장 팸)" style="flex:1;min-width:120px"><input type="text" id="ha-note" placeholder="메모 (예: 4/19 등록)" style="flex:1;min-width:110px"><button class="btn s" id="ha-add">이력 추가</button></div>` : ''}
        ${(s.statusLog || []).length ? `<div class="note" style="margin:10px 0 4px">상태 변경 기록</div><div class="note">${s.statusLog.map(l => `${esc(l.date)} ${l.to === 'left' ? '제적' : '복적'}${l.kind ? '(' + esc(l.kind) + ')' : ''}${l.reason ? ' — ' + esc(l.reason) : ''}`).join('<br>')}</div>` : ''}
        <div class="note" style="margin:10px 0 4px">${YEAR}년 출석 ${present}/${reps.length}회</div>
        <div class="row" style="gap:3px">${attRows.map(a => `<span title="${a.date}${a.reason ? ' ' + esc(a.reason) : ''}" style="width:12px;height:12px;border-radius:2px;display:inline-block;background:${a.v === 'P' ? 'var(--ok)' : a.v === 'O' ? 'var(--warn)' : 'var(--line)'}"></span>`).join('')}</div></div>
    </div>
    ${studentExtras(dd, s)}
    ${edit ? `<div class="fields" style="margin-top:14px">
      <label class="f"><span>이름</span><input type="text" id="sc-name" value="${esc(s.name)}"></label>
      <label class="f"><span>${esc(dd.doc.classLabel)}</span><select id="sc-class">${dd.doc.classes.map(x => `<option value="${esc(x.id)}" ${x.id === s.classId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}<option value="${esc(s.classId)}" ${c ? '' : 'selected'}>${esc(s.classId || '(없음)')}</option></select></label>
      <label class="f"><span>성별</span><select id="sc-sex"><option ${s.sex === '남' ? 'selected' : ''}>남</option><option ${s.sex === '여' ? 'selected' : ''}>여</option></select></label>
      <label class="f"><span>상태</span><select id="sc-status">${STATUS_OPTS.map(([k, v]) => `<option value="${esc(k)}" ${(s.status === 'left' && s.archived ? 'archived' : s.status) === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="f" id="sc-stext-w" ${s.status === 'custom' ? '' : 'hidden'}><span>상태 직접 입력</span><input type="text" id="sc-stext" value="${esc(s.statusText || '')}" placeholder="예: 해외 체류, 휴직, 육아"></label>
      <label class="f"><span>생년월일</span><input type="date" id="sc-birth" value="${esc(s.birth || '')}"></label>
      <label class="f"><span>신급</span><select id="sc-faith">${faithOptions(s)}</select></label>
      <label class="f"><span>신급 연도·반기</span><div class="row" style="gap:4px"><input type="number" id="sc-fyear" value="${s.faithYear || ''}" placeholder="2019" style="width:90px"><select id="sc-fhalf" style="width:auto"><option value="" ${!s.faithHalf ? 'selected' : ''}>—</option><option ${s.faithHalf === '상' ? 'selected' : ''}>상</option><option ${s.faithHalf === '하' ? 'selected' : ''}>하</option></select></div></label>
      <label class="f"><span>학교</span><input type="text" id="sc-school" value="${f('school')}"></label>
      ${dd.id === 'young' ? `<label class="f"><span>청년부에 들어온 길</span><select id="sc-origin">${[['', '자동 판단'], ['school', '주일학교 출신'], ['evang', '전도']].map(([k, l]) => `<option value="${esc(k)}" ${(s.origin || '') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}${dd.id === 'young' ? `<label class="f"><span>직분</span><select id="sc-crole">${churchRoleOptions(s.churchRole || '')}</select></label>` : ''}${dd.id === 'young' ? `<label class="f"><span>결혼</span><select id="sc-married"><option value="">미혼</option><option value="1" ${s.married ? 'selected' : ''}>기혼</option></select></label><label class="f"><span>결혼한 때</span><input type="text" id="sc-mdate" value="${f('marriedDate')}" placeholder="예: 2026-04 또는 2026-04-18"></label>` : ''}
      <label class="f"><span>연락처 (본인)</span><input type="tel" id="sc-phone" value="${f('phone')}"></label>
      <label class="f"><span>보호자 연락처</span><div class="row" style="gap:4px"><input type="tel" id="sc-gphone" value="${f('guardianPhone')}" style="flex:1"><select id="sc-grel" style="width:auto">${['부','모','보호자'].map(k => `<option ${(s.guardianRel || '보호자') === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div></label>
      <label class="f"><span>아버지</span><input type="text" id="sc-father" value="${f('father')}"></label>
      <label class="f"><span>어머니</span><input type="text" id="sc-mother" value="${f('mother')}"></label>
      <label class="f" style="grid-column:span 2"><span>주소</span><input type="text" id="sc-address" value="${f('address')}"></label>
      <label class="f" style="grid-column:span 2"><span>비고</span><input type="text" id="sc-note" value="${f('note')}">${noteTagsHTML('sc-note')}</label>
      ${dd.id === 'young' ? `<label class="f"><span>구분</span><select id="sc-group"><option value="" ${!['라피끄', '팸장'].includes(s.group) ? 'selected' : ''}>청년</option><option value="라피끄" ${s.group === '라피끄' ? 'selected' : ''}>라피끄</option><option value="팸장" ${s.group === '팸장' ? 'selected' : ''}>팸장 (재적에서 빠지고 팸장 탭으로)</option></select></label>` : ''}
      <label class="f"><span>제적 처리일</span><input type="date" id="sc-ldate" value="${f('leftDate')}"></label>
      <label class="f"><span>제적 구분 (결혼·직분·이사 등)</span><select id="sc-lkind"><option value="">—</option>${LEFT_KINDS.map(k => `<option ${s.leftKind === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      <label class="f" style="grid-column:span 2"><span>제적 사유</span><input type="text" id="sc-lreason" value="${f('leftReason')}" placeholder="상태가 제적일 때만 씁니다"></label>
    </div><div class="row" style="margin-top:10px"><button class="btn p" id="sc-save">저장</button><button class="btn" id="sc-clear-flags" ${s.flags && s.flags.length ? '' : 'disabled'}>확인 표시 지우기</button><button class="btn d" id="sc-del">삭제</button></div>` : ''}
    ${timelineHTML(dd, s, edit)}`;
}
BIND.dropouts = () => BIND.roster();
BIND.roster = () => {
  const dd = isCommittee() ? S.data[S.sub.dept || 'kinder'] : D();
  const po = $('#pp-open'); if (po) po.onclick = () => { S.sub.promoPrint = true; render(); };
  const pb = $('#pp-back'); if (pb) { pb.onclick = () => { delete S.sub.promoPrint; render(); }; $('#pp-print').onclick = doPrint; return; }
  const pr = $('#pp-receive'); if (pr) pr.onclick = async () => {
    const nextYear = YEAR + 1; const inc = (S.promotions || []).filter(p => p.toDept === dd.id && p.year === nextYear && !p.received);
    for (const x of inc) {
      const sid = `${dd.id}_${x.name}_${x.birth || uid()}`;
      const st = { id: sid, name: x.name, sex: x.sex || '남', birth: x.birth || '', classId: x.toClass || (dd.doc.classes[0] || {}).id || '', status: 'active', dept: dd.id, faith: x.faith || '', faithYear: x.faithYear || '', faithHalf: x.faithHalf || '', phone: x.phone || '', guardianPhone: x.guardianPhone || '', guardianRel: x.guardianRel || '', school: x.school || '', father: x.father || '', mother: x.mother || '', siblings: sibs(x), address: x.address || '', evangelist: '', scholarship: [], note: x.note || '', history: [{ year: YEAR, dept: x.fromDept, origDept: DEPTS[x.fromDept] || '', classId: x.fromClass || '', note: `${nextYear}년 진급` }], flags: [`${nextYear}년 ${DEPTS[x.fromDept]}에서 진급 — 반 배정 확인`], source: [`진급 ${nextYear}`] };
      await backend.set(`depts/${dd.id}/students/${sid}`, st); dd.students.push(st);
      const { _id, ...pd } = x; pd.received = true; pd.receivedAt = today(); await backend.set(`promotions/${_id}`, pd); x.received = true;
    }
    render(); toast(`${inc.length}명을 출석부에 받았습니다. 이전 부서에서는 연초 진급 처리 때 제적으로 바꿉니다.`);
  };
  document.querySelectorAll('[data-dept]').forEach(b => b.onclick = () => { S.sub.dept = b.dataset.dept; render(); });
  document.querySelectorAll('[data-show]').forEach(b => b.onclick = () => { S.sub.show = b.dataset.show; S.view = 'roster'; render(); });
  document.querySelectorAll('[data-year]').forEach(b => b.onclick = () => { S.sub.year = +b.dataset.year; render(); });
  const ry = $('#ro-year'); if (ry) ry.onchange = () => { const y = +ry.value; S.sub = { ...(isCommittee() && S.sub.dept ? { dept: S.sub.dept } : {}), ...(y !== YEAR ? { year: y } : {}) }; render(); };
  document.querySelectorAll('[data-group]').forEach(b => b.onclick = () => { S.sub.group = b.dataset.group; if (S.sub.show === 'away' || S.sub.show === 'paused' || S.sub.show === 'married') S.sub.show = 'active'; render(); });
  const ya = $('#ya-import'); if (ya) ya.onclick = () => importYoungAttendance(dd);
  const lp = $('#lf-print'); if (lp) lp.onclick = () => { S.sub.leftPrint = true; render(); };
  const lb = $('#lf-back'); if (lb) { lb.onclick = () => { delete S.sub.leftPrint; render(); }; $('#lf-pr').onclick = doPrint; return; }
  { const boxes = [...document.querySelectorAll('[data-rs]')]; const bt = $('#rs-batch'), cnt = $('#rs-count');
    const upd = () => { const n = boxes.filter(x => x.checked).length; if (bt) bt.disabled = !n; if (cnt) cnt.textContent = n ? `${n}명 선택됨` : '복적할 학생을 체크하세요'; boxes.forEach(x => x.closest('tr').classList.toggle('sel', x.checked)); };
    boxes.forEach(x => { x.onclick = e => e.stopPropagation(); x.onchange = upd; });
    const all = $('#rs-all'); if (all) all.onchange = () => { boxes.forEach(x => { x.checked = all.checked; }); upd(); };
    if (bt) bt.onclick = () => { const ids = boxes.filter(x => x.checked).map(x => x.dataset.rs); const ppl = ids.map(id => dd.students.find(x => x.id === id)).filter(Boolean); if (!ppl.length) return;
      openModal(`<h2>${ppl.length}명 복적<button class="btn s" id="modal-close">닫기</button></h2><p>아래 학생을 재적으로 되돌릴까요?</p><div class="row" style="gap:4px;flex-wrap:wrap;margin:6px 0 12px">${ppl.map(x => `<span class="chip">${esc(x.name)}</span>`).join('')}</div><div class="row"><button class="btn p" id="rb-yes">${ppl.length}명 복적</button><button class="btn" id="rb-no">취소</button></div>`);
      $('#rb-no').onclick = closeModal; $('#rb-yes').onclick = async () => { $('#rb-yes').disabled = true; $('#rb-yes').textContent = '처리 중…';
        await Promise.all(ppl.map(st => { (st.statusLog = st.statusLog || []).push({ date: today(), from: 'left', to: 'active', reason: '복적' }); Object.assign(st, { status: 'active', leftDate: '', leftKind: '', leftReason: '' }); return backend.set(`depts/${dd.id}/students/${st.id}`, st); }));
        closeModal(); renderHere(); toast(`${ppl.length}명 복적 — 재적 명단으로 돌아갔습니다`); }; }; }
  { // 제적 → 보관 옮기기, 과거 기록만 있는 사람 고르기
    const boxes = [...document.querySelectorAll('[data-rs]')]; const ab = $('#ar-batch'); const pk = $('#ar-pick');
    const sync = () => { const n = boxes.filter(x => x.checked).length; if (ab) ab.disabled = !n; const bt = $('#rs-batch'); if (bt) bt.disabled = !n; const c = $('#rs-count'); if (c) c.textContent = n ? `${n}명 선택됨` : '학생을 체크하세요'; boxes.forEach(x => x.closest('tr').classList.toggle('sel', x.checked)); };
    boxes.forEach(x => x.addEventListener('change', sync));
    if (pk) pk.onclick = () => { boxes.forEach(x => { const st = dd.students.find(y => y.id === x.dataset.rs); x.checked = !!(st && pastOnly(st)); }); sync(); toast('최근 2년 소속 기록이 없는 사람을 골랐습니다 — 확인 후 "보관으로"를 누르세요', 3500); };
    if (ab) ab.onclick = () => { const ppl = boxes.filter(x => x.checked).map(x => dd.students.find(y => y.id === x.dataset.rs)).filter(Boolean); if (!ppl.length) return;
      openModal(`<h2>${ppl.length}명 보관<button class="btn s" id="modal-close">닫기</button></h2><p>제적 명단에서 빼서 "보관"으로 옮길까요? 기록은 그대로 남고, 언제든 되돌릴 수 있습니다.</p><div class="row" style="gap:4px;flex-wrap:wrap;margin:6px 0 12px">${ppl.map(x => `<span class="chip">${esc(x.name)}</span>`).join('')}</div><div class="row"><button class="btn p" id="ax-yes">${ppl.length}명 보관</button><button class="btn" id="ax-no">취소</button></div>`);
      $('#modal-close').onclick = closeModal; $('#ax-no').onclick = closeModal; $('#ax-yes').onclick = async () => { $('#ax-yes').disabled = true; try { await Promise.all(ppl.map(st => { st.archived = true; (st.statusLog = st.statusLog || []).push({ date: today(), from: 'left', to: 'left', kind: '보관', reason: '제적 명단에서 보관으로' }); return backend.set(`depts/${dd.id}/students/${st.id}`, st); })); closeModal(); renderHere(); toast(`${ppl.length}명을 보관으로 옮겼습니다`); } catch (e) { closeModal(); toast('저장 실패: ' + (e.code || e.message), 4000); } }; };
  }
  { // 보관 → 제적 명단 / 복적
    const boxes = [...document.querySelectorAll('[data-ab]')]; const bl = $('#ab-left'), ba = $('#ab-active'), cnt = $('#ab-count');
    const sync = () => { const n = boxes.filter(x => x.checked).length; [bl, ba].forEach(b => { if (b) b.disabled = !n; }); if (cnt) cnt.textContent = n ? `${n}명 선택됨` : '사람을 체크하세요'; boxes.forEach(x => x.closest('tr').classList.toggle('sel', x.checked)); };
    boxes.forEach(x => { x.onclick = e => e.stopPropagation(); x.onchange = sync; }); const all = $('#ab-all'); if (all) all.onchange = () => { boxes.forEach(x => { x.checked = all.checked; }); sync(); };
    const run = async (toActive) => { const ppl = boxes.filter(x => x.checked).map(x => dd.students.find(y => y.id === x.dataset.ab)).filter(Boolean); if (!ppl.length) return;
      try { await Promise.all(ppl.map(st => { st.archived = false; if (toActive) { (st.statusLog = st.statusLog || []).push({ date: today(), from: 'left', to: 'active', reason: '복적(보관에서)' }); Object.assign(st, { status: 'active', leftDate: '', leftKind: '', leftReason: '' }); } else (st.statusLog = st.statusLog || []).push({ date: today(), from: 'left', to: 'left', kind: '제적', reason: '보관에서 제적 명단으로' }); return backend.set(`depts/${dd.id}/students/${st.id}`, st); })); renderHere(); toast(toActive ? `${ppl.length}명 복적했습니다` : `${ppl.length}명을 제적 명단으로 되돌렸습니다`); } catch (e) { toast('저장 실패: ' + (e.code || e.message), 4000); } };
    if (bl) bl.onclick = () => run(false); if (ba) ba.onclick = () => run(true);
  }
  document.querySelectorAll('[data-restore]').forEach(b => b.onclick = e => { e.stopPropagation(); const s = dd.students.find(x => x.id === b.dataset.restore); if (!s) return;
    openModal(`<h2>복적 확인<button class="btn s" id="modal-close">닫기</button></h2><p><b>${esc(s.name)}</b>${s.birth ? ` (${esc(s.birth)})` : ''}을(를) 재적으로 되돌릴까요?</p><div class="row" style="margin-top:10px"><button class="btn p" id="rs-yes">복적</button><button class="btn" id="rs-no">취소</button></div>`);
    $('#rs-no').onclick = closeModal; $('#rs-yes').onclick = async () => { $('#rs-yes').disabled = true; closeModal(); (s.statusLog = s.statusLog || []).push({ date: today(), from: 'left', to: 'active', reason: '복적' }); Object.assign(s, { status: 'active', leftDate: '', leftKind: '', leftReason: '' }); await backend.set(`depts/${dd.id}/students/${s.id}`, s); renderHere(); toast(s.name + ' 복적 — 재적 명단으로 돌아갔습니다');  };
  });
  const lg = $('#lc-go'); if (lg) lg.onclick = () => { const ids = [...document.querySelectorAll('[data-lc]:checked')].map(x => x.dataset.lc); if (!ids.length) { toast('제적할 학생을 고르세요'); return; }
    openModal(`<h2>${ids.length}명 제적 처리<button class="btn s" id="modal-close">닫기</button></h2><p>${ids.map(id => esc(sName(dd, id))).join(', ')}</p><div class="fields"><label class="f"><span>처리일</span><input type="date" id="lm-date" value="${today()}"></label><label class="f"><span>구분</span><select id="lm-kind">${LEFT_KINDS.map(k => `<option>${k}</option>`).join('')}</select></label><label class="f" style="grid-column:span 2"><span>사유</span><input type="text" id="lm-reason" value="${esc(leftRule(dd).label.replace(/ \(.*\)/, ''))}"></label></div><div class="row" style="margin-top:10px"><button class="btn p" id="lm-yes">제적 처리</button><button class="btn" id="lm-no">취소</button></div>`);
    $('#lm-no').onclick = closeModal; $('#lm-yes').onclick = async () => { for (const id of ids) { const s = dd.students.find(x => x.id === id); setLeft(s, $('#lm-date').value || today(), $('#lm-kind').value, $('#lm-reason').value.trim()); await backend.set(`depts/${dd.id}/students/${s.id}`, s); } closeModal(); renderHere(); toast(ids.length + '명 제적 처리'); }; };
  document.querySelectorAll('[data-sort]').forEach(b => b.onclick = () => { S.sub.sort = b.dataset.sort; renderHere(); });
  if (S.sub.open) { const id = S.sub.open; delete S.sub.open; setTimeout(() => { const tr = document.querySelector(`[data-student="${CSS.escape(id)}"]`); if (tr) tr.click(); }, 0); }
  if (canEdit() && !isCommittee() && !isMobile()) document.querySelectorAll('table.roster td[data-ie]').forEach(td => { td.classList.add('ie-on'); td.title = (td.title ? td.title + ' · ' : '') + '눌러서 바로 고치기'; td.onclick = e => { e.stopPropagation(); const s = dd.students.find(x => x.id === td.closest('tr').dataset.student); if (s) inlineEditor(dd, s, td, td.dataset.ie, () => renderHere()); }; });
  document.querySelectorAll('[data-student]').forEach(tr => tr.onclick = () => {
    const s = dd.students.find(x => x.id === tr.dataset.student); openModal(studentCard(dd, s)); bindTimeline(dd, s); bindHistory(dd, s); bindStudentExtras(dd, s);
    bindNoteTags();
    const scs = $('#sc-status'); if (scs) scs.onchange = () => { $('#sc-stext-w').hidden = scs.value !== 'custom'; if (scs.value === 'custom') $('#sc-stext').focus(); };
    const sv = $('#sc-save'); if (sv) sv.onclick = async () => {
      const ns0 = $('#sc-status').value, arch = ns0 === 'archived', ns = arch ? 'left' : ns0, was = s.status, ld = $('#sc-ldate').value, lk = $('#sc-lkind').value || (arch ? '보관' : ''), lr = $('#sc-lreason').value.trim();
      // 보관: 제적과 똑같이 출석·판정에서 빠지되, 제적 명단과 따로 모아 둔다(과거 기록만 있는 사람 등)
      s.archived = arch;
      if (ns === 'left' && was !== 'left') setLeft(s, ld || today(), lk || '제적', lr);
      else if (ns !== 'left' && was === 'left') { (s.statusLog = s.statusLog || []).push({ date: today(), from: 'left', to: ns, reason: '복적' }); s.leftDate = ''; s.leftKind = ''; s.leftReason = ''; }
      else if (ns === 'left') Object.assign(s, { leftDate: ld, leftKind: lk, leftReason: lr });
      if ($('#sc-group')) s.group = $('#sc-group').value;
      if ($('#sc-crole')) s.churchRole = $('#sc-crole').value; if ($('#sc-origin')) s.origin = $('#sc-origin').value;
      if ($('#sc-married')) { s.married = !!$('#sc-married').value || (ns === 'left' && lk === '결혼'); s.marriedDate = s.married ? $('#sc-mdate').value.trim() : ''; }
      Object.assign(s, { name: $('#sc-name').value.trim(), classId: $('#sc-class').value, sex: $('#sc-sex').value, status: ns, birth: $('#sc-birth').value, faith: $('#sc-faith').value, faithYear: +$('#sc-fyear').value || '', faithHalf: $('#sc-fhalf').value, school: $('#sc-school').value, phone: $('#sc-phone').value, guardianPhone: $('#sc-gphone').value, guardianRel: $('#sc-grel').value, father: $('#sc-father').value, mother: $('#sc-mother').value, address: $('#sc-address').value, note: $('#sc-note').value, statusText: ns === 'custom' ? ($('#sc-stext').value.trim() || '기타') : '' });
      await backend.set(`depts/${dd.id}/students/${s.id}`, s); closeModal(); renderHere(); toast('저장했습니다'); };
    const cf = $('#sc-clear-flags'); if (cf) cf.onclick = async () => { s.flags = []; await backend.set(`depts/${dd.id}/students/${s.id}`, s); closeModal(); render(); };
    const dl = $('#sc-del'); if (dl) dl.onclick = () => { openModal(`<h2>삭제 확인<button class="btn s" id="modal-close">닫기</button></h2><p>${esc(s.name)} 학생을 출석부에서 완전히 삭제할까요? 출석 기록이 남아 있으면 "제적" 상태로 바꾸는 쪽을 권합니다.</p><div class="row"><button class="btn d" id="sc-del-yes">삭제</button><button class="btn" id="sc-del-no">취소</button></div>`); $('#sc-del-no').onclick = closeModal; $('#sc-del-yes').onclick = async () => { await backend.del(`depts/${dd.id}/students/${s.id}`); dd.students = dd.students.filter(x => x.id !== s.id); closeModal(); render(); }; };
  });
  const sa = $('#s-add'); if (sa) sa.onclick = async () => { const n = $('#s-name').value.trim(); if (!n) return; const s = { id: `${dd.id}_${n}_${$('#s-birth').value || uid()}`, name: n, classId: $('#s-class').value, sex: $('#s-sex').value, birth: $('#s-birth').value, phone: $('#s-p').value, guardianPhone: $('#s-gp').value, guardianRel: $('#s-grel').value, faithHalf: '', note: $('#s-n').value, status: 'active', dept: dd.id, faith: '', faithYear: '', school: '', father: '', mother: '', siblings: [], address: '', evangelist: '', scholarship: [], history: [], flags: [], source: ['앱 입력 ' + today()] }; await backend.set(`depts/${dd.id}/students/${s.id}`, s); dd.students.push(s); render(); toast(n + ' 추가'); };
  const ca = $('#c-add'); if (ca) ca.onclick = async () => { const n = $('#c-name').value.trim(); if (!n) return; dd.doc.classes.push({ id: n, name: n, teacher: $('#c-teacher').value.trim(), assistant: '', order: dd.doc.classes.length + 1, flags: [] }); await saveDeptDoc(dd.id); render(); };
  document.querySelectorAll('.cls-item summary .btn').forEach(b => b.addEventListener('click', e => e.preventDefault()));
  document.querySelectorAll('[data-edit-c]').forEach(b => b.onclick = () => { const c = dd.doc.classes.find(x => x.id === b.dataset.editC); openModal(`<h2>${esc(c.name)} 수정<button class="btn s" id="modal-close">닫기</button></h2><div class="fields"><label class="f"><span>표시 이름</span><input type="text" id="ce-name" value="${esc(c.name)}"></label><label class="f"><span>담임</span><input type="text" id="ce-teacher" value="${esc(c.teacher || '')}"></label><label class="f"><span>보조</span><input type="text" id="ce-assist" value="${esc(c.assistant || '')}"></label><label class="f"><span>순서</span><input type="number" id="ce-order" value="${c.order || 0}"></label></div><div class="row" style="margin-top:10px"><button class="btn p" id="ce-save">저장</button><button class="btn" id="ce-flags" ${c.flags && c.flags.length ? '' : 'disabled'}>확인 표시 지우기</button></div>`); $('#ce-save').onclick = async () => { c.name = $('#ce-name').value.trim() || c.name; c.teacher = $('#ce-teacher').value.trim(); c.assistant = $('#ce-assist').value.trim(); c.order = +$('#ce-order').value || 0; dd.doc.classes.sort((a,b) => (a.order||0)-(b.order||0)); await saveDeptDoc(dd.id); closeModal(); render(); }; $('#ce-flags').onclick = async () => { c.flags = []; await saveDeptDoc(dd.id); closeModal(); render(); }; });
  document.querySelectorAll('[data-del-c]').forEach(b => b.onclick = async () => { if (classStudents(dd, b.dataset.delC).length) { toast('학생이 있는 반은 삭제할 수 없습니다'); return; } dd.doc.classes = dd.doc.classes.filter(c => c.id !== b.dataset.delC); await saveDeptDoc(dd.id); render(); });
  const ta = $('#t-add'); if (ta) ta.onclick = async () => { const n = $('#t-name').value.trim(); if (!n) return; dd.doc.staff.push({ id: `${dd.id}_${n}`, name: n, role: $('#t-role').value.trim(), classId: '', phone: $('#t-phone').value.trim(), birth: '', faith: '', status: 'active', since: YEAR, moveNote: '', note: '', flags: [] }); await saveDeptDoc(dd.id); render(); };
  const vis = visibleStaff(dd);
  document.querySelectorAll('[data-edit-t]').forEach(b => b.onclick = () => { const t = vis[+b.dataset.editT]; openModal(`<h2>${esc(t.name)} 수정<button class="btn s" id="modal-close">닫기</button></h2>${t.flags && t.flags.length ? `<div class="flags">${t.flags.map(esc).join('<br>')}</div>` : ''}<div class="fields" style="margin-top:8px"><label class="f"><span>이름</span><input type="text" id="te-name" value="${esc(t.name)}"></label><label class="f"><span>역할</span><input type="text" id="te-role" value="${esc(t.role)}"></label><label class="f"><span>반</span><input type="text" id="te-class" value="${esc(t.classId || '')}"></label><label class="f"><span>연락처</span><input type="tel" id="te-phone" value="${esc(t.phone || '')}"></label><label class="f" style="grid-column:span 2"><span>비고</span><input type="text" id="te-note" value="${esc(t.note || '')}"></label></div><div class="row" style="margin-top:10px"><button class="btn p" id="te-save">저장</button><button class="btn" id="te-left">퇴임 처리</button></div>`); $('#te-save').onclick = async () => { Object.assign(t, { name: $('#te-name').value.trim(), role: $('#te-role').value.trim(), classId: $('#te-class').value.trim(), phone: $('#te-phone').value.trim(), note: $('#te-note').value.trim(), flags: [] }); await saveDeptDoc(dd.id); closeModal(); render(); }; $('#te-left').onclick = async () => { t.status = 'left'; await saveDeptDoc(dd.id); closeModal(); render(); }; });
  document.querySelectorAll('[data-del-t]').forEach(b => b.onclick = async () => { const t = vis[+b.dataset.delT]; dd.doc.staff = dd.doc.staff.filter(x => x !== t); await saveDeptDoc(dd.id); render(); });
};

/* ───────────── 주일 보고서 ───────────── */
function blankReport(dd, date) { return { dept: dd.id, date, united: false, weekLabel: `${+date.slice(5,7)}월 ${weekIndex(date)}주`, type: `${dd.doc.name} 주일예배`, presider: '', prayer: '', text: '', title: '', preacher: '', notice: '', counts: {}, att: {}, attUnmatched: {}, absent: {}, newcomers: [], offering: { sunday: 0, tithe: 0, thanks: 0, other: 0 }, teachersPresent: [], teachersAbsent: {}, famDone: {}, activity: '', meeting: '', special: '', schedule: [], classRows: [], writer: '', flags: [], status: 'draft', source: '앱 입력' }; }
/* 주일 보고서 저장 — 처음 저장은 통째로, 그다음부터는 바뀐 칸만(출석·결석 사유는 학생 한 명 단위).
   교사 여러 명이 휴대폰으로 같은 주일 출석을 동시에 체크해도 서로 덮어쓰지 않는다. 저장 뒤 서버 것을 다시 읽어 남이 바꾼 것도 합친다. */
const jsonEq = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const clone = x => x == null ? x : JSON.parse(JSON.stringify(x));
async function saveReport(dd, r) {
  const p = `depts/${dd.id}/reports/${r.date}`; dd.reportBase = dd.reportBase || {}; const base = dd.reportBase[r.date];
  const { _id, ...cur } = r;
  // 처음 저장(서버에 아직 없는 주일): 통째로 덮어쓰지 않고 합쳐 쓴다 — 두 사람이 같은 새 주일을 동시에 처음 저장해도 출석이 모두 남음
  // 빈 양식 그대로인 칸(빈 설교 제목, 0원 헌금, 작성 중 상태 등)은 보내지 않는다 — 먼저 저장한 사람의 내용을 기본값으로 덮지 않도록
  if (!base) { const blank = blankReport(dd, r.date); const first = { dept: cur.dept, date: cur.date };
    Object.keys(cur).forEach(k => { if (!jsonEq(cur[k], blank[k])) first[k] = cur[k]; });
    await backend.setMerge(p, first); }
  else {
    const ch = []; const MAPS = ['att', 'absent', 'famDone', 'outingLinks'];
    new Set([...Object.keys(base), ...Object.keys(cur)]).forEach(k => {
      if (k === '_id') return;
      if (MAPS.includes(k) && cur[k] && typeof cur[k] === 'object' && base[k] && typeof base[k] === 'object') { new Set([...Object.keys(base[k]), ...Object.keys(cur[k])]).forEach(id => { if (!jsonEq(base[k][id], cur[k][id])) ch.push([[k, id], cur[k][id] === undefined ? DEL : cur[k][id]]); }); }
      else if (!jsonEq(base[k], cur[k])) ch.push([[k], cur[k] === undefined ? DEL : cur[k]]);
    });
    if (ch.length) { try { await backend.update(p, ch); } catch (e) { if (/not-found|No document/i.test(e.code || e.message)) await backend.setMerge(p, cur); else throw e; } }
  }
  const got = await backend.get(p); const fresh = got ? { ...blankReport(dd, r.date), ...got } : cur; Object.keys(r).forEach(k => delete r[k]); Object.assign(r, fresh);
  dd.reports[r.date] = r; dd.reportBase[r.date] = clone(fresh);
}
VIEWS.weekly = async () => {
  const dd = D();
  if (S.sub.preview) return reportPaper(dd, dd.reports[S.sub.preview], true);
  if (S.sub.date) { const r = dd.reports[S.sub.date] || blankReport(dd, S.sub.date); return editor(dd, r); }
  return reportList(dd);
};
function reportRow(dd, r, edit) {
  const s = reportStats(dd, r);
  return `<tr><td>${fmtK(r.date)}</td><td>${r.status === 'done' ? '<span class="pill ok">완료</span>' : '<span class="pill warn">작성 중</span>'}${isUnited(r) ? ' <span class="pill info">세대통합</span>' : ''}${r.imported ? ' <span class="pill mute" title="HWP에서 변환">변환</span>' : ''}${r.flags && r.flags.length ? ' <span class="tag flag" title="' + esc(r.flags.join(' / ')) + '">!</span>' : ''}</td><td class="n">${s.p} / ${s.total}</td><td class="n">${s.rate}%</td><td class="n">${won(s.offSum)}</td><td class="note" style="max-width:260px;overflow:hidden;text-overflow:ellipsis" title="${esc(r.text)} ${esc(r.title)}">${esc(r.text)} ${esc(r.title)}</td><td>${edit ? `<button class="btn s" data-edit="${esc(r.date)}">열기</button> ` : ''}<button class="btn s" data-prev="${esc(r.date)}">보기</button></td></tr>`;
}
function reportTable(dd, rows, edit) {
  return `<div class="tw"><table class="rtab"><thead><tr><th>날짜</th><th>상태</th><th class="n">출석/재적</th><th class="n">출석률</th><th class="n">헌금</th><th>설교</th><th></th></tr></thead><tbody>${rows.map(r => reportRow(dd, r, edit)).join('') || '<tr><td colspan="7" class="note">보고서가 없습니다.</td></tr>'}</tbody></table></div>`;
}
// 주일 고르기: 연도 → 그해 주일 목록 (날짜 칸에 숫자를 치다 0002년이 되는 일을 막는다)
function sundaysOfYear(y) { const out = []; const d = new Date(y, 0, 1); while (d.getDay() !== 0) d.setDate(d.getDate() + 1); while (d.getFullYear() === y) { out.push(iso(d)); d.setDate(d.getDate() + 7); } return out; }
function sundayPicker(pick, dd) {
  const y = +pick.slice(0, 4); const firstY = Math.min(2019, ...Object.keys(dd.reports).map(d => +d.slice(0, 4)).filter(Boolean));
  const years = []; for (let k = YEAR + 1; k >= firstY; k--) years.push(k);
  const days = sundaysOfYear(y); if (!days.includes(pick)) days.push(pick); days.sort();
  return `<div class="sun-pick"><button class="btn s" data-sun-step="-7" title="지난 주일">‹</button><select id="w-year" style="width:auto">${years.map(k => `<option ${k === y ? 'selected' : ''}>${k}</option>`).join('')}</select><select id="w-date" style="width:auto">${days.map(d => `<option value="${esc(d)}" ${d === pick ? 'selected' : ''}>${+d.slice(5, 7)}월 ${+d.slice(8)}일${dd.reports[d] ? (dd.reports[d].status === 'done' ? ' ✓' : ' ·작성 중') : ''}</option>`).join('')}</select><button class="btn s" data-sun-step="7" title="다음 주일">›</button></div>`;
}
function reportList(dd, opts = {}) {
  const list = Object.values(dd.reports).sort((a, b) => a.date < b.date ? 1 : -1);
  const edit = canEdit() && !isCommittee();
  const recent = list.slice(0, 12), older = list.slice(12);
  const latest = list.find(r => r.status === 'done') || list[0];
  const pick = S.sub.pick || lastSunday(); const cur = dd.reports[pick];
  const status = !cur ? '<span class="pill warn">미작성</span>' : cur.status === 'done' ? '<span class="pill ok">작성 완료</span>' : '<span class="pill warn">작성 중</span>';
  const writePanel = edit ? `<div class="card write"><div class="row" style="justify-content:space-between"><div><div class="wt">주일 보고서 작성</div><div class="note">날짜를 고르고 작성을 누르세요. 출석은 이름을 누르기만 하면 됩니다.</div></div>
      <div class="row">${sundayPicker(pick, dd)}${status}<button class="btn p big" id="w-new">${!cur ? '작성 시작' : cur.status === 'done' ? '열어서 수정' : '이어서 작성'}</button>${cur ? `<button class="btn" data-prev="${esc(pick)}">보기</button>` : ''}</div></div></div>` : '';
  const months = {}; older.forEach(r => { (months[ym(r.date)] = months[ym(r.date)] || []).push(r); });
  const olderHTML = Object.keys(months).sort().reverse().map(m => `<details class="card fold"><summary>${m.replace('-', '년 ')}월 <span class="note">${months[m].length}장</span></summary>${reportTable(dd, months[m], edit)}</details>`).join('');
  return `<div class="topbar"><div><h1>주일 보고서${opts.title || ''}</h1><div class="sub">${edit ? '최근 보고서가 펼쳐져 있고, 그 전은 달별로 접혀 있습니다' : '열람 전용 · 작성·수정은 PC에서'}</div></div></div>
  ${opts.pick || ''}
  ${writePanel}
  <div class="recent">
    ${latest ? `<div class="card thumbcard"><h2>직전 보고서 <span class="r">${fmtK(latest.date)}</span></h2><div class="thumb" data-prev="${esc(latest.date)}" title="눌러서 크게 보기"><div class="thumb-inner">${reportPaper(dd, latest, false)}</div></div></div>` : ''}
    <div class="card recent-list"><h2>최근 보고서 <span class="r">최근 ${recent.length}장</span></h2><div class="recent-scroll">${reportTable(dd, recent, edit)}</div></div>
  </div>
  ${olderHTML ? `<div class="stack" style="margin-top:14px">${olderHTML}</div>` : ''}`;
}
// 내 반: 나중에 교사별 로그인이 생기면 S.teacher(로그인한 교사 이름)와 반의 담임을 맞춰 정함. 그 전에는 이 기기에서 고른 반
function myClassIds(dd) {
  if (S.teacher) return dd.doc.classes.filter(c => String(c.teacher || '').split(/[,·\s]+/).includes(S.teacher)).map(c => c.id);
  let v = ''; try { v = localStorage.getItem('cbcs-myclass-' + dd.id) || ''; } catch (e) {}
  return v && dd.doc.classes.some(c => c.id === v) ? [v] : [];
}
/* 팸(반·목장)별 출석 확인 완료: 담당 교사가 자기 팸 출석을 다 확인했으면 누른다. 서기는 아직 안 끝난 팸만 기다리면 된다 */
function famDoneBtn(dd, r, id) { const v = (r.famDone || {})[id]; return `<button class="btn s ${v ? 'ok-on' : ''}" data-famdone="${esc(id)}" title="${v ? '확인 완료 ' + esc(v) + ' — 누르면 되돌림' : '이 ' + esc(dd.doc.classLabel) + ' 출석을 다 확인했으면 누르세요'}">${v ? '✓ 확인 완료' : '확인 완료'}</button>`; }
function famDoneCount(dd, r) { const ids = dd.doc.classes.filter(c => classStudents(dd, c.id).length).map(c => c.id); const done = ids.filter(id => (r && r.famDone || {})[id]); return { ids, done, wait: dd.doc.classes.filter(c => ids.includes(c.id) && !done.includes(c.id)) }; }
function attButtons(r, st) { return st.map(x => { const a = r.att[x.id] || ''; return `<div class="s ${a === 'P' ? 'p' : a === 'O' ? 'o' : ''}"><button data-att="${esc(x.id)}">${esc(x.name)}</button>${a ? `<span class="m">${a === 'P' ? '출석' : '온라인·본당'}</span>` : ''}</div>`; }).join('') || '<div class="note">학생 없음</div>'; }
// 휴대폰 출석 체크: 반마다 접어 두고, 내 반만 펼침. 결석 사유도 반 안에서 적음
function attSectionMobile(dd, r) {
  const s = reportStats(dd, r); const mine = myClassIds(dd); S.attOpen = S.attOpen || {};
  const group = (id, name, sub, st) => { const open = S.attOpen[id] ?? mine.includes(id); const abs = st.filter(x => !r.att[x.id]);
    return `<details class="cls m-cls" data-cls="${esc(id)}" ${open ? 'open' : ''}><summary><h3>${esc(name)}${mine.includes(id) ? ' <span class="pill info">내 반</span>' : ''} <span>${esc(sub)} · ${st.filter(x => r.att[x.id]).length}/${st.length}${(r.famDone || {})[id] ? ' · ✓' : ''}</span></h3></summary>
      <div class="att">${attButtons(r, st)}</div>
      ${id !== '__none' ? `<div class="row" style="margin:6px 0">${famDoneBtn(dd, r, id)}</div>` : ''}
      ${abs.length ? `<div class="m-abs"><div class="note">결석 사유</div>${abs.map(x => `<label class="m-abs-row"><span>${esc(x.name)}</span><input type="text" data-abs="${esc(x.id)}" value="${esc(r.absent[x.id] || '')}" placeholder="사유"></label>`).join('')}</div>` : ''}</details>`; };
  const loose = activeStudents(dd).filter(x => !dd.doc.classes.some(c => c.id === x.classId));
  return `<div class="card"><h2>출석 체크 <span class="r">한 번 누르면 출석, 두 번 온라인·본당, 세 번 결석</span></h2>
    <div class="tiles" style="margin-bottom:10px"><div class="tile"><div class="v">${s.p}</div><div class="l">출석 / 재적 ${s.total}</div></div><div class="tile"><div class="v">${s.rate}%</div><div class="l">출석률</div></div></div>
    ${S.teacher ? '' : `<label class="f" style="margin-bottom:10px"><span>내 ${esc(dd.doc.classLabel)} (이 휴대폰에서 펼쳐 둘 ${esc(dd.doc.classLabel)})</span><select id="a-mine"><option value="">고르지 않음 — 모두 접기</option>${dd.doc.classes.map(c => `<option value="${esc(c.id)}" ${mine.includes(c.id) ? 'selected' : ''}>${esc(c.name)}${c.teacher ? ' (' + esc(c.teacher) + ')' : ''}</option>`).join('')}</select></label>`}
    ${dd.doc.classes.map(c => group(c.id, c.name, c.teacher || '', classStudents(dd, c.id))).join('')}
    ${loose.length ? group('__none', dd.doc.classLabel + ' 미배정', '', loose) : ''}
  </div>`;
}
function attSection(dd, r, mobileOnly) {
  if (mobileOnly && isMobile()) return attSectionMobile(dd, r);
  const s = reportStats(dd, r);
  const unmatched = Object.keys(r.attUnmatched || {});
  return `<div class="card"><h2>${mobileOnly ? '출석 체크' : '2. 출석 체크'} <span class="r">한 번 누르면 출석, 두 번 누르면 온라인·본당, 세 번 누르면 결석</span></h2>
      ${(() => { const f = famDoneCount(dd, r); return f.ids.length ? `<div class="note" style="margin:-4px 0 8px">${esc(dd.doc.classLabel)} 출석 확인 ${f.done.length}/${f.ids.length}${f.wait.length ? ' · 기다리는 ' + esc(dd.doc.classLabel) + ': ' + f.wait.map(c => esc(c.name)).join(', ') : ' · 모두 확인'}</div>` : ''; })()}
      <div class="tiles" style="margin-bottom:12px"><div class="tile"><div class="v">${s.p}</div><div class="l">출석 / 재적 ${s.total}</div></div><div class="tile"><div class="v">${s.m} · ${s.f}</div><div class="l">남 · 여</div></div><div class="tile"><div class="v">${s.site} + ${s.on}</div><div class="l">현장 + 온라인·본당</div></div><div class="tile"><div class="v">${s.rate}%</div><div class="l">출석률 <span class="tag">자동</span></div></div></div>
      ${dd.doc.classes.map(c => { const st = classStudents(dd, c.id); return `<div class="cls"><h3>${esc(c.name)} <span>${esc(c.teacher || '')} · ${st.filter(x => r.att[x.id]).length}/${st.length}</span> ${st.length ? famDoneBtn(dd, r, c.id) : ''}</h3><div class="att">
        ${st.map(x => { const a = r.att[x.id] || ''; return `<div class="s ${a === 'P' ? 'p' : a === 'O' ? 'o' : ''}"><button data-att="${esc(x.id)}">${esc(x.name)}</button>${a ? `<span class="m">${a === 'P' ? '출석' : '온라인·본당'}</span>` : ''}</div>`; }).join('') || '<div class="note">학생 없음</div>'}
      </div></div>`; }).join('')}
      ${(() => { const st = activeStudents(dd).filter(x => !dd.doc.classes.some(c => c.id === x.classId)); return st.length ? `<div class="cls"><h3>반 미배정</h3><div class="att">${st.map(x => { const a = r.att[x.id] || ''; return `<div class="s ${a === 'P' ? 'p' : a === 'O' ? 'o' : ''}"><button data-att="${esc(x.id)}">${esc(x.name)}</button>${a ? `<span class="m">${a === 'P' ? '출석' : '온라인·본당'}</span>` : ''}</div>`; }).join('')}</div></div>` : ''; })()}
      ${unmatched.length ? `<div class="hint" style="margin-top:6px">출석부에 없는 출석자(변환 자료): ${unmatched.map(esc).join(', ')}</div>` : ''}
      <h3 style="font-size:13px;margin:8px 0 6px">결석자 사유 <span class="tag">결석자는 자동 나열</span></h3>
      <div class="list">${activeStudents(dd).filter(x => !r.att[x.id]).map(x => `<div class="item"><div class="t">${esc(x.name)} <span class="note">${esc((classOf(dd, x) || {}).name || '')}</span></div><input type="text" data-abs="${esc(x.id)}" value="${esc(r.absent[x.id] || '')}" placeholder="사유" style="max-width:320px"></div>`).join('') || '<div class="note">전원 출석</div>'}</div>
    </div>`;
}
function editor(dd, r) {
  const s = reportStats(dd, r);
  const ev = allEvents(dd).filter(e => ym(e.date) === ym(r.date));
  const tp = new Set(r.teachersPresent || []);
  return `<div class="topbar"><div><h1>${fmtK(r.date)} 주일 보고서</h1><div class="sub">${esc(dd.doc.name)} · ${+r.date.slice(5,7)}월 ${weekIndex(r.date)}주${r.imported ? ' · HWP에서 변환된 자료' : ''}</div></div><div class="row"><button class="btn" id="w-back">목록</button><button class="btn" id="w-save">임시 저장</button><button class="btn p" id="w-done">작성 완료</button></div></div>
  ${r.flags && r.flags.length ? `<div class="flags" style="margin-bottom:12px">확인 필요: ${r.flags.map(esc).join(' / ')} <button class="btn s" id="w-clear-flags">확인했음</button></div>` : ''}
  <div class="stack">
    <div class="card"><h2>1. 예배 현황 <span class="r"><button class="btn s" id="w-prev">지난주에서 가져오기</button></span></h2><div class="fields">
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
      <div class="card"><h2>3. 새친구 (방문 제외)</h2><div class="list">${(r.newcomers || []).map((n, i) => `<div class="item"><div><div class="t">${esc(n.name)}</div><div class="d">${esc(n.school || '')} · 인도자 ${esc(n.by || '')}${n.note ? ' · ' + esc(n.note) : ''}</div></div><button class="btn s d" data-del-nc="${esc(i)}">삭제</button></div>`).join('')}</div>
        <div class="fields" style="margin-top:8px"><label class="f"><span>이름</span><input type="text" id="nc-name"></label><label class="f"><span>학교·학년</span><input type="text" id="nc-school"></label><label class="f"><span>인도자</span><input type="text" id="nc-by"></label><label class="f"><span>성별</span><select id="nc-sex"><option value="">고르기</option><option>남</option><option>여</option></select></label><label class="f"><span>${esc(dd.doc.classLabel)}</span><select id="nc-class">${dd.doc.classes.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label></div>
        <div class="row" style="margin-top:8px"><button class="btn" id="nc-add">등록 → 출석부에 추가</button></div></div>
      <div class="card"><h2>4. 헌금 <span class="r">합계 <span class="tag">자동</span> ${won(s.offSum)}원</span></h2><div class="fields">
        <label class="f"><span>주일헌금</span><input type="number" id="o-sunday" value="${r.offering.sunday || ''}"></label>
        <label class="f"><span>십일조</span><input type="number" id="o-tithe" value="${r.offering.tithe || ''}"></label>
        <label class="f"><span>감사헌금</span><input type="number" id="o-thanks" value="${r.offering.thanks || ''}"></label>
        <label class="f"><span>기타·특별</span><input type="number" id="o-other" value="${r.offering.other || ''}"></label>
      </div>${r.offering.raw ? `<div class="note" style="margin-top:6px">원문: ${esc(r.offering.raw)}</div>` : ''}</div>
    </div>
    <div class="card"><h2>5. 교사 출결 <span class="r">출석 ${tp.size}명 · 결석 ${Object.keys(r.teachersAbsent || {}).length}명</span></h2>
      <div class="att">${visibleStaff(dd).map(t => `<div class="s ${tp.has(t.name) ? 'p' : ''}"><button data-tatt="${esc(t.name)}">${esc(t.name)} <span class="note">${esc(t.role)}</span></button></div>`).join('')}</div>
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
  document.querySelectorAll('[data-famdone]').forEach(b => b.onclick = async e => { e.preventDefault(); e.stopPropagation(); keep(); const id = b.dataset.famdone; r.famDone = { ...(r.famDone || {}) }; if (r.famDone[id]) delete r.famDone[id]; else r.famDone[id] = new Date().toISOString().slice(0, 16).replace('T', ' '); await saveReport(dd, r); renderHere(); });
  document.querySelectorAll('[data-att]').forEach(b => b.onclick = async () => { keep(); const id = b.dataset.att; const a = r.att[id]; if (!a) r.att[id] = 'P'; else if (a === 'P') r.att[id] = 'O'; else delete r.att[id]; if (r.att[id]) delete r.absent[id]; await saveReport(dd, r); renderHere(); });
}
BIND.weekly = () => {
  const dd = D();
  if (S.sub.preview) { bindPaper(); return; }
  if (!S.sub.date) { const n = $('#w-new'); if (n) n.onclick = () => { const dt = $('#w-date').value; if (!dt) return; S.sub = { date: dt }; render(); }; const wd = $('#w-date'); if (wd) wd.onchange = e => { S.sub.pick = e.target.value; renderHere(); }; const wy = $('#w-year'); if (wy) wy.onchange = () => { const y = +wy.value; const cur = $('#w-date').value; const md = cur.slice(5); const days = sundaysOfYear(y); S.sub.pick = days.find(d => d.slice(5) >= md) || days[days.length - 1]; renderHere(); }; document.querySelectorAll('[data-sun-step]').forEach(b => b.onclick = () => { const d = new Date($('#w-date').value + 'T00:00:00'); d.setDate(d.getDate() + +b.dataset.sunStep); S.sub.pick = iso(d); renderHere(); }); document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { S.sub = { date: b.dataset.edit }; render(); }); document.querySelectorAll('[data-prev]').forEach(b => b.onclick = () => { S.sub = { preview: b.dataset.prev }; render(); }); return; }
  const r = dd.reports[S.sub.date] || blankReport(dd, S.sub.date); dd.reports[S.sub.date] = r;
  const keep = () => collect(dd, r);
  $('#w-back').onclick = async () => { keep(); await saveReport(dd, r); S.sub = {}; render(); };
  $('#w-save').onclick = async () => { keep(); await saveReport(dd, r); toast('임시 저장했습니다'); };
  // 지난주에서 가져오기: 매주 비슷한 칸(예배 종류·사회자·기도·설교자·작성자)만 골라 채운다. 출석·헌금·새친구·완료 상태는 가져오지 않는다
  const wp = $('#w-prev'); if (wp) wp.onclick = () => { keep(); const prev = Object.values(dd.reports).filter(x => x.date < r.date && (x.preacher || x.presider || x.prayer || x.writer)).sort((a, b) => a.date < b.date ? 1 : -1)[0];
    if (!prev) { toast('가져올 지난 보고서가 없습니다'); return; }
    const F = [['type', '예배 종류'], ['presider', '사회자'], ['prayer', '대표기도'], ['preacher', '설교자'], ['writer', '작성자']].filter(([k]) => String(prev[k] || '').trim());
    openModal(`<h2>${fmtK(prev.date)} 보고서에서 가져오기<button class="btn s" id="modal-close">닫기</button></h2><p class="note">고른 칸만 채웁니다. 이미 적은 칸은 덮어씁니다. 출석·헌금·새친구는 가져오지 않습니다.</p><div class="list">${F.map(([k, l]) => `<label class="item"><input type="checkbox" data-wp="${k}" ${k === 'prayer' ? '' : 'checked'}> <b style="min-width:70px;display:inline-block">${l}</b> ${esc(prev[k])}${r[k] && r[k] !== prev[k] ? ` <span class="note">(지금: ${esc(r[k])})</span>` : ''}</label>`).join('')}</div><div class="row" style="margin-top:10px"><button class="btn p" id="wp-go">채우기</button></div>`);
    $('#modal-close').onclick = closeModal; $('#wp-go').onclick = () => { document.querySelectorAll('[data-wp]:checked').forEach(x => { const el = $('#r-' + x.dataset.wp); if (el) el.value = prev[x.dataset.wp]; }); S.dirty = true; closeModal(); toast('채웠습니다 — 확인 후 저장하세요'); }; };
  $('#w-done').onclick = async () => { keep();
    const st = reportStats(dd, r); const miss = [!String(r.title || '').trim() && '설교 제목', !String(r.preacher || '').trim() && '설교자', !st.p && '출석(아무도 체크 안 됨)', !st.offSum && '헌금(모두 0원)'].filter(Boolean);
    if (miss.length && !r._doneOk) { openModal(`<h2>작성 완료 전 확인<button class="btn s" id="modal-close">닫기</button></h2><p>아래 칸이 비어 있습니다.</p><ul>${miss.map(x => `<li>${esc(x)}</li>`).join('')}</ul><p class="note">정말 없는 경우(예배 없음, 헌금 없음 등)에는 "그래도 완료"를 누르세요. 비어 있는 그대로 완료됩니다.</p><div class="row"><button class="btn" id="wd-back">돌아가서 채우기</button><button class="btn p" id="wd-go">그래도 완료</button></div>`);
      $('#modal-close').onclick = closeModal; $('#wd-back').onclick = closeModal; $('#wd-go').onclick = () => { closeModal(); r._doneOk = true; $('#w-done').click(); }; return; }
    delete r._doneOk; r.status = 'done'; await saveReport(dd, r); S.sub = { preview: r.date }; render(); toast('작성 완료 — 미리보기에서 PDF로 저장하세요'); };
  const cf = $('#w-clear-flags'); if (cf) cf.onclick = async () => { keep(); r.flags = []; await saveReport(dd, r); render(); };
  bindAttButtons(dd, r, keep);
  document.querySelectorAll('[data-tatt]').forEach(b => b.onclick = async () => { keep(); const n = b.dataset.tatt; r.teachersPresent = r.teachersPresent || []; if (r.teachersPresent.includes(n)) r.teachersPresent = r.teachersPresent.filter(x => x !== n); else { r.teachersPresent.push(n); delete r.teachersAbsent[n]; } await saveReport(dd, r); render(); });
  $('#nc-add').onclick = async () => { const n = $('#nc-name').value.trim(); if (!n) return; if (!$('#nc-sex').value) { toast('성별을 골라 주세요 (출석 통계에 쓰입니다)'); return; } keep(); const sid = `${dd.id}_${n}_${uid()}`; const st = { id: sid, name: n, classId: $('#nc-class').value, sex: $('#nc-sex').value, birth: '', phone: '', guardianPhone: '', note: '새친구 ' + r.date, status: 'newcomer', dept: dd.id, faith: '', school: $('#nc-school').value.trim(), father: '', mother: '', siblings: [], address: '', evangelist: $('#nc-by').value, scholarship: [], history: [], flags: ['새친구 등록 — 재적 전환 여부와 생년월일 확인'], source: ['주일 보고서 ' + r.date] }; await backend.set(`depts/${dd.id}/students/${sid}`, st); dd.students.push(st); r.newcomers = r.newcomers || []; r.newcomers.push({ name: n, school: $('#nc-school').value, by: $('#nc-by').value, sid }); r.att[sid] = 'P'; await saveReport(dd, r); render(); toast(n + ' 등록 — 출석부(새친구)에 추가'); };
  document.querySelectorAll('[data-del-nc]').forEach(b => b.onclick = async () => { keep(); const n = r.newcomers.splice(+b.dataset.delNc, 1)[0]; if (n && n.sid) { await backend.del(`depts/${dd.id}/students/${n.sid}`); dd.students = dd.students.filter(s => s.id !== n.sid); delete r.att[n.sid]; } await saveReport(dd, r); render(); });
};
/* 모바일: 출석 체크 전용 */
VIEWS.attend = async () => {
  const dd = D(); const date = S.sub.date || lastSunday(); const r = dd.reports[date] || blankReport(dd, date); dd.reports[date] = r;
  return `<div class="topbar"><div><h1>출석 체크</h1><div class="sub">${fmtK(date)} · 체크는 바로 저장됩니다</div></div><div class="row"><input type="date" id="a-date" value="${esc(date)}" style="width:auto"></div></div>
  <div class="stack">${attSection(dd, r, true).replace('edit-only', '')}<div class="row"><button class="btn p" id="a-save">결석 사유 저장</button><span class="note">나머지 항목(설교·헌금·회의 내용)은 PC에서 작성합니다.</span></div></div>`;
};
BIND.attend = () => {
  const dd = D(); const date = S.sub.date || lastSunday(); const r = dd.reports[date];
  const keep = () => { document.querySelectorAll('[data-abs]').forEach(i => { if (i.value.trim()) r.absent[i.dataset.abs] = i.value.trim(); else delete r.absent[i.dataset.abs]; }); };
  bindAttButtons(dd, r, keep);
  document.querySelectorAll('details[data-cls]').forEach(d => d.addEventListener('toggle', () => { S.attOpen = S.attOpen || {}; S.attOpen[d.dataset.cls] = d.open; }));
  const mi = $('#a-mine'); if (mi) mi.onchange = () => { keep(); try { localStorage.setItem('cbcs-myclass-' + dd.id, mi.value); } catch (e) {} S.attOpen = {}; render(); };
  $('#a-save').onclick = async () => { keep(); await saveReport(dd, r); toast('결석 사유를 저장했습니다'); };
  // 결석 사유는 칸을 벗어나면 바로 저장 (저장 단추를 안 눌러도 사라지지 않게). 저장이 끝나기 전에 떠나면 경고가 뜬다
  document.querySelectorAll('[data-abs]').forEach(i => i.addEventListener('change', () => { if (S.dirty) $('#a-save').click(); }));
  $('#a-date').onchange = async e => { if (S.dirty) { keep(); await saveReport(dd, r); } S.sub.date = e.target.value; render(); };
};
/* 열람 전용 보고서 목록 (모바일 부서 / 교육위원회) */
VIEWS.reports = async () => {
  let dd;
  if (isCommittee()) { const d = S.sub.dept || 'kinder'; dd = await loadDept(d); } else dd = D();
  if (S.sub.preview) return reportPaper(dd, dd.reports[S.sub.preview], true);
  const pick = isCommittee() ? `<div class="row" style="margin-bottom:10px">${Object.entries(DEPTS).map(([k,v]) => `<button class="btn ${dd.id === k ? 'p' : ''}" data-dept="${esc(k)}">${v}</button>`).join('')}</div>` : '';
  return reportList(dd, { title: ' — ' + esc(dd.doc.name), pick });
};
BIND.reports = () => { if (S.sub.preview) { bindPaper(); return; } document.querySelectorAll('[data-dept]').forEach(b => b.onclick = () => { S.sub = { dept: b.dataset.dept }; render(); }); document.querySelectorAll('[data-prev]').forEach(b => b.onclick = () => { S.sub.preview = b.dataset.prev; render(); }); };
function bindPaper() { const b = $('#p-back'); if (b) b.onclick = () => { delete S.sub.preview; render(); }; const p = $('#p-print'); if (p) p.onclick = doPrint; const e = $('#p-edit'); if (e) e.onclick = () => { S.view = 'weekly'; S.sub = { date: S.sub.preview }; render(); }; }

/* 보고서 종이 */
function reportPaper(dd, r, withBar) {
  if (!r) return `<div class="hint">보고서가 없습니다.</div>`;
  const s = reportStats(dd, r);
  const ev = allEvents(dd).filter(e => ym(e.date) === ym(r.date));
  const head = dd.doc.staff.find(t => t.status !== 'left' && /부장|회장/.test(t.role)); const sec = dd.doc.staff.find(t => t.status !== 'left' && /총무|서기/.test(t.role));
  const hasNames = Object.keys(r.att || {}).length > 0;
  const classRows = hasNames ? dd.doc.classes.map(c => { const st = classStudents(dd, c.id); const pr = st.filter(x => r.att[x.id]); const ab = st.filter(x => !r.att[x.id]); return `<tr><td>${esc(c.name)}</td><td>${esc(c.teacher || '')}</td><td>${pr.map(x => esc(x.name) + (r.att[x.id] === 'O' ? '(온라인·본당)' : '')).join(', ')}</td><td class="n">${st.length}</td><td class="n">${pr.length}</td><td>${ab.map(x => esc(x.name) + (r.absent[x.id] ? `(${esc(r.absent[x.id])})` : '')).join(', ')}</td></tr>`; }).join('')
    : (r.classRows || []).map(c => `<tr><td>${esc(c.classId)}</td><td>${esc(c.teacher || '')}</td><td>${(c.present || []).map(esc).join(', ')}</td><td class="n">${esc(c.reg ?? '')}</td><td class="n">${esc(c.att ?? '')}</td><td>${Object.entries(r.absent || {}).filter(([k]) => true).length ? '' : ''}</td></tr>`).join('');
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
  const dd = D(); await loadReceipts(dd); const m = S.sub.month || today().slice(0, 7); const lid = S.sub.ledger || (dd.doc.ledgers[0] || {}).id; const L = dd.doc.ledgers.find(l => l.id === lid);
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
    ${budgetVsCard(dd, lid, m)}
    <div class="card"><h2>${S.sub.all ? '전체' : +m.slice(5) + '월'} 지출 내역 <span class="r">${esc(L.name)} · ${ex.length}건</span></h2><div class="tw"><table><thead><tr><th>날짜</th><th>항목</th><th>세부 내역</th><th class="n">금액</th><th>청구</th><th class="c">영수증</th><th></th></tr></thead><tbody>
      ${ex.map(e => `<tr><td>${e.date ? e.date.slice(2) : '<span class="pill warn">날짜 없음</span>'}</td><td>${esc(e.category)}</td><td class="wrap">${esc(e.desc)}${e.note ? ` <span class="note">(${esc(e.note)})</span>` : ''}${e.flags && e.flags.length ? ` <span class="tag flag" title="${esc(e.flags.join(' / '))}">!</span>` : ''}</td><td class="n">${won(e.amount)}</td><td class="note">${esc(e.requester || '')}</td>${receiptCell(dd, e)}<td style="white-space:nowrap"><button class="btn s" data-voucher="${esc(e.id)}" title="지출결의서">결의서</button> <button class="btn s edit-only" data-edit-e="${esc(e.id)}">수정</button> <button class="btn s d edit-only" data-del-e="${esc(e.id)}">삭제</button></td></tr>`).join('') || '<tr><td colspan="7" class="note">지출이 없습니다.</td></tr>'}
      <tr class="sum"><td colspan="3">합계</td><td class="n">${won(ex.reduce((a, e) => a + (+e.amount || 0), 0))}</td><td colspan="3"></td></tr></tbody></table></div>
      <div class="fields edit-only" style="margin-top:12px"><label class="f"><span>날짜</span><input type="date" id="e-date" value="${today()}"></label><label class="f"><span>항목</span><select id="e-cat">${CATS.map(c => `<option>${c}</option>`).join('')}</select></label><label class="f" style="grid-column:span 2"><span>세부 내역</span><input type="text" id="e-desc" placeholder="예: 10월 생일 축하 케이크·선물 (4명)"></label><label class="f"><span>금액</span><input type="number" id="e-amt"></label><label class="f"><span>청구인</span><input type="text" id="e-req"></label><label class="f"><span>영수증</span><select id="e-rc"><option value="1">있음</option><option value="0">없음</option></select></label></div>
      <div class="row edit-only" style="margin-top:8px"><button class="btn p" id="e-add">지출 추가</button></div></div>
    <div class="card"><h2>${S.sub.all ? '전체' : +m.slice(5) + '월'} 수입 (찬조·회비·후원) <span class="r">${inc.length}건</span></h2><div class="tw"><table><thead><tr><th>날짜</th><th>내역</th><th class="n">금액</th><th></th></tr></thead><tbody>${inc.map(e => `<tr><td>${e.date ? e.date.slice(2) : '<span class="pill warn">날짜 없음</span>'}</td><td class="wrap">${esc(e.desc)}${e.note ? ` <span class="note">(${esc(e.note)})</span>` : ''}</td><td class="n">${won(e.amount)}</td><td><button class="btn s d edit-only" data-del-i="${esc(e.id)}">삭제</button></td></tr>`).join('') || '<tr><td colspan="4" class="note">수입이 없습니다.</td></tr>'}</tbody></table></div>
      <div class="row edit-only" style="margin-top:10px"><input type="date" id="i-date" value="${today()}" style="width:auto"><input type="text" id="i-desc" placeholder="내역" style="flex:1"><input type="number" id="i-amt" placeholder="금액" style="width:140px"><button class="btn" id="i-add">수입 추가</button></div></div>
    <div class="card edit-only"><h2>장부 설정</h2><div class="row"><label class="f" style="flex:1"><span>장부 이름</span><input type="text" id="l-name" value="${esc(L.name)}"></label><label class="f" style="flex:1"><span>종류</span><select id="l-kind"><option value="budget" ${L.kind === 'budget' ? 'selected' : ''}>연간 예산형 (집행률)</option><option value="balance" ${L.kind !== 'budget' ? 'selected' : ''}>잔액형 (찬조금·수련회·현금)</option></select></label><label class="f" style="flex:1"><span>연간 예산</span><input type="number" id="l-budget" value="${L.budget || 0}"></label><label class="f" style="flex:1"><span>연초 이월액</span><input type="number" id="l-carry" value="${L.carry || 0}"></label><button class="btn" id="l-save" style="align-self:flex-end">저장</button></div>
      <div class="row" style="margin-top:10px"><input type="text" id="l-new" placeholder="새 장부 (예: 여름수련회)" style="flex:1"><input type="number" id="l-new-budget" placeholder="연간 예산(0=잔액형)" style="width:160px"><button class="btn" id="l-add">장부 추가</button></div></div>
  </div>`;
};
BIND.ledger = () => {
  const dd = D(); const lid = S.sub.ledger || (dd.doc.ledgers[0] || {}).id; const L = dd.doc.ledgers.find(l => l.id === lid);
  if (S.sub.voucherView) { $('#v-back').onclick = () => { delete S.sub.voucherView; render(); }; $('#v-print').onclick = doPrint; $('#v-edit').onclick = () => { S.sub.voucherEdit = S.sub.voucherView; delete S.sub.voucherView; render(); }; return; }
  if (S.sub.voucherEdit) { bindVoucherForm(); $('#v-cancel').onclick = () => { delete S.sub.voucherEdit; render(); };
    $('#v-save').onclick = async () => { const isNew = S.sub.voucherEdit === 'new'; const e = isNew ? { id: 'e_' + uid(), dept: dd.id, approver: '', settled: '', source: '지출결의서' } : dd.expenses.find(x => x.id === S.sub.voucherEdit); readVoucherForm(e); if (!e.amount || !e.desc) { toast('적요와 금액을 넣어 주세요'); return; } await backend.set(`depts/${dd.id}/expenses/${e.id}`, e); if (isNew) dd.expenses.push(e); const na = await syncAssetsFromExpense(dd, e); S.sub = { ledger: e.ledgerId, month: ym(e.date), voucherView: e.id }; render(); toast('저장했습니다' + (na ? ` · 물품대장 ${na}건 등록` : '') + ' — 결의서를 인쇄하세요'); };
    return; }
  const vn = $('#v-new'); if (vn) vn.onclick = () => { S.sub.voucherEdit = 'new'; render(); };
  document.querySelectorAll('[data-voucher]').forEach(b => b.onclick = () => { S.sub.voucherView = b.dataset.voucher; render(); });
  bindReceiptView(dd);
  bindMonthNav(); document.querySelectorAll('[data-ledger]').forEach(b => b.onclick = () => { S.sub.ledger = b.dataset.ledger; render(); });
  const la = $('#l-all'); if (la) la.onclick = () => { S.sub.all = !S.sub.all; render(); };
  const add = $('#l-add'); if (add) add.onclick = async () => { const n = $('#l-new').value.trim(); if (!n) return; const b = +$('#l-new-budget').value || 0; const id = `${dd.id}_${uid()}`; dd.doc.ledgers.push({ id, name: n, budget: b, carry: 0, kind: b ? 'budget' : 'balance', note: '', flags: [] }); await saveDeptDoc(dd.id); S.sub.ledger = id; render(); };
  if (!L) return;
  const ea = $('#e-add'); if (ea) ea.onclick = async () => { const a = +$('#e-amt').value; const ds = $('#e-desc').value.trim(); if (!a || !ds) { toast('내역과 금액을 넣어 주세요'); return; } const e = { id: 'e_' + uid(), dept: dd.id, ledgerId: lid, date: $('#e-date').value, category: $('#e-cat').value, desc: ds, amount: a, requester: $('#e-req').value.trim(), approver: '', receipt: $('#e-rc').value === '1', settled: '', note: '', flags: [], source: '앱 입력' }; if (isAssetLike(e.desc, e.category)) e.items = [{ desc: e.desc, qty: '', price: '', amount: e.amount, asset: true }]; await backend.set(`depts/${dd.id}/expenses/${e.id}`, e); dd.expenses.push(e); const na = await syncAssetsFromExpense(dd, e); S.sub.month = ym(e.date); render(); toast('지출 추가' + (na ? ' · 물품대장에 자동 등록' : '')); };
  document.querySelectorAll('[data-del-e]').forEach(b => b.onclick = async () => { await backend.del(`depts/${dd.id}/expenses/${b.dataset.delE}`); dd.expenses = dd.expenses.filter(e => e.id !== b.dataset.delE); render(); });
  document.querySelectorAll('[data-edit-e]').forEach(b => b.onclick = () => { const e = dd.expenses.find(x => x.id === b.dataset.editE); openModal(`<h2>지출 수정<button class="btn s" id="modal-close">닫기</button></h2>${e.flags && e.flags.length ? `<div class="flags">${e.flags.map(esc).join('<br>')}</div>` : ''}<div class="fields" style="margin-top:8px"><label class="f"><span>날짜</span><input type="date" id="ee-date" value="${esc(e.date || '')}"></label><label class="f"><span>항목</span><select id="ee-cat">${CATS.map(c => `<option ${c === e.category ? 'selected' : ''}>${c}</option>`).join('')}${CATS.includes(e.category) ? '' : `<option selected>${esc(e.category)}</option>`}</select></label><label class="f" style="grid-column:span 2"><span>세부 내역</span><input type="text" id="ee-desc" value="${esc(e.desc)}"></label><label class="f"><span>금액</span><input type="number" id="ee-amt" value="${esc(e.amount)}"></label><label class="f"><span>청구인</span><input type="text" id="ee-req" value="${esc(e.requester || '')}"></label><label class="f"><span>영수증</span><select id="ee-rc"><option value="1" ${e.receipt ? 'selected' : ''}>있음</option><option value="0" ${e.receipt ? '' : 'selected'}>없음</option></select></label><label class="f"><span>장부</span><select id="ee-ledger">${dd.doc.ledgers.map(l => `<option value="${esc(l.id)}" ${l.id === e.ledgerId ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label><label class="f" style="grid-column:span 2"><span>메모</span><input type="text" id="ee-note" value="${esc(e.note || '')}"></label></div><div class="row" style="margin-top:10px"><button class="btn p" id="ee-save">저장</button></div>`); $('#ee-save').onclick = async () => { Object.assign(e, { date: $('#ee-date').value, category: $('#ee-cat').value, desc: $('#ee-desc').value.trim(), amount: +$('#ee-amt').value || 0, requester: $('#ee-req').value.trim(), receipt: $('#ee-rc').value === '1', ledgerId: $('#ee-ledger').value, note: $('#ee-note').value.trim(), flags: [] }); await backend.set(`depts/${dd.id}/expenses/${e.id}`, e); closeModal(); render(); }; });
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
  <div class="tw"><table id="v-items"><thead><tr><th>내역</th><th>수량</th><th>단가</th><th>금액</th><th title="기자재·교재·비품이면 물품대장에 자동 등록">물품대장</th><th></th></tr></thead><tbody>${items.map((i, k) => `<tr><td><input type="text" class="vi-desc" value="${esc(i.desc || '')}"></td><td><input type="number" class="vi-qty" value="${i.qty || ''}" style="width:70px"></td><td><input type="number" class="vi-price" value="${i.price || ''}" style="width:110px"></td><td><input type="number" class="vi-amt" value="${i.amount || ''}" style="width:120px"></td><td class="c"><input type="checkbox" class="vi-asset" ${i.asset || (i.asset === undefined && isAssetLike(i.desc, e.category)) ? 'checked' : ''}></td><td><button class="btn s d vi-del">×</button></td></tr>`).join('')}</tbody></table></div>
  <div class="row" style="margin-top:6px"><button class="btn s" id="v-add-item">줄 추가</button><span class="note" id="v-total"></span><span class="note">· "물품대장"에 체크한 줄은 저장할 때 물품대장에 자동으로 들어갑니다(기자재·교재·비품은 자동 체크).</span></div>
  <label class="f" style="margin-top:10px"><span>메모</span><input type="text" id="v-note" value="${esc(e.note || '')}"></label>
  ${receiptPicker(dd, e)}`;
}
function bindVoucherForm() {
  const recalc = () => { let t = 0; document.querySelectorAll('#v-items tbody tr').forEach(tr => { const q = +tr.querySelector('.vi-qty').value, p = +tr.querySelector('.vi-price').value, a = tr.querySelector('.vi-amt'); if (q && p && document.activeElement !== a) a.value = q * p; t += +a.value || 0; }); $('#v-total').textContent = `합계 ${won(t)}원`; };
  const wire = () => { document.querySelectorAll('#v-items input').forEach(i => i.oninput = recalc); document.querySelectorAll('#v-items .vi-desc').forEach(i => i.addEventListener('change', () => { const cb = i.closest('tr').querySelector('.vi-asset'); if (!cb.dataset.touched) cb.checked = isAssetLike(i.value, $('#v-cat').value); })); document.querySelectorAll('#v-items .vi-asset').forEach(cb => cb.onchange = () => { cb.dataset.touched = '1'; }); document.querySelectorAll('.vi-del').forEach(b => b.onclick = () => { if (document.querySelectorAll('#v-items tbody tr').length > 1) { b.closest('tr').remove(); recalc(); } }); };
  $('#v-add-item').onclick = () => { const tr = document.querySelector('#v-items tbody tr').cloneNode(true); tr.querySelectorAll('input').forEach(i => { if (i.type === 'checkbox') { i.checked = false; delete i.dataset.touched; } else i.value = ''; }); document.querySelector('#v-items tbody').appendChild(tr); wire(); };
  wire(); recalc(); bindReceiptPicker();
}
function readVoucherForm(e) {
  const items = [...document.querySelectorAll('#v-items tbody tr')].map(tr => ({ desc: tr.querySelector('.vi-desc').value.trim(), qty: +tr.querySelector('.vi-qty').value || '', price: +tr.querySelector('.vi-price').value || '', amount: +tr.querySelector('.vi-amt').value || 0, asset: tr.querySelector('.vi-asset').checked })).filter(i => i.desc || i.amount);
  Object.assign(e, { date: $('#v-date').value, ledgerId: $('#v-ledger').value, category: $('#v-cat').value, requester: $('#v-req').value.trim(), desc: $('#v-desc').value.trim() || (items[0] || {}).desc || '', payMethod: $('#v-pay').value, payTo: $('#v-payto').value.trim(), receipt: $('#v-rc').value === '1', note: $('#v-note').value.trim(), items, amount: items.reduce((a, i) => a + i.amount, 0), voucher: true, flags: [] });
  const rs = $('#v-receipt'); if (rs) e.receiptId = rs.value || '';
  return e;
}

/* ───────────── 물품대장 ───────────── */
const ASSET_KW = /(교재|공과|워크북|성경|도서|책\b|교구|기자재|스피커|마이크|앰프|믹서|프로젝터|빔|스크린|모니터|TV|티비|노트북|태블릿|아이패드|컴퓨터|카메라|삼각대|키보드|피아노|악기|기타줄|케이블|젠더|충전기|멀티탭|프린터|토너|복합기|의자|책상|테이블|선반|수납|정리함|보관함|캐비닛|사물함|화이트보드|칠판|이젤|현수막|배너|텐트|천막|공놀이|공\b|블록|퍼즐|장난감|매트|에어바운스|헌금바구니|가운|비품|가습기|선풍기|청소기|정수기|전기포트|분리수거함)/;
const ASSET_EXCLUDE = /(간식|식사|식비|점심|저녁|아침|도시락|피자|치킨|커피|음료|과자|케이크|선물|생일|상품권|문화상품권|기프트|축하|회비|교통|택시|주유|입장료|숙박|대여료|장소\s*사용)/;
const ASSET_CATS = ['기자재','교재·도서','교구·놀이','가구·비품','악기·음향','소모품','기타'];
const ASSET_STATUS = ['사용 중','보관','수리 필요','대여 중','폐기','분실'];
function isAssetLike(desc, category) { const t = String(desc || ''); if (ASSET_EXCLUDE.test(t)) return false; return category === '비품' || ASSET_KW.test(t); }
function guessAssetCat(t) { t = String(t || ''); if (/(교재|공과|워크북|성경|도서|책)/.test(t)) return '교재·도서'; if (/(스피커|마이크|앰프|믹서|피아노|악기|기타줄)/.test(t)) return '악기·음향'; if (/(프로젝터|빔|스크린|모니터|TV|티비|노트북|태블릿|아이패드|컴퓨터|카메라|삼각대|키보드|케이블|젠더|충전기|프린터|복합기)/.test(t)) return '기자재'; if (/(교구|블록|퍼즐|장난감|공놀이|공\b|매트|에어바운스)/.test(t)) return '교구·놀이'; if (/(의자|책상|테이블|선반|수납|정리함|보관함|캐비닛|사물함|화이트보드|칠판|이젤|분리수거함)/.test(t)) return '가구·비품'; if (/(토너|멀티탭)/.test(t)) return '소모품'; return '기타'; }
/* 물품 등록번호: {부서}{연도 2자리}-{구입 월}-{그 해 부서 순번 3자리}  예) 중26-10-001
   부서 글자 — 영유치부 유, 초등부 초, 중고등부 중, 청년부 청 (예전엔 영문 첫 글자라 중고등부(youth)·청년부(young)가 둘 다 Y로 겹쳤음)
   순번은 부서마다, 해마다 1부터 다시 센다. */
const ASSET_CODE = { kinder: '유', elem: '초', youth: '중', young: '청' };
function assetNo(dd, date) { const d = date || today(); const y = d.slice(2, 4); const code = ASSET_CODE[dd.id] || dd.id.slice(0, 1).toUpperCase();
  const nums = dd.assets.filter(a => String(a.no || '').startsWith(code + y + '-')).map(a => +(String(a.no).split('-')[2] || 0));
  return `${code}${y}-${d.slice(5, 7)}-${String(Math.max(0, ...nums) + 1).padStart(3, '0')}`; }
function assetFromItem(dd, e, it, idx) {
  return { id: `as_${e.id}_${idx}`, no: '', name: it.desc || e.desc, category: guessAssetCat(it.desc || e.desc), spec: '', qty: +it.qty || 1, unit: '개', price: +it.price || (+it.qty ? Math.round((+it.amount || 0) / +it.qty) : +it.amount || 0), total: +it.amount || 0, purchaseDate: e.date || '', vendor: e.payTo || '', location: '', manager: e.requester || '', status: '사용 중', expenseId: e.id, ledgerId: e.ledgerId, source: 'auto', note: '', disposedAt: '', updated: today() };
}
async function syncAssetsFromExpense(dd, e) { // 결의서 줄 중 "물품대장" 체크된 줄을 등록·갱신
  const items = (e.items && e.items.length ? e.items : [{ desc: e.desc, qty: '', price: '', amount: e.amount, asset: false }]);
  let n = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i], id = `as_${e.id}_${i}`, cur = dd.assets.find(a => a.id === id);
    if (it.asset) {
      const base = assetFromItem(dd, e, it, i);
      const rec = cur ? { ...cur, name: cur.nameEdited ? cur.name : base.name, qty: base.qty, price: base.price, total: base.total, purchaseDate: base.purchaseDate, vendor: cur.vendor || base.vendor, manager: cur.manager || base.manager, ledgerId: base.ledgerId, updated: today() } : { ...base, no: assetNo(dd, base.purchaseDate) };
      await backend.set(`depts/${dd.id}/assets/${id}`, rec); if (cur) Object.assign(cur, rec); else { dd.assets.push(rec); n++; }
    } else if (cur && cur.source === 'auto' && !cur.location && cur.status === '사용 중') { await backend.del(`depts/${dd.id}/assets/${id}`); dd.assets = dd.assets.filter(a => a.id !== id); }
  }
  return n;
}
function assetCandidates(dd) { // 이전(변환) 지출 중 물품으로 보이는 것 — 아직 등록·제외하지 않은 것
  const linked = new Set(dd.assets.map(a => a.expenseId)); const skip = new Set(dd.doc.assetSkip || []);
  return dd.expenses.filter(e => !linked.has(e.id) && !skip.has(e.id) && isAssetLike(e.desc, e.category) && !/수련회/.test(e.ledgerId || '') ).sort((a, b) => (b.date || '') < (a.date || '') ? -1 : 1);
}
function assetForm(dd, a) {
  return `<div class="fields">
    <label class="f" style="grid-column:span 2"><span>품명</span><input type="text" id="as-name" value="${esc(a.name || '')}"></label>
    <label class="f"><span>분류</span><select id="as-cat">${ASSET_CATS.map(c => `<option ${a.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <label class="f"><span>규격·모델</span><input type="text" id="as-spec" value="${esc(a.spec || '')}"></label>
    <label class="f"><span>수량</span><input type="number" id="as-qty" value="${a.qty || 1}"></label>
    <label class="f"><span>단위</span><input type="text" id="as-unit" value="${esc(a.unit || '개')}"></label>
    <label class="f"><span>단가</span><input type="number" id="as-price" value="${a.price || ''}"></label>
    <label class="f"><span>금액</span><input type="number" id="as-total" value="${a.total || ''}"></label>
    <label class="f"><span>구매일</span><input type="date" id="as-date" value="${esc(a.purchaseDate || '')}"></label>
    <label class="f"><span>구매처</span><input type="text" id="as-vendor" value="${esc(a.vendor || '')}"></label>
    <label class="f"><span>보관 장소</span><input type="text" id="as-loc" value="${esc(a.location || '')}" placeholder="예: 유치부실 수납장 2칸"></label>
    <label class="f"><span>관리자</span><input type="text" id="as-mgr" value="${esc(a.manager || '')}"></label>
    <label class="f"><span>상태</span><select id="as-status">${ASSET_STATUS.map(c => `<option ${a.status === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <label class="f"><span>폐기·분실일</span><input type="date" id="as-disposed" value="${esc(a.disposedAt || '')}"></label>
    <label class="f" style="grid-column:span 2"><span>비고</span><input type="text" id="as-note" value="${esc(a.note || '')}"></label>
  </div>`;
}
function readAssetForm(a) {
  const name = $('#as-name').value.trim(); if (a.name && name !== a.name) a.nameEdited = true;
  Object.assign(a, { name, category: $('#as-cat').value, spec: $('#as-spec').value.trim(), qty: +$('#as-qty').value || 1, unit: $('#as-unit').value.trim() || '개', price: +$('#as-price').value || 0, total: +$('#as-total').value || (+$('#as-price').value || 0) * (+$('#as-qty').value || 1), purchaseDate: $('#as-date').value, vendor: $('#as-vendor').value.trim(), location: $('#as-loc').value.trim(), manager: $('#as-mgr').value.trim(), status: $('#as-status').value, disposedAt: $('#as-disposed').value, note: $('#as-note').value.trim(), updated: today() });
  return a;
}
function assetPaper(dd, list) {
  return `<section class="paper"><div class="hd"><div><h1>${esc(dd.doc.name)} 물품관리대장</h1><div class="sub">중앙성서교회 교육위원회 · ${today()} 기준</div></div><div class="meta">${list.length}건 · 합계 ${won(list.reduce((a, x) => a + (+x.total || 0), 0))}원</div></div>
    <table><thead><tr><th>관리번호</th><th>품명</th><th>분류</th><th class="n">수량</th><th class="n">금액</th><th>구매일</th><th>보관 장소</th><th>관리자</th><th>상태</th><th>확인</th></tr></thead><tbody>${list.map(a => `<tr><td>${esc(a.no || '')}</td><td>${esc(a.name)}${a.spec ? ' (' + esc(a.spec) + ')' : ''}</td><td>${esc(a.category)}</td><td class="n">${a.qty || ''}${esc(a.unit || '')}</td><td class="n">${won(a.total)}</td><td>${esc(a.purchaseDate || '')}</td><td>${esc(a.location || '')}</td><td>${esc(a.manager || '')}</td><td>${esc(a.status || '')}</td><td></td></tr>`).join('')}</tbody></table>
    <div class="merge">"확인" 칸은 연말 재물 조사 때 실물 확인 표시용입니다.</div>
    <div class="ft"><b>중앙성서교회 교육위원회</b><span>CBCS에서 생성 · ${esc(dd.doc.name)}-물품대장-${today()}.pdf</span></div></section>`;
}
VIEWS.assets = async () => {
  let dd; if (isCommittee()) { dd = await loadDept(S.sub.dept || 'kinder'); } else dd = D();
  const q = (S.sub.q || '').trim(), st = S.sub.st || 'live', cat = S.sub.cat || '';
  let list = dd.assets.filter(a => (st === 'all' || (st === 'live' ? !['폐기', '분실'].includes(a.status) : ['폐기', '분실'].includes(a.status))) && (!cat || a.category === cat) && (!q || [a.name, a.spec, a.location, a.manager, a.note, a.no].join(' ').includes(q)));
  list.sort((a, b) => (b.purchaseDate || '') < (a.purchaseDate || '') ? -1 : 1);
  if (S.sub.print) return `<div class="topbar no-print"><div><h1>물품대장 출력</h1></div><div class="row"><button class="btn" id="as-back">물품대장으로</button><button class="btn p" id="as-print">PDF로 저장 / 인쇄</button></div></div>${assetPaper(dd, list)}`;
  const edit = canEdit() && !isCommittee();
  const cand = edit ? assetCandidates(dd) : [];
  const pick = isCommittee() ? `<div class="row" style="margin-bottom:10px">${Object.entries(DEPTS).map(([k, v]) => `<button class="btn ${dd.id === k ? 'p' : ''}" data-dept="${esc(k)}">${v}</button>`).join('')}</div>` : '';
  const total = list.reduce((a, x) => a + (+x.total || 0), 0);
  return `<div class="topbar"><div><h1>물품대장${isCommittee() ? ' — ' + esc(dd.doc.name) : ''}</h1><div class="sub">지출결의서에서 기자재·교재·비품을 사면 자동으로 들어옵니다. 직접 입력도 됩니다.</div></div><div class="row">${edit ? '<button class="btn p" id="as-new">물품 직접 등록</button>' : ''}${canEdit() ? '<button class="btn" id="as-open-print">대장 출력</button>' : ''}</div></div>
  ${pick}
  <div class="stack">
    ${cand.length ? `<div class="card"><h2>회계에서 찾은 물품 후보 <span class="r">${cand.length}건 · 이전 지출 중 기자재·교재·비품으로 보이는 것</span></h2><div class="tw"><table><thead><tr><th>구매일</th><th>내역</th><th class="n">금액</th><th>청구</th><th></th></tr></thead><tbody>${cand.slice(0, S.sub.allCand ? 999 : 8).map(e => `<tr><td>${esc(e.date || '')}</td><td class="wrap">${esc(e.desc)}</td><td class="n">${won(e.amount)}</td><td>${esc(e.requester || '')}</td><td style="white-space:nowrap"><button class="btn s" data-cand-add="${esc(e.id)}">등록</button> <button class="btn s" data-cand-skip="${esc(e.id)}">물품 아님</button></td></tr>`).join('')}</tbody></table></div>
      <div class="row" style="margin-top:8px">${cand.length > 8 && !S.sub.allCand ? `<button class="btn s" id="cand-all">전체 ${cand.length}건 보기</button>` : ''}<button class="btn s" id="cand-add-all">후보 ${cand.length}건 모두 등록</button></div></div>` : ''}
    <div class="card"><h2>물품 <span class="r">${list.length}건 · 합계 ${won(total)}원</span></h2>
      <div class="row" style="margin-bottom:10px"><input type="text" id="as-q" value="${esc(q)}" placeholder="품명·보관 장소·관리자 검색" style="flex:1;min-width:180px"><select id="as-cat-f" style="width:auto"><option value="">모든 분류</option>${ASSET_CATS.map(c => `<option ${cat === c ? 'selected' : ''}>${c}</option>`).join('')}</select>${[['live', '보유'], ['gone', '폐기·분실'], ['all', '전체']].map(([k, v]) => `<button class="btn s ${st === k ? 'p' : ''}" data-st="${esc(k)}">${v}</button>`).join('')}</div>
      <div class="tw"><table><thead><tr><th>관리번호</th><th>품명</th><th>분류</th><th class="n">수량</th><th class="n">금액</th><th>구매일</th><th>보관 장소</th><th>관리자</th><th>상태</th><th></th></tr></thead><tbody>
      ${list.map(a => `<tr class="click" data-asset="${esc(a.id)}"><td>${esc(a.no || '')}</td><td class="wrap">${esc(a.name)}${a.spec ? ` <span class="note">${esc(a.spec)}</span>` : ''}</td><td>${esc(a.category)}</td><td class="n">${a.qty || ''}${esc(a.unit || '')}</td><td class="n">${won(a.total)}</td><td>${esc(a.purchaseDate || '')}</td><td class="wrap">${a.location ? esc(a.location) : '<span class="pill warn">미입력</span>'}</td><td>${esc(a.manager || '')}</td><td><span class="pill ${a.status === '사용 중' || a.status === '보관' ? 'ok' : a.status === '폐기' || a.status === '분실' ? 'mute' : 'warn'}">${esc(a.status)}</span></td><td>${a.source === 'auto' ? '<span class="pill mute" title="지출에서 자동 등록">자동</span>' : ''}</td></tr>`).join('') || '<tr><td colspan="10" class="note">등록된 물품이 없습니다.</td></tr>'}
      </tbody></table></div></div>
  </div>`;
};
BIND.assets = () => {
  const dd = isCommittee() ? S.data[S.sub.dept || 'kinder'] : D();
  document.querySelectorAll('[data-dept]').forEach(b => b.onclick = () => { S.sub = { dept: b.dataset.dept }; render(); });
  const op = $('#as-open-print'); if (op) op.onclick = () => { S.sub.print = true; render(); };
  const bk = $('#as-back'); if (bk) { bk.onclick = () => { delete S.sub.print; render(); }; $('#as-print').onclick = doPrint; return; }
  const qi = $('#as-q'); if (qi) qi.onchange = () => { S.sub.q = qi.value; render(); };
  const cf = $('#as-cat-f'); if (cf) cf.onchange = () => { S.sub.cat = cf.value; render(); };
  document.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { S.sub.st = b.dataset.st; render(); });
  const ca = $('#cand-all'); if (ca) ca.onclick = () => { S.sub.allCand = true; render(); };
  const addFromExpense = async e => { const items = e.items && e.items.length ? e.items : [{ desc: e.desc, qty: '', price: '', amount: e.amount }]; let n = 0; for (let i = 0; i < items.length; i++) { const id = `as_${e.id}_${i}`; if (dd.assets.some(a => a.id === id)) continue; const rec0 = assetFromItem(dd, e, items[i], i); const rec = { ...rec0, no: assetNo(dd, rec0.purchaseDate) }; await backend.set(`depts/${dd.id}/assets/${id}`, rec); dd.assets.push(rec); n++; } return n; };
  document.querySelectorAll('[data-cand-add]').forEach(b => b.onclick = async () => { await addFromExpense(dd.expenses.find(e => e.id === b.dataset.candAdd)); render(); toast('물품대장에 등록 — 보관 장소를 넣어 주세요'); });
  document.querySelectorAll('[data-cand-skip]').forEach(b => b.onclick = async () => { dd.doc.assetSkip = [...(dd.doc.assetSkip || []), b.dataset.candSkip]; await saveDeptDoc(dd.id); render(); });
  const aa = $('#cand-add-all'); if (aa) aa.onclick = async () => { let n = 0; for (const e of assetCandidates(dd)) n += await addFromExpense(e); render(); toast(`${n}건 등록했습니다`); };
  const nw = $('#as-new'); if (nw) nw.onclick = () => { const a = { id: 'as_' + uid(), no: assetNo(dd), name: '', category: '기자재', qty: 1, unit: '개', status: '사용 중', purchaseDate: today(), source: 'manual' }; openModal(`<h2>물품 직접 등록<button class="btn s" id="modal-close">닫기</button></h2><div class="note" style="margin-bottom:8px">관리번호 ${esc(a.no)} (자동)</div>${assetForm(dd, a)}<div class="row" style="margin-top:10px"><button class="btn p" id="as-save">저장</button></div>`); $('#as-save').onclick = async () => { readAssetForm(a); if (!a.name) { toast('품명을 넣어 주세요'); return; } await backend.set(`depts/${dd.id}/assets/${a.id}`, a); dd.assets.push(a); closeModal(); render(); }; };
  document.querySelectorAll('[data-asset]').forEach(tr => tr.onclick = () => { const a = dd.assets.find(x => x.id === tr.dataset.asset); const ex = a.expenseId ? dd.expenses.find(e => e.id === a.expenseId) : null; const ed = canEdit() && !isCommittee();
    openModal(`<h2>${esc(a.name)} <span class="note">${esc(a.no || '')}</span><button class="btn s" id="modal-close">닫기</button></h2>${ex ? `<div class="note" style="margin-bottom:8px">연결된 지출: ${esc(ex.date || '')} · ${esc(ex.desc)} · ${won(ex.amount)}원 ${ed ? `<button class="btn s" id="as-voucher">결의서 보기</button>` : ''}</div>` : '<div class="note" style="margin-bottom:8px">직접 등록한 물품</div>'}${ed ? assetForm(dd, a) + `<div class="row" style="margin-top:10px"><button class="btn p" id="as-save">저장</button><button class="btn d" id="as-del">삭제</button></div>` : `<dl class="kvl"><dt>분류</dt><dd>${esc(a.category)}</dd><dt>수량</dt><dd>${a.qty}${esc(a.unit || '')}</dd><dt>금액</dt><dd>${won(a.total)}원</dd><dt>구매일</dt><dd>${esc(a.purchaseDate || '')}</dd><dt>보관 장소</dt><dd>${esc(a.location || '')}</dd><dt>관리자</dt><dd>${esc(a.manager || '')}</dd><dt>상태</dt><dd>${esc(a.status)}</dd><dt>비고</dt><dd>${esc(a.note || '')}</dd></dl>`}`);
    const sv = $('#as-save'); if (sv) sv.onclick = async () => { readAssetForm(a); await backend.set(`depts/${dd.id}/assets/${a.id}`, a); closeModal(); render(); toast('저장했습니다'); };
    const dl = $('#as-del'); if (dl) dl.onclick = async () => { await backend.del(`depts/${dd.id}/assets/${a.id}`); dd.assets = dd.assets.filter(x => x.id !== a.id); if (a.expenseId) { dd.doc.assetSkip = [...(dd.doc.assetSkip || []), a.expenseId]; await saveDeptDoc(dd.id); } closeModal(); render(); };
    const vv = $('#as-voucher'); if (vv) vv.onclick = () => { closeModal(); S.view = 'ledger'; S.sub = { ledger: ex.ledgerId, voucherView: ex.id }; render(); };
  });
};

/* ───────────── 월간 보고서 ───────────── */
/* 월간 보고서 제출본 고정: 제출한 날의 보고서를 그대로 저장해 둔다. 뒤에 주일 보고서·장부를 고쳐도 제출본은 바뀌지 않는다 */
async function monthSnap(dd, m) { dd.msnap = dd.msnap || {}; if (!(m in dd.msnap)) { try { dd.msnap[m] = await backend.get(`depts/${dd.id}/monthlySnaps/${m}`); } catch (e) { dd.msnap[m] = null; } } return dd.msnap[m]; }
function monthlyShown(dd, m, snap, edit) {
  if (snap && !S.sub.mLive) return `<div class="card no-print" style="border-left:4px solid var(--ok)"><b>제출본</b> — ${esc(snap.at)}에 고정한 보고서입니다. 그 뒤 주일 보고서·장부를 고쳐도 이 내용은 바뀌지 않습니다. <span class="row" style="display:inline-flex;gap:6px;margin-left:8px"><button class="btn s" id="m-live">지금 자료로 보기</button>${edit ? '<button class="btn s d" id="m-unsnap">고정 풀기</button>' : ''}</span></div>${snap.html}`;
  return `${snap ? `<div class="card no-print"><b>지금 자료로 보는 중</b> — ${esc(snap.at)}에 고정한 제출본이 따로 있습니다. <button class="btn s" id="m-snapview">제출본 보기</button></div>` : ''}${monthlyPaper(dd, m)}`;
}
VIEWS.monthly = async () => {
  const m = S.sub.month || prevMonth(today().slice(0, 7));
  if (isCommittee()) {
    const d = S.sub.dept || 'kinder'; const dd = await loadDept(d); const snap = await monthSnap(dd, m);
    return `<div class="topbar no-print"><div><h1>월간 보고서</h1><div class="sub">부서를 고르면 그 달 보고서가 보입니다${snap ? ' · 이 달은 제출본이 고정되어 있습니다' : ''}</div></div>${canEdit() ? '<button class="btn p" id="m-print">PDF로 저장 / 인쇄</button>' : ''}</div><div class="stack">${monthNav(m)}<div class="row no-print">${Object.entries(DEPTS).map(([k,v]) => `<button class="btn ${d === k ? 'p' : ''}" data-dept="${esc(k)}">${v}</button>`).join('')}</div>${monthlyShown(dd, m, snap, false)}</div>`;
  }
  const dd = D(); const snap = await monthSnap(dd, m);
  return `<div class="topbar no-print"><div><h1>월간 보고서</h1><div class="sub">주일 보고서와 회계에서 자동으로 모입니다. 다음 달 계획만 적으면 됩니다.</div></div>${canEdit() ? '<button class="btn p" id="m-print">PDF로 저장 / 인쇄</button>' : ''}</div>
  <div class="stack">${monthNav(m)}
    <div class="card edit-only"><h2>${+nextMonth(m).slice(5)}월 계획 <span class="r">부장 입력 · 한 줄에 한 주</span></h2><textarea id="m-plan" placeholder="1주: …&#10;2주: …">${esc(dd.doc.monthlyPlans[nextMonth(m)] || '')}</textarea><div class="row" style="margin-top:8px"><button class="btn" id="m-save">저장</button><button class="btn" id="m-ev">연간 일정 불러오기</button>${canEdit() ? `<button class="btn" id="m-snap">${snap ? '제출본 다시 고정' : '제출본으로 고정'}</button>` : ''}<span class="note">제출할 때 "제출본으로 고정"을 누르면 그날 내용이 그대로 남습니다</span></div></div>
    ${monthlyShown(dd, m, snap, canEdit())}
  </div>`;
};
function monthlyPaper(dd, m) {
  const [y, mm] = m.split('-').map(Number); const reps = monthReports(dd, m); const suns = sundaysOf(y, mm);
  const rows = suns.map((dt, i) => { const r = dd.reports[dt]; if (!r) return `<tr><th>${i+1}주 (${dt.slice(5).replace('-','/')})</th><td colspan="8" class="note">미작성</td></tr>`; const s = reportStats(dd, r); return `<tr><th>${i+1}주 (${dt.slice(5).replace('-','/')})${r.status !== 'done' ? '<br><span class="note">작성 중</span>' : ''}</th><td class="n">${won(r.offering.sunday)}</td><td class="n">${won(s.offSum - (r.offering.sunday||0))}</td><td class="n">${s.m}</td><td class="n">${s.f}</td><td class="n">${s.p}</td><td class="n">${s.total}</td><td class="n">${s.newc}</td><td>${isUnited(r) ? '세대통합예배 · ' : ''}${esc((r.special || '').split('\n')[0]).slice(0, 80)}</td></tr>`; });
  const stats = reps.map(r => reportStats(dd, r)); const n = stats.length || 1; const avg = k => Math.round(stats.reduce((a, s) => a + s[k], 0) / n * 10) / 10;
  const sumOff = stats.reduce((a, s) => a + s.offSum, 0), sumSun = reps.reduce((a, r) => a + (r.offering.sunday || 0), 0);
  const ledY = l => +(l.year || YEAR); const yLed = dd.doc.ledgers.filter(l => ledY(l) === y); const main = yLed.find(l => l.kind === 'budget') || (y === YEAR ? dd.doc.ledgers.find(l => l.kind === 'budget') || dd.doc.ledgers[0] : null); const sm = main ? ledgerSummary(dd, main.id, m) : null; const others = yLed.filter(l => l !== main);
  const ex = main ? dd.expenses.filter(e => e.ledgerId === main.id && ym(e.date) === m).sort((a, b) => a.category < b.category ? -1 : 1) : [];
  const byCat = {}; ex.forEach(e => { (byCat[e.category] = byCat[e.category] || []).push(e); });
  const exRows = Object.entries(byCat).map(([c, list]) => list.map((e, i) => `<tr><td>${e.date.slice(5).replace('-','/')}</td><td>${esc(c)}</td><td>${esc(e.desc)}</td><td class="n">${won(e.amount)}</td>${i === 0 ? `<td class="n" rowspan="${list.length}">${won(list.reduce((a, x) => a + (+x.amount||0), 0))}</td>` : ''}<td class="c">${e.receipt ? '○' : '—'}</td></tr>`).join('')).join('');
  const head = dd.doc.staff.find(t => t.status !== 'left' && /부장|회장/.test(t.role)), sec = dd.doc.staff.find(t => t.status !== 'left' && /총무|서기/.test(t.role)), acc = dd.doc.staff.find(t => t.status !== 'left' && /회계/.test(t.role));
  const mt = (dd.doc.monthlyTexts || {})[m];
  const lineRow = l => { const i = l.indexOf(':'); const a = i > 0 ? l.slice(0, i).trim() : ''; return a && a.length <= 10 && !/[※]/.test(a) ? `<tr><th style="width:18%">${esc(a)}</th><td>${esc(l.slice(i + 1).trim())}</td></tr>` : `<tr><th style="width:18%"></th><td>${esc(l.trim())}</td></tr>`; };
  const weekly = mt && mt.report && mt.report.length ? mt.report.map(lineRow).join('') : suns.map((dt, i) => { const r = dd.reports[dt]; return `<tr><th style="width:18%">${i+1}주</th><td>${r ? esc([r.activity, r.meeting].filter(Boolean).join(' · ')) : '—'}</td></tr>`; }).join('');
  const np = (dd.doc.monthlyPlans[nextMonth(m)] || '').split('\n').filter(Boolean);
  return `<section class="paper">
    <div class="hd"><div><h1>${y}년 ${mm}월 ${esc(dd.doc.name)} 월간 보고서</h1><div class="sub">중앙성서교회 교육위원회 제출 · 월 1회</div></div><div class="meta">부장 ${esc(head ? head.name : '')} · 총무 ${esc(sec ? sec.name : '')} · 회계 ${esc(acc ? acc.name : '')}<br>주일 보고서 ${reps.length}장 반영${reps.some(x => x.status !== 'done') ? ` (완료 ${reps.filter(x => x.status === 'done').length} · <b>작성 중 ${reps.filter(x => x.status !== 'done').length}</b>)` : ''}</div></div>
    <div class="grid2"><div><h2>1. ${mm}월 보고 <span class="tag">주일 보고서에서</span></h2><table class="kv"><tbody>${weekly}</tbody></table></div><div><h2>2. ${+nextMonth(m).slice(5)}월 계획</h2><table class="kv"><tbody>${np.map(lineRow).join('') || '<tr><td class="note">(다음 달 계획을 입력하세요)</td></tr>'}</tbody></table></div></div>
    <h2>3. 출석 현황 및 헌금 집계 <span class="tag">자동</span></h2><div class="tw"><table><thead><tr><th></th><th class="n">주일헌금</th><th class="n">기타헌금</th><th class="n">남</th><th class="n">여</th><th class="n">출석</th><th class="n">재적</th><th class="n">새친구</th><th>특이사항</th></tr></thead><tbody>${rows.join('')}<tr class="sum"><td>합계 (평균)</td><td class="n">${won(sumSun)}</td><td class="n">${won(sumOff - sumSun)}</td><td class="n">${avg('m')}</td><td class="n">${avg('f')}</td><td class="n">${avg('p')}</td><td class="n">${stats.length && m < ym(today()) ? Math.round(avg('total')) : activeStudents(dd).length}</td><td class="n">${stats.reduce((a, s) => a + s.newc, 0)}</td><td>평균 출석률 <span style="color:#8a1f2b">${avg('rate')}%</span></td></tr></tbody></table></div>
    ${main ? `<h2>4. 예산 청구 및 지출 내역 <span class="tag">자동</span></h2><div class="tw"><table><thead><tr><th class="n">부서 예산 (연)</th><th class="n">전월 누계 지출</th><th class="n">${mm}월 지출</th><th class="n">누계 지출</th><th class="n">예산 잔액</th><th class="n">집행률</th></tr></thead><tbody><tr><td class="n">${won(main.budget)}</td><td class="n">${won(sm.prevEx)}</td><td class="n">${won(sm.monEx)}</td><td class="n">${won(sm.cumEx)}</td><td class="n">${won(sm.remain)}</td><td class="n" style="color:#8a1f2b">${sm.rate ?? '—'}%</td></tr></tbody></table></div>` : ''}
    ${main && y === YEAR ? budgetVsPaper(dd, main.id, m) : ''}
    ${others.length ? `<h2>5. 찬조금·행사 장부 현황 <span class="tag">자동</span></h2><div class="tw"><table><thead><tr><th>장부</th><th class="n">전월 이월</th><th class="n">${mm}월 수입</th><th class="n">${mm}월 지출</th><th class="n">잔액</th></tr></thead><tbody>${others.map(l => { const o = ledgerSummary(dd, l.id, m); return `<tr><td>${esc(l.name)}</td><td class="n">${won(o.carryIn)}</td><td class="n">${won(o.monIn)}</td><td class="n">${won(o.monEx)}</td><td class="n">${won(o.balance)}</td></tr>`; }).join('')}</tbody></table></div>` : ''}
    <h2>6. 회계 보고서 (지출 세부) <span class="tag">건별 입력 → 소계·합계 자동</span></h2><div class="tw"><table><thead><tr><th>날짜</th><th>항목</th><th>지출 세부 내역</th><th class="n">금액</th><th class="n">항목 소계</th><th class="c">영수증</th></tr></thead><tbody>${exRows || '<tr><td colspan="6" class="note">이달 지출 없음</td></tr>'}<tr class="sum"><td colspan="3">${mm}월 지출 합계</td><td class="n">${won(sm ? sm.monEx : 0)}</td><td class="n">${won(sm ? sm.monEx : 0)}</td><td></td></tr></tbody></table></div>
    ${dd.doc.notes && dd.doc.notes.merge ? `<div class="merge">※ ${esc(dd.doc.notes.merge)}</div>` : ''}
    ${mt && mt.notes ? `<h2>원문 보고서 메모 <span class="tag">받은 월간 보고서</span></h2><div class="note" style="white-space:pre-wrap">${esc(mt.notes.split(' | ').join('\n'))}</div>` : ''}
    <div class="ft"><b>중앙성서교회 교육위원회</b><span>CBCS에서 생성 · ${esc(dd.doc.name)}-${m}-월간.pdf · 부장·총무·회계 확인 후 월례회 제출</span></div>
  </section>`;
}
BIND.monthly = () => { bindMonthNav(); const p = $('#m-print'); if (p) p.onclick = doPrint;
  const lv = $('#m-live'); if (lv) lv.onclick = () => { S.sub.mLive = true; renderHere(); }; const sv0 = $('#m-snapview'); if (sv0) sv0.onclick = () => { delete S.sub.mLive; renderHere(); };
  if (isCommittee()) { document.querySelectorAll('[data-dept]').forEach(b => b.onclick = () => { S.sub.dept = b.dataset.dept; delete S.sub.mLive; render(); }); return; }
  const dd = D(); const m = S.sub.month || prevMonth(today().slice(0, 7)); const nm = nextMonth(m);
  const sv = $('#m-save'); if (sv) sv.onclick = async () => { dd.doc.monthlyPlans[nm] = $('#m-plan').value; await saveDeptDoc(dd.id); render(); toast('계획 저장'); };
  // 다음 달 연간 일정 불러오기: 고른 일정만 "월/일: 제목" 줄로 계획 칸 끝에 붙인다(이미 있는 줄은 건너뜀). 저장은 직접
  const ev = $('#m-ev'); if (ev) ev.onclick = () => { const list = dd.events.filter(e => ym(e.date) === nm).sort((a, b) => a.date < b.date ? -1 : 1);
    const line = e => `${+e.date.slice(5, 7)}/${+e.date.slice(8, 10)}: ${e.title}`; const cur = $('#m-plan').value;
    openModal(`<h2>${+nm.slice(5)}월 연간 일정 불러오기<button class="btn s" id="modal-close">닫기</button></h2>${list.length ? `<p class="note">계획 칸 끝에 붙일 일정을 고르세요. 붙인 뒤 문장을 다듬고 "저장"을 누르세요.</p><div class="list">${list.map((e, i) => `<label class="item"><input type="checkbox" data-mev="${i}" ${cur.includes(line(e)) ? 'disabled' : 'checked'}> ${esc(line(e))}${cur.includes(line(e)) ? ' <span class="note">(이미 있음)</span>' : ''}</label>`).join('')}</div><div class="row" style="margin-top:10px"><button class="btn p" id="mev-go">계획 칸에 붙이기</button></div>` : `<p>${+nm.slice(5)}월에 연간계획 일정이 없습니다. 연간계획서에서 일정을 먼저 넣어 주세요.</p>`}`);
    $('#modal-close').onclick = closeModal; const go = $('#mev-go'); if (go) go.onclick = () => { const add = [...document.querySelectorAll('[data-mev]:checked')].map(x => line(list[+x.dataset.mev])); const ta = $('#m-plan'); ta.value = [ta.value.replace(/\s+$/, ''), ...add].filter(Boolean).join('\n'); S.dirty = true; closeModal(); toast(`${add.length}개 붙였습니다 — 저장을 눌러 주세요`); }; };
  const sn = $('#m-snap'); if (sn) sn.onclick = async () => { const reps = monthReports(dd, m); const draft = reps.filter(r => r.status !== 'done').length;
    const html = monthlyPaper(dd, m); const doc = { month: m, at: today(), html, reports: reps.length, draft };
    const fix = async () => { await backend.set(`depts/${dd.id}/monthlySnaps/${m}`, doc); dd.msnap = dd.msnap || {}; dd.msnap[m] = doc; delete S.sub.mLive; renderHere(); toast('제출본으로 고정했습니다'); };
    if (!draft) return fix();
    openModal(`<h2>제출본으로 고정<button class="btn s" id="modal-close">닫기</button></h2><p>작성 중인 주일 보고서 ${draft}장이 들어 있습니다. 주일 보고서를 먼저 끝내는 것이 좋습니다. 그래도 지금 내용으로 고정할까요?</p><div class="row"><button class="btn" id="ms-no">돌아가기</button><button class="btn p" id="ms-yes">그래도 고정</button></div>`);
    $('#modal-close').onclick = closeModal; $('#ms-no').onclick = closeModal; $('#ms-yes').onclick = () => { closeModal(); fix(); }; };
  const us = $('#m-unsnap'); if (us) us.onclick = async () => { await backend.del(`depts/${dd.id}/monthlySnaps/${m}`); dd.msnap[m] = null; renderHere(); toast('고정을 풀었습니다 — 지금 자료로 보입니다'); };
};

/* ───────────── 연간 계획 ───────────── */
/* ───────────── 연간 계획서 ───────────── */
async function loadPlan(dd, year) {
  dd.plans = dd.plans || {};
  if (!(year in dd.plans)) dd.plans[year] = await backend.get(`depts/${dd.id}/plans/${year}`);
  return dd.plans[year];
}
function blankPlan(dd, year) { return { year, status: 'draft', confirmedAt: '', slogan: '', verse: '', verseRef: '', goals: [], methods: '', ministry: '', worship: '', notes: '', budget: year === YEAR ? (dd.doc.budgetPlan || []).map(x => ({ ...x })) : [], updated: today() }; }
async function savePlan(dd, plan) { plan.updated = today(); await backend.set(`depts/${dd.id}/plans/${plan.year}`, plan); dd.plans[plan.year] = plan; if (plan.year === YEAR) { dd.doc.budgetPlan = plan.budget.map(x => ({ ...x })); await saveDeptDoc(dd.id); } }
const planEvents = (dd, year) => dd.events.filter(e => (e.date || '').startsWith(String(year))).sort((a, b) => a.date < b.date ? -1 : 1);
function planPaper(dd, plan) {
  const ev = planEvents(dd, plan.year); const total = plan.budget.reduce((a, b) => a + (+b.amount || 0), 0);
  const byMonth = {}; ev.forEach(e => { const m = +e.date.slice(5, 7); (byMonth[m] = byMonth[m] || []).push(e); });
  const staff = visibleStaff(dd);
  const para = t => esc(t || '').split('\n').map(l => `<p>${l || '&nbsp;'}</p>`).join('');
  return `<section class="paper"><div class="hd"><div><h1>${plan.year}년 ${esc(dd.doc.name)} 연간교육계획서</h1><div class="sub">중앙성서교회 교육위원회</div></div><div class="meta">${plan.status === 'confirmed' ? `확정 ${esc(plan.confirmedAt)}` : '작성 중(초안)'}</div></div>
    <h2>1. 개요</h2><table class="kv"><tbody><tr><th>표어</th><td><b>${esc(plan.slogan)}</b></td></tr><tr><th>주제 말씀</th><td>${esc(plan.verse)} ${plan.verseRef ? `(${esc(plan.verseRef)})` : ''}</td></tr><tr><th>교육 목표</th><td>${(plan.goals || []).filter(Boolean).map((g, i) => `${i + 1}. ${esc(g)}`).join('<br>')}</td></tr></tbody></table>
    ${plan.methods ? `<h2>2. 교육 방법 및 실천 방안</h2><div class="lines">${para(plan.methods)}</div>` : ''}
    <h2>3. 조직 편성</h2><table><tbody>${staff.map(t => `<tr><th style="width:18%">${esc(t.role)}</th><td>${esc(t.name)}${t.classId ? ' · ' + esc(t.classId) : ''}</td></tr>`).join('')}</tbody></table>
    <table style="margin-top:6px"><thead><tr><th>${esc(dd.doc.classLabel)}</th><th>담임</th><th>보조</th><th class="n">인원</th></tr></thead><tbody>${dd.doc.classes.map(c => `<tr><td>${esc(c.name)}</td><td>${esc(c.teacher || '')}</td><td>${esc(c.assistant || '')}</td><td class="n">${classStudents(dd, c.id).length}</td></tr>`).join('')}</tbody></table>
    ${plan.ministry ? `<h2>4. 세부 사역(직무 분담)</h2><div class="lines">${para(plan.ministry)}</div>` : ''}
    ${plan.worship ? `<h2>5. 예배 순서 및 내용</h2><div class="lines">${para(plan.worship)}</div>` : ''}
    <h2>6. 연중 계획</h2><table><thead><tr><th style="width:8%">월</th><th>행사·일정</th></tr></thead><tbody>${Array.from({ length: 12 }, (_, i) => i + 1).map(m => `<tr><th>${m}월</th><td>${(byMonth[m] || []).map(e => `${+e.date.slice(8)}일 ${esc(e.title)}`).join(' · ') || ''}</td></tr>`).join('')}</tbody></table>
    <h2>7. 예산 (총 ${won(total)}원)</h2><table><thead><tr><th>사역</th><th>품목·내역</th><th class="n">금액</th><th>비고</th></tr></thead><tbody>${plan.budget.map(b => `<tr><td>${esc(b.category)}</td><td>${esc(b.item)}</td><td class="n">${won(b.amount)}</td><td>${esc(b.note || '')}</td></tr>`).join('')}<tr class="sum"><td colspan="2">합계</td><td class="n">${won(total)}</td><td></td></tr></tbody></table>
    ${plan.notes ? `<h2>8. 참고 사항</h2><div class="lines">${para(plan.notes)}</div>` : ''}
    <div class="ft"><b>중앙성서교회 교육위원회</b><span>CBCS에서 생성 · ${esc(dd.doc.name)}-${plan.year}-연간계획서.pdf</span></div></section>`;
}
VIEWS.plan = async () => {
  let dd; if (isCommittee()) dd = await loadDept(S.sub.dept || 'kinder'); else dd = D();
  const year = S.sub.year || YEAR;
  const plan = (await loadPlan(dd, year)) || blankPlan(dd, year);
  if (S.sub.print) return `<div class="topbar no-print"><div><h1>연간계획서 출력</h1></div><div class="row"><button class="btn" id="pl-back">돌아가기</button><button class="btn p" id="pl-print">PDF로 저장 / 인쇄</button></div></div>${planPaper(dd, plan)}`;
  const edit = canEdit() && !isCommittee() && plan.status !== 'confirmed';
  const evs = planEvents(dd, year); const total = plan.budget.reduce((a, b) => a + (+b.amount || 0), 0);
  const pick = isCommittee() ? `<div class="row" style="margin-bottom:10px">${Object.entries(DEPTS).map(([k, v]) => `<button class="btn ${dd.id === k ? 'p' : ''}" data-dept="${esc(k)}">${v}</button>`).join('')}</div>` : '';
  const ro = (v, ml) => edit ? '' : 'readonly';
  return `<div class="topbar"><div><h1>${year}년 연간계획서${isCommittee() ? ' — ' + esc(dd.doc.name) : ''}</h1><div class="sub">${plan.status === 'confirmed' ? `<span class="pill ok">확정</span> ${esc(plan.confirmedAt)} · 메인 화면에 알림` : '<span class="pill warn">작성 중</span> 확정하면 메인 화면에 알려집니다'}</div></div>
    <div class="row"><select id="pl-year" style="width:auto">${[YEAR - 1, YEAR, YEAR + 1].map(y => `<option ${y === year ? 'selected' : ''}>${y}</option>`).join('')}</select>${canEdit() ? '<button class="btn" id="pl-open-print">계획서 출력</button>' : ''}${canEdit() && !isCommittee() ? (plan.status === 'confirmed' ? '<button class="btn" id="pl-unconfirm">확정 취소(수정)</button>' : `<button class="btn" id="pl-copy">${year - 1}년에서 가져오기</button><button class="btn" id="pl-save">저장</button><button class="btn p" id="pl-confirm">확정</button>`) : ''}</div></div>
  ${pick}
  <div class="stack">
    <div class="card"><h2>1. 개요</h2><div class="fields">
      <label class="f" style="grid-column:1/-1"><span>표어</span><input type="text" id="pl-slogan" value="${esc(plan.slogan)}" ${ro()} placeholder="예: 기도를 사랑하는 어린이"></label>
      <label class="f" style="grid-column:span 3"><span>주제 말씀</span><input type="text" id="pl-verse" value="${esc(plan.verse)}" ${ro()}></label>
      <label class="f"><span>본문</span><input type="text" id="pl-ref" value="${esc(plan.verseRef)}" ${ro()} placeholder="마태복음 7:7"></label>
      <label class="f" style="grid-column:1/-1"><span>교육 목표 (한 줄에 하나)</span><textarea id="pl-goals" ${ro()}>${esc((plan.goals || []).join('\n'))}</textarea></label>
      <label class="f" style="grid-column:1/-1"><span>교육 방법 및 실천 방안</span><textarea id="pl-methods" ${ro()} style="min-height:110px">${esc(plan.methods)}</textarea></label>
    </div></div>
    <div class="grid2">
      <div class="card"><h2>3. 조직 편성 <span class="r">출석부의 교사·반 편성에서 자동</span></h2><div class="tw"><table><tbody>${visibleStaff(dd).map(t => `<tr><td>${esc(t.role)}</td><td>${esc(t.name)}</td><td class="note">${esc(t.classId || '')}</td></tr>`).join('')}</tbody></table></div><div class="note" style="margin-top:6px">${dd.doc.classes.map(c => `${esc(c.name)}: ${esc(c.teacher || '-')}`).join(' · ')}</div></div>
      <div class="card"><h2>4·5. 세부 사역 · 예배 순서</h2><div class="stack">
        <label class="f"><span>세부 사역(직무 분담)</span><textarea id="pl-ministry" ${ro()}>${esc(plan.ministry)}</textarea></label>
        <label class="f"><span>예배 순서 및 내용</span><textarea id="pl-worship" ${ro()}>${esc(plan.worship)}</textarea></label></div></div>
    </div>
    <div class="grid2">
      <div class="card"><h2>6. 연중 계획 <span class="r">${evs.length}건 · 달력과 주일 보고서 일정에 연결</span></h2><div class="list" style="max-height:520px;overflow:auto">${evs.map(e => `<div class="item"><div><div class="t">${esc(e.title)}</div><div class="d">${fmtK(e.date)}${e.end ? ' ~ ' + fmtK(e.end) : ''}${e.note ? ' · ' + esc(e.note) : ''}</div></div>${edit ? `<button class="btn s d" data-del-ev="${e._id || e.id}">삭제</button>` : ''}</div>`).join('') || '<div class="note">일정이 없습니다.</div>'}</div>
        ${edit ? `<div class="row" style="margin-top:10px"><input type="date" id="ev-date" style="width:auto" value="${esc(year)}-01-01"><input type="text" id="ev-title" placeholder="행사 이름" style="flex:1"><button class="btn" id="ev-add">추가</button></div>` : ''}</div>
      <div class="card"><h2>7. 예산안 <span class="r">합계 ${won(total)}원</span></h2><div class="tw"><table><thead><tr><th>사역</th><th>품목</th><th class="n">금액</th><th></th></tr></thead><tbody>${plan.budget.map((b, i) => `<tr><td>${esc(b.category)}</td><td class="wrap">${esc(b.item)}${b.note ? ` <span class="note">(${esc(b.note)})</span>` : ''}</td><td class="n">${won(b.amount)}</td><td>${edit ? `<button class="btn s d" data-del-b="${esc(i)}">삭제</button>` : ''}</td></tr>`).join('')}<tr class="sum"><td colspan="2">합계</td><td class="n">${won(total)}</td><td></td></tr></tbody></table></div>
        ${edit ? `<div class="row" style="margin-top:10px"><input type="text" id="b-cat" placeholder="사역" style="width:90px"><input type="text" id="b-item" placeholder="품목" style="flex:1"><input type="number" id="b-amt" placeholder="금액" style="width:120px"><button class="btn" id="b-add">추가</button></div>` : ''}
        <div class="note" style="margin-top:8px">확정하면 예산 합계가 그해 회계 장부("${esc((dd.doc.ledgers.find(l => l.kind === 'budget') || {}).name || '정규 예산')}")의 연간 예산이 됩니다.</div></div>
    </div>
    <div class="card"><h2>8. 참고 사항</h2><textarea id="pl-notes" ${ro()} style="width:100%">${esc(plan.notes)}</textarea></div>
  </div>`;
};
function collectPlan(plan) {
  const v = id => { const el = $('#' + id); return el ? el.value : null; };
  if (v('pl-slogan') === null) return plan;
  Object.assign(plan, { slogan: v('pl-slogan').trim(), verse: v('pl-verse').trim(), verseRef: v('pl-ref').trim(), goals: v('pl-goals').split('\n').map(x => x.trim()).filter(Boolean), methods: v('pl-methods'), ministry: v('pl-ministry'), worship: v('pl-worship'), notes: v('pl-notes') });
  return plan;
}
BIND.plan = () => {
  const dd = isCommittee() ? S.data[S.sub.dept || 'kinder'] : D();
  const year = S.sub.year || YEAR;
  const plan = dd.plans[year] || blankPlan(dd, year); dd.plans[year] = plan;
  document.querySelectorAll('[data-dept]').forEach(b => b.onclick = () => { S.sub = { dept: b.dataset.dept, year: S.sub.year }; render(); });
  // 출력 화면을 먼저 처리한다 (출력 화면에는 연도 선택 등이 없어, 뒤의 연결에서 오류가 나면 돌아가기·인쇄 단추가 연결되지 않았음)
  const bk = $('#pl-back'); if (bk) { bk.onclick = () => { delete S.sub.print; render(); }; $('#pl-print').onclick = doPrint; return; }
  // 계획서 초안 보존: 일정 추가·삭제, 미리보기, 연도 바꾸기 전에 쓰던 글을 먼저 임시 저장한다(확정 전 초안만)
  const keepDraft = async () => { collectPlan(plan); if (plan.status !== 'confirmed' && canEdit() && !isCommittee()) await savePlan(dd, plan); };
  const py = $('#pl-year'); if (py) py.onchange = async e => { await keepDraft(); S.sub.year = +e.target.value; render(); };
  const op = $('#pl-open-print'); if (op) op.onclick = async () => { await keepDraft(); S.sub.print = true; render(); };
  const sv = $('#pl-save'); if (sv) sv.onclick = async () => { collectPlan(plan); await savePlan(dd, plan); toast('저장했습니다'); };
  const cf = $('#pl-confirm'); if (cf) cf.onclick = () => { collectPlan(plan); if (!plan.slogan) { toast('표어를 넣어 주세요'); return; }
    openModal(`<h2>${year}년 연간계획서 확정<button class="btn s" id="modal-close">닫기</button></h2><p>확정하면 수정이 잠기고, ${esc(dd.doc.name)} 메인 화면과 교육위원회 메인에 계획서 내용(표어·말씀·목표·이달 행사)이 알려집니다. 예산 합계 ${won(plan.budget.reduce((a, b) => a + (+b.amount || 0), 0))}원이 ${year}년 장부 연간 예산이 됩니다.</p><div class="row"><button class="btn p" id="pl-yes">확정</button><button class="btn" id="pl-no">취소</button></div>`);
    $('#pl-no').onclick = closeModal; $('#pl-yes').onclick = async () => { plan.status = 'confirmed'; plan.confirmedAt = today(); await savePlan(dd, plan); if (year === YEAR) { const main = dd.doc.ledgers.find(l => l.kind === 'budget'); if (main) { main.budget = plan.budget.reduce((a, b) => a + (+b.amount || 0), 0); await saveDeptDoc(dd.id); } } closeModal(); render(); toast('확정했습니다 — 메인 화면에 알립니다'); }; };
  const uc = $('#pl-unconfirm'); if (uc) uc.onclick = async () => { plan.status = 'draft'; await savePlan(dd, plan); render(); toast('확정을 풀었습니다. 수정 후 다시 확정하세요'); };
  // 전년도 계획서에서 가져오기: 고른 항목만. 빈 칸은 채우고, 글이 있으면 아래에 덧붙임. 일정은 같은 요일이 되도록 52주 뒤 날짜로(확인 필요)
  const pc = $('#pl-copy'); if (pc) pc.onclick = async () => { collectPlan(plan); const prev = await loadPlan(dd, year - 1);
    if (!prev) { toast(`${year - 1}년 계획서가 없습니다`); return; }
    const pevs = planEvents(dd, year - 1); const shift = d => { const t = new Date(d + 'T00:00:00'); t.setDate(t.getDate() + 364); return iso(t); };
    const F = [['slogan', '표어', prev.slogan, false], ['verse', '주제 말씀', [prev.verse, prev.verseRef].filter(Boolean).join(' '), false], ['goals', '교육 목표', (prev.goals || []).join(' / '), true], ['methods', '교육 방법·실천 방안', prev.methods, true], ['ministry', '세부 사역', prev.ministry, true], ['worship', '예배 순서', prev.worship, true], ['notes', '비고', prev.notes, false], ['budget', `예산 항목 ${(prev.budget || []).length}개`, (prev.budget || []).map(b => b.item).join(', '), true], ['events', `연중 일정 ${pevs.length}건 (날짜는 같은 요일로 옮김 — 꼭 확인)`, pevs.slice(0, 6).map(e => e.title).join(', ') + (pevs.length > 6 ? ' …' : ''), false]].filter(x => String(x[2] || '').trim());
    openModal(`<h2>${year - 1}년 계획서에서 가져오기<button class="btn s" id="modal-close">닫기</button></h2><p class="note">고른 항목만 가져옵니다. 비어 있는 칸은 채우고, 이미 쓴 칸은 그 아래에 덧붙입니다. 예산은 같은 이름의 항목이 없을 때만 넣습니다. 가져온 뒤 올해에 맞게 고치세요.</p><div class="list">${F.map(([k, l, v, on]) => `<label class="item" style="align-items:flex-start"><input type="checkbox" data-pc="${k}" ${on ? 'checked' : ''}> <div><b>${esc(l)}</b><div class="note">${esc(String(v).slice(0, 140))}</div></div></label>`).join('')}</div><div class="row" style="margin-top:10px"><button class="btn p" id="pc-go">가져오기</button></div>`);
    $('#modal-close').onclick = closeModal; $('#pc-go').onclick = async () => { const pick = new Set([...document.querySelectorAll('[data-pc]:checked')].map(x => x.dataset.pc)); const join = (a, b) => !String(a || '').trim() ? (b || '') : !String(b || '').trim() || String(a).includes(b) ? a : a + '\n' + b;
      if (pick.has('slogan')) plan.slogan = plan.slogan || prev.slogan; if (pick.has('verse')) { plan.verse = plan.verse || prev.verse; plan.verseRef = plan.verseRef || prev.verseRef; }
      if (pick.has('goals')) plan.goals = [...new Set([...(plan.goals || []), ...(prev.goals || [])])];
      ['methods', 'ministry', 'worship', 'notes'].forEach(k => { if (pick.has(k)) plan[k] = join(plan[k], prev[k]); });
      if (pick.has('budget')) (prev.budget || []).forEach(b => { if (!plan.budget.some(x => x.item === b.item)) plan.budget.push({ ...b }); });
      let nEv = 0; if (pick.has('events')) for (const e of pevs) { const d = shift(e.date); if (dd.events.some(x => x.date === d && x.title === e.title)) continue; const ne = { id: 'ev_' + uid(), date: d, end: e.end ? shift(e.end) : '', title: e.title, note: [e.note, '전년도에서 복사 — 날짜 확인'].filter(Boolean).join(' · '), from: e._id || e.id }; await backend.set(`depts/${dd.id}/events/${ne.id}`, ne); dd.events.push({ _id: ne.id, ...ne }); nEv++; }
      await savePlan(dd, plan); closeModal(); render(); toast(`가져왔습니다${nEv ? ` (일정 ${nEv}건 — 날짜를 꼭 확인하세요)` : ''}`); }; };
  const ea = $('#ev-add'); if (ea) ea.onclick = async () => { await keepDraft(); const dt = $('#ev-date').value, t = $('#ev-title').value.trim(); if (!dt || !t) return; const e = { id: 'ev_' + uid(), date: dt, end: '', title: t, note: '' }; await backend.set(`depts/${dd.id}/events/${e.id}`, e); dd.events.push({ _id: e.id, ...e }); render(); };
  document.querySelectorAll('[data-del-ev]').forEach(b => b.onclick = async () => { await keepDraft(); await backend.del(`depts/${dd.id}/events/${b.dataset.delEv}`); dd.events = dd.events.filter(e => (e._id || e.id) !== b.dataset.delEv); render(); });
  const ba = $('#b-add'); if (ba) ba.onclick = async () => { collectPlan(plan); const a = +$('#b-amt').value, it = $('#b-item').value.trim(); if (!a || !it) return; plan.budget.push({ category: $('#b-cat').value.trim(), item: it, amount: a, note: '' }); await savePlan(dd, plan); render(); };
  document.querySelectorAll('[data-del-b]').forEach(b => b.onclick = async () => { collectPlan(plan); plan.budget.splice(+b.dataset.delB, 1); await savePlan(dd, plan); render(); });
};
function planBanner(dd, plan, compact) {
  if (!plan || plan.status !== 'confirmed') return '';
  const m = today().slice(0, 7); const ev = planEvents(dd, plan.year).filter(e => ym(e.date) === m || ym(e.date) === nextMonth(m)).slice(0, 6);
  return `<div class="card plan-banner"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><div class="note">${plan.year}년 ${esc(dd.doc.name)} 연간계획 · 확정 ${esc(plan.confirmedAt)}</div><div class="slogan">${esc(plan.slogan)}</div>${plan.verse ? `<div class="verse">${esc(plan.verse)} ${plan.verseRef ? `<span class="note">(${esc(plan.verseRef)})</span>` : ''}</div>` : ''}</div><button class="btn s" data-go="plan" data-sub='${JSON.stringify({ year: plan.year, dept: dd.id })}'>계획서 보기</button></div>
    ${!compact && (plan.goals || []).length ? `<ol class="goals">${plan.goals.map(g => `<li>${esc(g)}</li>`).join('')}</ol>` : ''}
    ${!compact && ev.length ? `<div class="note" style="margin-top:6px">이번·다음 달 계획: ${ev.map(e => `${+e.date.slice(5, 7)}/${+e.date.slice(8)} ${esc(e.title)}`).join(' · ')}</div>` : ''}</div>`;
}

/* ───────────── 청년부 회칙·총회 ───────────── */
// 판정 기준값: 회칙 판마다 저장(params). 개정안이 통과되어 "현행"으로 지정되면 그 판의 값으로 자동 판정
const RULE_2025 = { ageMin: 19, ageMax: 39, voterMonths: 6, voterRate: 60, absentYears: 1, presAgeMax: 33, presYears: 3, vpYears: 2, apptYears: 1, presBaptized: false, vpBaptized: false, apptBaptized: true, quorumWeeks: 5, quorumNum: 2, quorumDen: 3, sameRoleMax: 2, chairTeamMax: 0 }; // sameRoleMax: 같은 직위 연속 최대 연수(9조: 임기 1년 + 1년 연임) · chairTeamMax: 회장단(회장·부회장) 연속 최대 연수(0=제한 없음)
const BYLAW_SEED = [
  { id: '2025-24', title: '중앙성서교회 청년부 회칙', revision: '24차 수정', date: '2025-12-28', status: 'current', text: '', params: RULE_2025,
    summary: [{ no: '4조', title: '회원', body: '만 19~39세 미혼, 직분자 제외, 타 목장 소속 제외' }, { no: '5조', title: '선거권', body: '세례교인으로서 새가족반 수료 후 6개월 이상 출석, 1년 내 출석률 60% 이상' }, { no: '6조', title: '제명', body: '1년 이상 결석 제명 대상, 3년 이상 결석 제명 (유학·군복무·온라인 출석 제외)' }, { no: '9조', title: '임기', body: '1년, 1년 연임 가능 (연임 뒤 직위를 바꾸면 더 가능) — 임원 이력으로 자동 판정' }, { no: '10조', title: '겸임', body: '회장·부회장은 타 부서 활동 겸임 불가 (교역자와 상의해 예외)' }, { no: '11조', title: '자격', body: '모두 세례교인 · 회장: 만 33세 이하, 제명 없이 3년 이상 출석 / 부회장: 2년 이상 / 임명직: 본 교회 1년 이상 출석' }, { no: '13조', title: '정족수', body: '직전 5주 평균 출석의 2/3' }, { no: '14조', title: '선출', body: '정·부회장은 총회 무기명 비밀투표 과반수' }],
    notes: '본문은 회칙 원본(HWP)에서 옮겨 넣으면 이 화면에 그대로 보입니다.' },
  { id: '2026-draft', title: '중앙성서교회 청년부 회칙 개정안', revision: '2026 개정안(0814 수정)', date: '2026-08-14', status: 'draft', text: '', params: { ...RULE_2025, presAgeMax: 0, presBaptized: true, vpBaptized: true, chairTeamMax: 3 },
    summary: [{ no: '11조', title: '자격', body: '회장 나이 제한 삭제 (세례교인 요건은 이미 기본)' }, { no: '9조', title: '임기', body: '동일 직위 1회 연임 + 회장단 연속 3년 제한' }, { no: '10조', title: '겸임', body: '겸임 금지 직책 구체화(교사·찬양팀 임원·성가대 임원·방송 책임자)' }, { no: '4조', title: '회원', body: '결혼 시 그 분기까지 회원' }, { no: '6조', title: '자격 정리', body: '회원 자격 정리 1년 기준' }],
    notes: '총회 통과 전 — 판정에는 쓰지 않습니다. 통과되면 "현행으로 지정"을 누르세요.' }];
const ASSEMBLY_POS = ['회장', '부회장', '총무', '회계', '서기'];
const ASSEMBLY_POS_SUB = ['부총무', '부서기', '부회계']; // 부임원도 일단 임원으로 본다
// 청년부 직책 구분: 임원(회장·부회장·총무·서기·회계, 부총무 등 부임원) / 팀장(사역팀) / 팸장 / 교역자·부장
const OFFICER_CORE = ['회장', '부회장', '총무', '서기', '회계'];
// 직책 이름 통일: 찬양리더·찬양팀 리더 → 기드온 리더, 찬양인도·인도자 → 기드온 인도자, 찬양부인도 → 기드온 부인도자, 찬양총무 → 기드온 총무, 선교팀장 → 밀알선교팀장, 미디어 팀장 → 미디어팀장
function canonRole(r) { r = String(r || '').trim(); if (/^(찬양|기드온|찬양팀)?\s*(부인도자|부인도)$/.test(r)) return '기드온 부인도자'; if (/^(찬양|기드온|찬양팀)?\s*(인도자|인도)$/.test(r)) return '기드온 인도자'; if (/^(찬양|기드온|찬양팀)?\s*리더$/.test(r)) return '기드온 리더'; if (/^(찬양|기드온|찬양팀)\s*총무$/.test(r)) return '기드온 총무'; if (/^(밀알)?\s*선교\s*팀?\s*(팀장|장)$/.test(r)) return '밀알선교팀장'; return r.replace(/^미디어\s*팀장$/, '미디어팀장'); }
function roleKind(r) { r = String(r || '').trim(); if (!r) return ''; if (/^임원/.test(r) || OFFICER_CORE.includes(r) || (r.startsWith('부') && OFFICER_CORE.includes(r.slice(1)))) return '임원'; if (/팸장$/.test(r)) return '팸장'; if (/^(교역자|목사|전도사|부장|부감|교육디렉터|디렉터)$/.test(r)) return '교역자·부장'; return '팀장'; }
const roleParts = role => String(role || '').split(/[,，\/]/).map(x => x.trim()).filter(Boolean);
const ROLE_PILL = { 임원: 'ok', 팀장: 'info', 팸장: 'mute', '교역자·부장': 'warn' };
function staffByKind(dd) { const g = { 임원: [], 팀장: [], 팸장: [], '교역자·부장': [] }; dd.doc.staff.filter(t => t.status !== 'left').forEach(t => roleParts(t.role).forEach(r => { const k = roleKind(r); if (g[k]) g[k].push({ name: t.name, role: r, cls: t.classId || '' }); })); const ord = r => { const i = [...OFFICER_CORE, ...ASSEMBLY_POS_SUB].indexOf(r); return i < 0 ? 99 : i; }; g.임원.sort((a, b) => ord(a.role) - ord(b.role)); const lead = r => { const i = ['교역자', '전도사', '부장', '부감', '지도교사'].findIndex(k => r.startsWith(k)); return i < 0 ? 99 : i; }; g['교역자·부장'].sort((a, b) => lead(a.role) - lead(b.role)); g.팸장.sort((a, b) => (a.role.startsWith('부') ? 1 : 0) - (b.role.startsWith('부') ? 1 : 0)); return g; }
function staffKindsHTML(dd) { const g = staffByKind(dd); const line = (k, list) => `<div class="kind-row"><span class="pill ${ROLE_PILL[k]}">${k} ${list.length}</span><div>${list.map(x => `<span class="chip">${esc(x.role)} <b>${esc(x.name)}</b></span>`).join('') || '<span class="note">없음</span>'}</div></div>`;
  const missing = OFFICER_CORE.filter(r => !g.임원.some(x => x.role === r));
  return `${line('교역자·부장', g['교역자·부장'])}${line('임원', g.임원)}${missing.length ? `<div class="note" style="margin:-2px 0 6px 0">비어 있는 임원 자리: ${missing.join(', ')}</div>` : ''}${line('팀장', g.팀장)}${line('팸장', g.팸장)}`; } // 팸장(교사)은 회원 아래
const iso = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const addMonths = (date, k) => { const d = new Date(date + 'T00:00:00'); d.setMonth(d.getMonth() + k); return iso(d); };
const ageAt = (birth, ref) => { if (!birth || !/^\d{4}-\d\d-\d\d$/.test(birth)) return null; const [y, m, d] = birth.split('-').map(Number), [Y, M, D2] = ref.split('-').map(Number); return Y - y - (M < m || (M === m && D2 < d) ? 1 : 0); };
const yearsSince = (from, ref) => (new Date(ref + 'T00:00:00') - new Date(from + 'T00:00:00')) / (365.25 * 864e5);
const isBaptized = s => /세례|입교/.test(s.faith || '') && s.faith !== '유아세례';
const faithUnknown = s => !s.faith || s.faith === '모름' || s.faith === '미정'; // 아직 신급을 확인하지 않음 ('없음'은 확인 결과 신급이 없는 것)
// 주일학교(중고등부 등)에서 올라온 회원인지: 소속 이력에 청년부 아닌 교회학교 기록이 있거나, 진급으로 받은 경우
const fromSchool = s => s.origin ? s.origin === 'school' : (s.history || []).some(h => h.dept && h.dept !== 'young' && h.dept !== 'committee') || /중고등부|고등부|중등부/.test([...(s.history || []).map(h => h.origDept || ''), String(s.source || ''), s.fromDept || ''].join(' '));
function youngStart(dd, s) {
  const by = s.birth ? +s.birth.slice(0, 4) : 0;
  // 청년부 출석 시작 규칙(2026-10-13): 복적자는 복적일, 주일학교 출신은 만 19세 되는 해 1월 1일, 전도되어 온 회원은 청년부 등록일
  const back = (s.statusLog || []).some(l => l.from === 'left' && l.to !== 'left' && l.date);
  if (!back && fromSchool(s) && by) return { date: `${by + 19}-01-01`, est: false, school: true };
  if (!back && (s.origin === 'evang' || !fromSchool(s)) && s.joinDate) return { date: s.joinDate, est: false, evang: true };
  const r = youngStartRaw(dd, s); if (!r) return null;
  // 고3까지는 중고등부: 청년부 등록일은 만 19세가 되는 해 1월 1일보다 앞설 수 없다
  const floor = by ? `${by + 19}-01-01` : '';
  if (floor && r.date < floor) return { ...r, date: floor, floored: true };
  return r;
}
function youngStartRaw(dd, s) {
  // 제적됐다가 복적한 사람은 복적일부터 새로 센다 (제적 뒤 재등록은 새가족과 같음) — 복적 기록은 statusLog의 left→active
  const back = (s.statusLog || []).filter(l => l.from === 'left' && l.to !== 'left' && l.date).map(l => l.date).sort().pop();
  if (back) return { date: back, est: false, rejoined: true };
  // 제적 기록은 있는데 복적 기록이 없고 지금 재적이면: 제적 뒤 첫 출석 기록을 복적일로 추정
  const lastLeft = (s.statusLog || []).filter(l => l.to === 'left' && l.date).map(l => l.date).sort().pop();
  if (lastLeft && s.status !== 'left') { const first = namedReports(dd).find(r => r.date > lastLeft && attEvidence(r, s).v); if (first) return { date: first.date, est: true, rejoined: true }; return { date: today(), est: true, rejoined: true, noReturn: true }; }
  if (s.joinDate) return { date: s.joinDate, est: false };
  const c = []; const h = s.history || [];
  const yh = h.filter(x => x.dept === 'young').map(x => x.year); if (yh.length) c.push(`${Math.min(...yh)}-01-01`);
  const th = h.filter(x => x.dept === 'youth').map(x => x.year); if (th.length) c.push(`${Math.max(...th) + 1}-01-01`);
  const first = namedReports(dd).find(r => (r.att || {})[s.id]); if (first) c.push(first.date);
  if (!c.length) return null; c.sort(); return { date: c[0], est: true };
}
function churchStart(dd, s) { if (s.churchJoin) return { date: s.churchJoin, est: false }; const ys = (s.history || []).map(x => x.year); const y = youngStart(dd, s); const c = ys.length ? `${Math.min(...ys)}-01-01` : null; if (c && (!y || c < y.date)) return { date: c, est: true }; return y; }
async function loadYoung() {
  const dd = isCommittee() ? await loadDept('young') : D();
  if (!dd.bylaws) { const l = await backend.list('depts/young/bylaws'); dd.bylaws = l.length ? l.map(b => ({ ...b, id: b.id || b._id })) : BYLAW_SEED.map(b => ({ ...b, unsaved: true })); }
  if (!dd.bylaws.some(b => b.kind === 'charter')) dd.bylaws.push({ id: 'charter', kind: 'charter', title: '한국성서선교회 헌장', revision: '', date: '', status: 'current', text: '', summary: [], notes: '', unsaved: true });
  if (!dd.bylaws.some(b => b.kind === 'gideon')) dd.bylaws.push({ id: 'gideon', kind: 'gideon', title: '중앙성서교회 기드온 찬양팀 회칙', revision: '', date: '', status: 'current', text: '', summary: [], notes: '', unsaved: true });
  if (!dd.assemblies) dd.assemblies = (await backend.list('depts/young/assemblies')).map(a => ({ ...a, id: a.id || a._id }));
  return dd;
}
/* 회칙 화면의 규례 종류: 청년부 회칙(총회 자동 판정 기준) · 한국성서선교회 헌장(통상 규례, 판정에는 안 씀) */
// 청년부 회칙 화면 맨 위에 늘 보이는 원칙
const YOUNG_PRINCIPLE = { src: '사단법인 한국성서선교회 헌장 제29조(기관의 권리 및 의무)', lead: '각 회원교회는 남, 녀 전도회, 장년회, 청년회, 각급 주일학교 등 여러 기관을 가지며 다음과 같은 권리 및 의무를 갖는다.', items: ['전 기관은 그 교회에 소속된다.', '각 기관은 그 교회에 봉사하기 위하여 존재한다.', '각 기관은 당회의 관할 하에 그 지도 및 치리를 받는다.', '각 기관은 당회의 지도하에 사업을 운영한다.', '각 기관은 사업을 위한 예산 결산을 당회에 제출하여 감사를 받는다.'], more: [{ src: '사단법인 한국성서선교회 헌장 제60조(권리)', body: '입교인은 성찬 참여와 공동의회 회원권을 가지며 선거권과 피선거권을 갖는다.' }] };
const principleHTML = () => `<details class="card principle" ${S.principleClosed ? '' : 'open'}><summary><h2>${esc(YOUNG_PRINCIPLE.src)}</h2><span class="pr-tg"></span></summary><p>${esc(YOUNG_PRINCIPLE.lead)}</p><ol>${YOUNG_PRINCIPLE.items.map(x => `<li>${esc(x)}</li>`).join('')}</ol>${(YOUNG_PRINCIPLE.more || []).map(m => `<h3 style="margin:14px 0 4px;font-size:15px">${esc(m.src)}</h3><p>${esc(m.body)}</p>`).join('')}</details>`;
const RULE_DOCS = { young: { name: '청년부 회칙', org: '중앙성서교회 청년부' }, gideon: { name: '기드온 찬양팀 회칙', org: '중앙성서교회 기드온 찬양팀' }, charter: { name: '한국성서선교회 헌장', org: '한국성서선교회' } };
const bylawKind = b => (b && b.kind) || 'young';
const bylawsOf = (dd, k) => dd.bylaws.filter(b => bylawKind(b) === k);
const currentOf = (dd, k) => { const l = bylawsOf(dd, k); return l.find(b => b.status === 'current') || l[0]; };
const currentBylaw = dd => currentOf(dd, 'young');
const canYoung = () => canEdit() && (S.dept === 'young' || isCommittee());
async function saveBylaw(dd, b) { const { unsaved, _id, ...data } = b; await backend.set(`depts/young/bylaws/${b.id}`, data); delete b.unsaved; }
async function saveAssembly(dd, a) { const { _id, unsaved, ...data } = a; await backend.set(`depts/young/assemblies/${a.id}`, data); delete a.unsaved; if (!dd.assemblies.includes(a)) dd.assemblies.push(a); }

/* 판정 */
// 정족수(13조): 직전 N주 평균 출석의 2/3. 출석 인원은 두 가지로 셀 수 있다 — 보고서에 적힌 출석 수(report) / 출석부에 체크된 회원 수(check). 총회 자료의 basis로 고른다
function quorumOf(dd, base, R, basis) {
  const reps = Object.values(dd.reports).filter(r => r.date < base).sort((a, b) => a.date < b.date ? -1 : 1).slice(-R.quorumWeeks);
  const rows = reps.map(r => { const st = reportStats(dd, r); const chk = Object.values(r.att || {}).filter(Boolean).length + Object.keys(r.attUnmatched || {}).length; const rep = (r.counts && r.counts.att) || st.p; const t = (r.teachersPresent || []).length; return { date: r.date, rep, chk, t, p: basis === 'check' ? chk : rep }; });
  const avgOf = k => rows.length ? rows.reduce((a, b) => a + b[k], 0) / rows.length : 0; const exact = v => v * R.quorumNum / R.quorumDen; const need = v => Math.ceil(exact(v) - 1e-9); // 회칙 그대로: 평균 × 2/3 (소수점 그대로). 참석 인원이 그 값 '이상'이어야 하므로 필요한 사람 수는 올림 (18.4 → 19명)
  const avg = avgOf('p');
  return { rows, avg, need: need(avg), exact: exact(avg), basis: basis || 'report', alt: { rep: { avg: avgOf('rep'), need: need(avgOf('rep')), exact: exact(avgOf('rep')) }, chk: { avg: avgOf('chk'), need: need(avgOf('chk')), exact: exact(avgOf('chk')) } } };
}
// 한 주일의 출석 근거: 'P'/'O'(출석 체크) · 'U'(보고서 출석자 이름이 출석부와 안 맞아 이름으로만 남음) · 'T'(교사·임원 참석 명단에 있음) · ''(없음)
function attEvidence(r, s) {
  const a = (r.att || {})[s.id]; if (a) return { v: a, src: '출석 체크' };
  const un = Object.keys(r.attUnmatched || {}).find(n => normName(n) === normName(s.name)); if (un) return { v: 'U', src: '보고서 출석자 이름(출석부 미연결)' };
  if ((r.teachersPresent || []).some(n => normName(n) === normName(s.name))) return { v: 'T', src: '교사·임원 참석 명단' };
  return { v: '', src: '' };
}
function judge(dd, s, base, R) {
  const why = []; const age = ageAt(s.birth, base);
  const yearReps = yearSundays(dd, base);
  const ev = yearReps.map(r => attEvidence(r, s)); const cnt = ev.filter(e => e.v).length; const rate = yearReps.length ? Math.round(cnt / yearReps.length * 100) : null;
  const extra = ev.filter(e => e.v === 'U' || e.v === 'T').length;
  const ys = youngStart(dd, s), cs = churchStart(dd, s);
  const yYears = ys ? yearsSince(ys.date, base) : null, cYears = cs ? yearsSince(cs.date, base) : null;
  if (extra) why.push(`출석 ${extra}주는 교사·임원 참석 명단 또는 이름만 적힌 출석자에서 보탬`);
  if (ys && ys.rejoined) why.push(ys.noReturn ? '제적 기록 뒤 출석 기록이 없음 — 복적일 확인 필요' : `제적 후 ${ys.date} 복적${ys.est ? '(추정: 제적 뒤 첫 출석)' : ''} — 출석 연수·6개월은 복적일부터`);
  if (ys && ys.school) why.push(`주일학교 출신 — 청년부 시작 ${ys.date} (만 19세 되는 해 1월)`);
  else if (ys && ys.evang) why.push(`전도 — 청년부 등록일 ${ys.date}`);
  else if (ys && ys.floored) why.push(`청년부 등록 ${ys.date} (만 19세 되는 해 1월, 그 전은 중고등부)`);
  // 4조 회원
  let member = 'ok';
  if (s.status === 'left') { member = 'no'; why.push('제적'); }
  if (s.group === '라피끄') { member = 'no'; why.push('라피끄 소속'); }
  if (age === null) { if (member === 'ok') member = 'check'; why.push('생년월일 없음'); }
  else if (age < R.ageMin || age > R.ageMax) { member = 'no'; why.push(`만 ${age}세`); }
  if (s.married) { const my = marriedYear(s), by = +String(base).slice(0, 4); if (my && my >= by) why.push(`${my}년 결혼 — 결혼한 해까지는 회원(관례)`); else { member = 'no'; why.push(my ? `${my}년 결혼(기혼)` : '기혼'); } }
  if (s.churchRole) { member = 'no'; why.push(`직분자(${s.churchRole})`); }
  if (s.otherCell) { member = 'no'; why.push('타 목장 소속'); }
  const memberWhy = why.slice();
  // 5조 선거권
  let voter = member;
  const sinceNew = ys && ys.rejoined && !(s.newcomerDone > ys.date) ? ys.date : (s.newcomerDone || (ys ? ys.date : ''));
  // 교회 원칙: 결의권자·회장·부회장·임명직 모두 세례교인이 기본 (회칙 판과 무관하게 항상 적용)
  if (voter !== 'no') { if (faithUnknown(s)) { voter = 'check'; why.push('신급 모름'); } else if (!isBaptized(s)) { voter = 'no'; why.push(`세례교인 아님(${s.faith})`); } }
  if (voter !== 'no') {
    if (!sinceNew) { voter = 'check'; why.push('출석 시작일 모름'); }
    else if (sinceNew > addMonths(base, -R.voterMonths)) { voter = 'no'; why.push(`${s.newcomerDone ? '새가족반 수료' : '출석 시작'} ${R.voterMonths}개월 미만`); }
    if (rate === null) { if (voter === 'ok') voter = 'check'; why.push('출석 기록 없음'); }
    else if (cnt * 100 < R.voterRate * yearReps.length) { // 반올림하지 않고 정확히 비교 (31/52=59.6%는 미달)
      const need = Math.ceil(yearReps.length * R.voterRate / 100); const pending = yearReps.filter(r => r.missing && r.date >= today()).length; // 아직 안 온 주일(총회 당일 등)
      if (pending && cnt + pending >= need) { if (voter === 'ok') voter = 'check'; why.push(`출석률 ${(cnt / yearReps.length * 100).toFixed(1)}% (${cnt}/${yearReps.length}) — 남은 ${pending}주(${yearReps.filter(r => r.missing && r.date >= today()).map(r => r.date.slice(5).replace('-', '/')).join(', ')}) 출석하면 ${need}주 충족`); }
      else { voter = 'no'; why.push(`출석률 ${(cnt / yearReps.length * 100).toFixed(1)}% (${cnt}/${yearReps.length}, 기준 ${need}주 이상)`); } }
  }
  const voterWhy = why.slice();
  // 11조 후보 자격 — 판정과 함께 그 칸의 사유도 모은다
  const byR = (years, need, ageMax) => { const r = memberWhy.slice(); if (s.expelled) r.push(`제명 이력(${s.expelled})`); if (ageMax && age !== null && age > ageMax) r.push(`만 ${age}세 — ${ageMax}세 초과`); if (faithUnknown(s)) r.push('신급 모름'); else if (!isBaptized(s)) r.push(`세례교인 아님(${s.faith})`); if (years === null) r.push('출석 시작일 모름'); else if (years < need) r.push(`출석 ${Math.floor(years * 10) / 10}년 — ${need}년 미만`); return r; };
  const rsn = { member: memberWhy, voter: voterWhy, pres: byR(yYears, R.presYears, R.presAgeMax), vp: byR(yYears, R.vpYears, 0), appt: byR(cYears, R.apptYears, 0) };
  const by = (years, need, ageMax, bap) => { if (member === 'no' || s.expelled) return 'no'; if (ageMax && age !== null && age > ageMax) return 'no'; if (bap && !faithUnknown(s) && !isBaptized(s)) return 'no'; if (years !== null && years < need) return 'no'; if ((ageMax && age === null) || (bap && !s.faith) || years === null || member === 'check') return 'check'; return 'ok'; };
  let pres = by(yYears, R.presYears, R.presAgeMax, true), vp = by(yYears, R.vpYears, 0, true); let appt = by(cYears, R.apptYears, 0, true);
  // 피선거권은 결의권(선거권)이 있는 회원에게만 (5조 1·4항): 선거권이 '아님'이면 후보도 '아님', '확인'이면 후보도 '확인'
  const gate = v => voter === 'no' ? 'no' : (voter === 'check' && v === 'ok') ? 'check' : v;
  if (voter !== 'ok') { const extra = voterWhy.filter(w => !memberWhy.includes(w)); ['pres', 'vp', 'appt'].forEach(k => { extra.forEach(w => { if (!rsn[k].includes(w)) rsn[k].push(w); }); }); }
  pres = gate(pres); vp = gate(vp); appt = gate(appt);
  // 9조 연임 제한: 임원 이력(과거 자료 + 올해 임원 명단)에서 선거 연도까지 같은 직위를 연속 몇 해 맡았는지 센다
  const offs = officersOf(dd, s); const baseYear = +base.slice(0, 4);
  const streak = roles => { let n = 0; for (let y = baseYear; offs.some(o => o.year === y && roles.includes(o.role)); y--) n++; return n; };
  const pr = streak(['회장']), vr = streak(['부회장']), tr = streak(['회장', '부회장']);
  if (R.sameRoleMax && pr >= R.sameRoleMax && pres !== 'no') { pres = 'no'; why.push(`회장 ${pr}년 연임(9조)`); rsn.pres.push(`회장 ${pr}년 연임(9조)`); }
  if (R.sameRoleMax && vr >= R.sameRoleMax && vp !== 'no') { vp = 'no'; why.push(`부회장 ${vr}년 연임(9조)`); rsn.vp.push(`부회장 ${vr}년 연임(9조)`); }
  if (R.chairTeamMax && tr >= R.chairTeamMax) { if (pres !== 'no') { pres = 'no'; why.push(`회장단 ${tr}년 연속(9조)`); rsn.pres.push(`회장단 ${tr}년 연속(9조)`); } if (vp !== 'no') { vp = 'no'; why.push(`회장단 ${tr}년 연속(9조)`); rsn.vp.push(`회장단 ${tr}년 연속(9조)`); } }
  const offO = offs.filter(o => roleKind(o.role) === '임원'), offT = offs.filter(o => ['팀장', '팸장'].includes(roleKind(o.role)));
  if (offO.length) why.push('임원 이력: ' + offO.map(o => `${o.year} ${o.role}`).join(' · '));
  if (offT.length) why.push('팀장·팸장: ' + offT.map(o => `${o.year} ${o.role}`).join(' · '));
  const histList = offs.filter(o => ['임원', '팀장', '팸장'].includes(roleKind(o.role))).map(o => `${o.year} ${o.role}`); const hist = histList.join(' · '); // 총회자료 '이력' 칸: 오래된 연도부터
  return { s, age, rate, cnt, of: yearReps.length, ys, cs, yYears, cYears, member, voter, pres, vp, appt, why, rsn, est: !!(ys && ys.est), offs, hist, histList };
}
const JP = { ok: ['ok', '해당'], no: ['mute', '아님'], check: ['warn', '확인'] };
const jpill = (v, reasons) => `<span class="pill ${JP[v][0]}">${JP[v][1]}</span>${v !== 'ok' && reasons && reasons.length ? `<div class="pwhy">${reasons.map(esc).join('<br>')}</div>` : ''}`;
function applyOverride(a, j) { const o = (a.overrides || {})[j.s.id]; if (o && o.voter) { j.voter = o.voter; if (j.rsn) j.rsn.voter = ['보정: ' + (o.note || '총회에서 정정')]; } if (o && o.note) j.why.push('보정: ' + o.note); return j; }
// 판정 대상: 출석부의 재적 회원 + 팸장(팸장은 결의권자). 장기결석·군입대 등, 제적, 결혼·직분(자격 종료), 타 목장 소속은 판정표에서 빼고 아래에 따로 적는다
/* 총회 판정 확정: 그날의 판정 결과를 총회 문서에 그대로 저장해 둔다. 확정 뒤에는 회원 상태·출석·회칙이 바뀌어도
   이 총회의 화면·출력·엑셀이 확정 당시 결과로 나온다. "지금 기준으로 다시 보기"로 현재 계산과 비교할 수 있다. */
/* 발언권자: 결의권은 없지만 교회 등록(처음 출석) 6개월이 지난 사람. 결의권자는 당연히 발언권이 있으므로 따로 표기하지 않는다 */
const SPEAK_MONTHS = 6;
function speakOf(dd, j, base) {
  if (j.speak !== undefined) return j.speak; if (j.voter === 'ok') return false;
  let cs = j.cs; if (!cs && dd) { const s = (dd.students || []).find(x => x.id === j.s.id); if (s) cs = churchStart(dd, s); }
  return !!(cs && cs.date && cs.date <= addMonths(base, -SPEAK_MONTHS));
}
function assemblySnapshot(dd, J) {
  const mini = s => ({ id: s.id, name: s.name, birth: s.birth || '', faith: s.faith || '', sex: s.sex || '', pseudo: !!s.pseudo });
  return { at: today(), bylaw: (currentBylaw(dd) || {}).revision || '', R: clone(J.R), q: clone(J.q),
    list: J.list.map(j => { const { s, ...rest } = j; return { ...clone(rest), s: mini(s) }; }), excluded: (J.excluded || []).map(x => ({ s: mini(x.s), why: x.why, speak: !!x.speak })) };
}
function assemblyJudge(dd, a) {
  if (a.snapshot && !S.sub.asLive) return { ...clone(a.snapshot), snap: true };
  const R = (currentBylaw(dd) || {}).params || RULE_2025;
  const fam = famLeaders(dd, YEAR); const famSet = new Set(fam.map(x => normName(x.name))); const isFamP = s => famSet.has(normName(s.name));
  const outWhy = s => s.status === 'left' ? '제적' : isGrad(s) ? statusName(s) : s.churchRole ? `직분(${s.churchRole})` : s.otherCell ? '타 목장 소속' : s.group === '라피끄' ? '라피끄' : AWAY.includes(s.status) ? statusName(s) : s.status === 'newcomer' ? '새친구' : '';
  const inPool = s => isFamP(s) || (s.status === 'active' && !outWhy(s));
  const pool = dd.students.filter(inPool);
  fam.filter(x => !x.stu).forEach(x => { const t = dd.doc.staff.find(y => y.status !== 'left' && normName(y.name) === normName(x.name)) || {}; pool.push({ id: 'fam_' + normName(x.name), name: x.name, sex: t.sex || '', birth: t.birth || '', faith: t.faith || '', status: 'active', group: '', history: [], pseudo: true }); });
  // 교역자: 회칙 5조 2항 — 발언권·선거권은 있고 피선거권은 없다. 회원 판정 없이 결의권자 맨 아래에 넣는다(fam 묶음과 같은 자리, minister 표시)
  const mins = dd.doc.staff.filter(t => t.status !== 'left' && t.name && roleParts(t.role).some(r => /^(교역자|목사|전도사|강도사)$/.test(r)) && !pool.some(p => normName(p.name) === normName(t.name)));
  mins.forEach(t => pool.push({ id: 'min_' + normName(t.name), name: t.name, sex: t.sex || '', birth: t.birth || '', faith: t.faith || '', status: 'active', group: '', history: [], pseudo: true, minister: true }));
  const MIN_WHY = '교역자 — 발언권·선거권 (회칙 5조 2항)', MIN_NO = '교역자 — 피선거권 없음 (회칙 5조 2항)';
  const list = pool.map(s => { const j = judge(dd, s, a.date, R);
    if (s.minister) { Object.assign(j, { rate: null, cnt: null, voter: 'ok', pres: 'no', vp: 'no', appt: 'no', fam: true, minister: true, why: [MIN_WHY], rsn: { member: [], voter: [MIN_WHY], pres: [MIN_NO], vp: [MIN_NO], appt: [MIN_NO] } }); return j; }
    if (isFamP(s)) { j.voter = 'ok'; j.rsn = j.rsn || {}; j.rsn.voter = ['팸장 — 결의권자']; j.why.unshift('팸장 — 결의권자'); j.fam = true; } return applyOverride(a, j); })
    .sort((x, y) => (x.fam ? 1 : 0) - (y.fam ? 1 : 0) || (x.minister ? 1 : 0) - (y.minister ? 1 : 0) || x.s.name.localeCompare(y.s.name, 'ko'));
  const excluded = dd.students.filter(s => s.status !== 'left' && !isGrad(s) && !s.churchRole && !inPool(s)).map(s => ({ s, why: outWhy(s) })).sort((x, y) => x.why.localeCompare(y.why, 'ko') || x.s.name.localeCompare(y.s.name, 'ko'));
  list.forEach(j => { j.speak = speakOf(dd, j, a.date); }); excluded.forEach(x => { x.speak = AWAY.includes(x.s.status) && speakOf(dd, { s: x.s, voter: 'no' }, a.date); });
  return { R, list, q: quorumOf(dd, a.date, R, a.quorumBasis || 'check'), excluded }; // 기준 기본값: 출석부 체크 수 (2026 임원회의 결정)
}
function lastSundayOfYear(y) { const d = new Date(y, 11, 31); d.setDate(d.getDate() - d.getDay()); return iso(d); }
// 총회 순서 기본안 (한국성서선교회 대의원총회 순서를 청년부에 맞춘 것). 임시총회는 1·2·3·4·9·13·14·15·16만. 임원 교체는 1월 첫 주에 따로 하므로 이·취임 순서는 없음
const ORDER_ITEMS = [
  [1, '출석 확인 — 결의권 있는 회원 이름을 부르고 정족수(직전 5주 평균 출석의 2/3)가 됐는지 확인', '서기'],
  [2, '개회 선언 — 정족수가 찼음을 알리고 총회 시작', '회장'],
  [3, '순서 확인 — 오늘 순서를 읽고 이대로 진행해도 되는지 묻기', '회장'],
  [4, '지난 총회 기록 읽기 — 지난 총회에서 정한 것 확인', '서기'],
  [5, '새 회원 인사 — 올해 새로 들어온 청년 소개', '새 회원'],
  [6, '한 해 보고 — 올해 한 일(예배·수련회·팸·새가족·전도)', '총무'],
  [7, '회계 보고 — 올해 수입·지출과 남은 돈', '회계'],
  [8, '내년 계획과 예산(안) — 설명 뒤 찬반', '회장 → 회원'],
  [9, '회칙 개정(안) — 바꿀 조항 설명 뒤 찬반 (정족수의 과반 찬성, 23조)', '회장 → 회원'],
  [10, '회장·부회장 선출 — 후보 자격자 명단 공개 → 자원·추천 → 무기명 비밀투표 → 과반 득표자 확정·공포 (14조)', '회장·서기'],
  [11, '새 회장단 인사 — 당선자 인사. 총무·서기·회계는 새 회장단이 정해 뒤에 발표', '새 회장'],
  [13, '그 밖의 안건 — 회원이 내놓은 안건 토의', '회원'],
  [14, '알림 — 다음 모임·행사 안내', '총무'],
  [15, '찬송', '다같이'],
  [16, '기도·폐회', '담당 교역자']];
const ORDER_TEMP = [1, 2, 3, 4, 9, 13, 14, 15, 16];
function defaultOrder(kind) { const items = kind === '임시총회' ? ORDER_ITEMS.filter(x => ORDER_TEMP.includes(x[0])) : ORDER_ITEMS; return items.map((x, i) => `${i + 1}. ${x[1]} (${x[2]})`).join('\n'); }
function blankAssembly(date) { return { id: date, date, kind: '정기총회', title: `${+date.slice(0, 4)}년 청년부 정기총회`, place: '', overrides: {}, candidates: [], minutes: { opened: '', closed: '', presider: '', secretary: '', attendees: '', order: defaultOrder('정기총회'), agenda: [], votes: [], notes: '', status: 'draft' }, unsaved: true }; }
function pickAssembly(dd) {
  const list = dd.assemblies.slice().sort((a, b) => a.date < b.date ? 1 : -1);
  let a = list.find(x => x.id === S.sub.asm);
  if (!a) a = list.find(x => x.date >= today()) || list[0];
  if (!a || S.sub.asm === 'new') { const d = S.sub.newDate || lastSundayOfYear(YEAR); a = dd.assemblies.find(x => x.id === d) || blankAssembly(d); }
  return { a, list };
}
const asmPicker = (list, a) => `<select id="as-pick" style="width:auto">${list.map(x => `<option value="${esc(x.id)}" ${x.id === a.id ? 'selected' : ''}>${esc(x.date)} ${esc(x.kind)}</option>`).join('')}${a.unsaved ? `<option value="${esc(a.id)}" selected>${esc(a.date)} ${esc(a.kind)} (새로 만드는 중)</option>` : ''}</select>${canYoung() ? '<button class="btn s" id="as-new">새 총회</button>' : ''}`;

/* 회칙 */
// 회칙·헌장 본문 보기: 편 > 장 > 절·관 > 조 > 항(①) > 호(1. 가.)와, 장·조에 속하지 않는 머리말·전문·소제목을 구분해 보여 준다
const BL_SPECIAL = /^[\[【<〈《(「]?\s*(머\s*리\s*말|전\s*문|서\s*문|前\s*文|서\s*언|총\s*강|강\s*령|신앙\s*고백|신\s*조|선\s*언(?:\s*문)?|선\s*서(?:\s*문)?|목\s*적|이\s*념|정\s*신|비\s*전|사\s*명(?:\s*선언)?|맺\s*음\s*말|부\s*록|별\s*표|별\s*지)(?:\s*[:：].*)?\s*[\]】>〉》)」]?$/;
/* 회칙 판 비교 — 조(條)·항(項) 단위로 짝을 맞춰 바뀐 낱말만 색으로 표시 */
const blNorm = x => String(x || '').replace(/\s+/g, '');
function wordDiffHTML(oldT, newT, known = '') {
  const A = String(oldT).split(/\s+/).filter(Boolean), B = String(newT).split(/\s+/).filter(Boolean);
  if (A.length * B.length > 250000) return `<span class="bl-add">${esc(newT)}</span>`;
  const L = Array.from({ length: A.length + 1 }, () => new Uint16Array(B.length + 1));
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = []; let i = 0, j = 0; const push = (k, w) => { const l = out[out.length - 1]; if (l && l.k === k) l.w.push(w); else out.push({ k, w: [w] }); };
  while (i < A.length && j < B.length) { if (A[i] === B[j]) { push('=', B[j]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) push('-', A[i++]); else push('+', B[j++]); }
  while (i < A.length) push('-', A[i++]); while (j < B.length) push('+', B[j++]);
  // 예전 판에서 다른 줄에 있던 글이 이번 판에서 한 줄로 합쳐진 것은 바뀐 것이 아님
  out.forEach(x => { if (x.k === '+' && known && known.includes(blNorm(x.w.join('')))) x.k = '='; });
  out.forEach((x, i) => { if (x.k !== '-') return; const nb = [out[i - 1], out[i + 1]].filter(Boolean); if (nb.some(y => y.k === '=' && blNorm(y.w.join('')).includes(blNorm(x.w.join(''))))) x.k = 'x'; });
  const res = out.filter(x => x.k !== 'x'); res.changed = res.some(x => x.k !== '=');
  const html = res.map(x => x.k === '=' ? esc(x.w.join(' ')) : x.k === '+' ? `<ins class="bl-add">${esc(x.w.join(' '))}</ins>` : `<del class="bl-del">${esc(x.w.join(' '))}</del>`).join(' ');
  return res.changed ? html : null;
}
function bylawParas(t) { const c = []; bylawHTML(t, { collect: c }); return c; }
function bylawHTML(t, opt = {}) {
  if (!String(t || '').trim()) return '';
  const out = [], toc = []; let n = 0, started = false, inArticles = false, pre = false, para = null, art = 'pre', pi = 0;
  const P = opt.prev, seen = opt.seenKeys;
  const keyOf = q => { const tok = q.lab ? (/조/.test(q.lab) ? 'art' : blNorm(q.lab)) : ((q.txt.match(/^(\(\d+\)|（\d+）|\d+\s*항|\d+\s*[.)]|[가-하]\s*[.)]|[①-⑳])/) || [])[0] ? blNorm(q.txt.match(/^(\(\d+\)|（\d+）|\d+\s*항|\d+\s*[.)]|[가-하]\s*[.)]|[①-⑳])/)[0]) : 'p' + (pi++)); return art + '|' + tok; };
  const body = (q, key) => { const full = (q.lab || '') + ' ' + q.txt; if (!P) return esc(q.txt);
    if (P.all.has(blNorm(full)) || P.text.includes(blNorm(q.txt))) return esc(q.txt); const o = P.byKey.get(key);
    if (o) { const h = wordDiffHTML(o.txt, q.txt, P.text); if (h == null) return esc(q.txt); q.chg = 1; return h; }
    const h = wordDiffHTML('', q.txt, P.text); if (h == null) return esc(q.txt); q.chg = 2; return h; };
  const flush = () => { if (para) { if (para.lab) { const m = para.lab.match(/제\s*(\d+)\s*조(?:\s*의\s*(\d+))?/); if (m) art = 'A' + m[1] + (m[2] ? '-' + m[2] : ''), pi = 0; } const key = keyOf(para);
      const html = body(para, key); if (seen) seen.add(key);
      if (opt.collect) opt.collect.push({ key, lab: para.lab || '', txt: para.txt, full: (para.lab || '') + ' ' + para.txt, chg: para.chg || 0, html }); out.push(`<p class="${para.cls}${para.chg ? ' bl-chg' : ''}">${para.lab ? `<span class="art">${esc(para.lab)}</span>` : ''}${html}</p>`); para = null; } };
  const head = (lvl, cls, x) => { flush(); started = true; const id = 'bl-h' + (n++); toc.push({ id, cls, x }); const nw = P && !P.heads.has(blNorm(x)); out.push(`<div role="heading" aria-level="${lvl}" class="${cls}${nw ? ' bl-chg' : ''}" id="${esc(id)}">${nw ? `<ins class="bl-add">${esc(x)}</ins>` : esc(x)}</div>`); if (opt.collect) opt.collect.push({ head: blNorm(x) }); };
  const start = (cls, txt, lab) => { flush(); para = { cls, txt, lab }; };
  const ends = x => /([.。!?」』)\]]|다|함|음|됨|임|요)$/.test(x);
  const L = t.split('\n');
  for (let li = 0; li < L.length; li++) { const raw = L[li];
    const x = raw.trim(); if (!x) { flush(); continue; }
    if (/^={3,}/.test(x)) continue; // 예전에 여러 파일을 합칠 때 넣은 "===== 파일이름" 구분 줄
    const indented = /^\s{2,}/.test(raw);
    // 조문 바로 뒤 괄호 한 줄 "(…)"은 앞 문장에 딸린 덧붙임 — 판마다 줄을 바꿨다 붙였다 해서 비교가 어긋나므로 한 문단으로 잇는다
    if (para && /^[(（][^()（）]*[)）]\.?$/.test(x)) { para.txt += ' ' + x; continue; }
    // 한글에서 Enter+스페이스로 줄을 맞춘 흔적: 끝나지 않은 문장 뒤의 "다." 같은 조각이나 "제 4장 14조에 의하여…"는 앞 문장에 잇는다
    if (para && !ends(para.txt) && (/^[가-힣]{1,2}[.)]?$/.test(x) || /^제\s*\d+\s*(장|조)\s*\d*\s*(조|항)?\s*(에|의|를|을|및|과|와)/.test(x))) { para.txt += blGlue(para.txt, x) + x; continue; }
    if (/^제\s*\d+\s*편/.test(x)) { pre = false; head(2, 'bl-part', x.replace(/\s{2,}/g, ' ')); continue; }
    if (/^부\s*칙/.test(x)) { pre = false; const nx = L.slice(li + 1, li + 4).join(' '); const dm = nx.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/); head(3, 'bl-chap bl-addenda', '부칙' + (dm ? ` (${dm[1]}. ${dm[2]}. ${dm[3]}. 시행)` : '')); continue; }
    if (/^제\s*\d+\s*장/.test(x)) { pre = false; head(3, 'bl-chap', x.replace(/\s{2,}/g, ' ')); continue; }
    if (/^제\s*\d+\s*(절|관)/.test(x)) { pre = false; head(4, 'bl-sect', x.replace(/\s{2,}/g, ' ')); continue; }
    let m = x.match(/^(제\s*\d+\s*조(?:\s*의\s*\d+)?\s*(?:[(（][^)）]*[)）])?)(.*)$/);
    if (m) { pre = false; inArticles = true; started = true; start('bl-art', m[2], m[1]); continue; }
    if (BL_SPECIAL.test(x) || /^[<〈《【\[「]\s*[^<>〈〉《》【】\[\]]{1,24}\s*[>〉》】\]」]$/.test(x)) { pre = true; head(3, 'bl-special', x.replace(/^[\[【<〈《(「]\s*|\s*[\]】>〉》)」]$/g, '')); continue; }
    m = x.match(/^((?:제\s*)?\d+\s*항\s*(?:[(（][^)）]*[)）])?)(.*)$/); // "제1항"뿐 아니라 "1항 :"도 항으로 — 조 제목 줄에 붙지 않고 따로 줄을 잡음
    if (m) { start('bl-cl1', m[2], m[1]); continue; }
    if (/^([①-⑳])/.test(x)) { start('bl-cl1', x); continue; }
    if (/^(\(\d+\)|（\d+）|\d+\s*[.)]|[가-하]\s*[.)])\s*/.test(x) && !/^\d{4}\s*[.년]/.test(x)) { start('bl-cl2' + (pre && !inArticles ? ' bl-pre' : ''), x); continue; }
    if (/^[*※]/.test(x)) { start('bl-note', x); continue; }
    if (para && (indented || !ends(para.txt))) { para.txt += (/[가-힣]$/.test(para.txt) && /^[가-힣]/.test(x) ? ' ' : ' ') + x; continue; }
    if (!started && x.length <= 30) { flush(); out.push(`<div class="${out.some(o => o.includes('bl-title')) ? 'bl-subtitle' : 'bl-title'}">${esc(x.replace(/\s{2,}/g, ' '))}</div>`); continue; }
    const shortHead = x.length <= 24 && !ends(x) && !/[,:;，]$/.test(x) && !/\d{4}/.test(x);
    if (shortHead && !indented) { pre = !inArticles; head(4, 'bl-sub', x); continue; }
    start(pre || !inArticles ? 'bl-pre' : '', x);
  }
  flush();
  const adds = toc.filter(h => h.cls.includes('bl-addenda'));
  const big = toc.filter(h => h.cls !== 'bl-sub' && h.cls !== 'bl-sect' && (!h.cls.includes('bl-addenda') || h === adds[0])).map(h => h === adds[0] && adds.length > 1 ? { ...h, x: `부칙 (${adds.length}개)` } : h);
  const tocHTML = big.length >= 4 ? `<nav class="bl-toc no-print"><b>차례</b>${big.map(h => `<a href="#${h.id}" class="t-${h.cls.split(' ')[0].slice(3)}" data-bltoc="${esc(h.id)}">${esc(h.x)}</a>`).join('')}</nav>` : '';
  return tocHTML + out.join('');
}
/* 바로 앞 판 찾기: 개정안은 현행과, 나머지는 날짜가 앞선 판 중 가장 최근 것과 비교 */
function bylawPrev(b, vs) {
  const c = vs.filter(x => x.id !== b.id && String(x.text || '').trim());
  if (b.status === 'draft') return c.find(x => x.status === 'current') || null;
  return c.filter(x => x.status !== 'draft' && (x.date || '') < (b.date || '')).sort((x, y) => (x.date < y.date ? 1 : -1))[0] || null;
}
const _blDiff = {};
function bylawDiffOpt(b, vs) {
  const pv = bylawPrev(b, vs); if (!pv) return {};
  const ck = b.id + '|' + pv.id + '|' + blNorm(b.text).length + '|' + blNorm(pv.text).length; if (_blDiff.k === ck) return _blDiff.opt;
  const ps = bylawParas(pv.text); const P = { all: new Set(), byKey: new Map(), heads: new Set() };
  ps.forEach(q => { if (q.head) P.heads.add(q.head); else { P.all.add(blNorm(q.full)); if (!P.byKey.has(q.key)) P.byKey.set(q.key, q); } }); P.text = ps.filter(q => !q.head).map(q => blNorm(q.full)).join('');
  const seenKeys = new Set(); const cur = []; bylawHTML(b.text, { prev: P, seenKeys, collect: cur });
  const curText = cur.filter(q => !q.head).map(q => blNorm(q.full)).join('');
  const removed = ps.filter(q => !q.head && !/^=+/.test(q.full.trim()) && !seenKeys.has(q.key) && !curText.includes(blNorm(q.txt)));
  const artName = (q, src) => /\d+\s*차\s*수정\s*:|공포\s*서기/.test(q.txt) ? '개정 이력' : (() => { const a = q.key.split('|')[0]; if (a === 'pre') return '머리말'; const m = a.match(/^A(\d+)(?:-(\d+))?$/); return m ? `제${m[1]}조${m[2] ? '의' + m[2] : ''}` : a; })();
  const changes = [...cur.filter(q => !q.head && q.chg).map(q => ({ art: artName(q), kind: q.chg === 1 ? '바뀜' : '새로 생김', html: String(q.html || '').replace(/^\s*[:：]\s*/, '') })), ...removed.map(q => ({ art: artName(q), kind: '빠짐', html: `<del class="bl-del">${esc(q.txt.trim().replace(/^[:：]\s*/, ''))}</del>` }))];
  const opt = { prev: P, pv, removed, changes, nChg: cur.filter(q => q.chg === 1).length, nNew: cur.filter(q => q.chg === 2).length };
  _blDiff.k = ck; _blDiff.opt = opt; return opt;
}
function bylawDiffBlock(b, vs) {
  const o = bylawDiffOpt(b, vs); if (!o.pv) return '<div class="bl-diffbar note">비교할 이전 판이 없습니다 (가장 오래된 판).</div>';
  const on = !S.sub.nodiff;
  return `<div class="bl-diffbar no-print"><b>${esc(o.pv.revision || '이전 판')}${o.pv.date ? ' (' + esc(o.pv.date) + ')' : ''}</b>과 비교 — 바뀐 곳 ${o.nChg} · 새로 생긴 곳 ${o.nNew} · 빠진 곳 ${o.removed.length}
    <span class="lg"><ins class="bl-add">새로 들어간 글</ins> <del class="bl-del">빠진 글</del></span><button class="btn s" id="bl-difft">${on ? '표시 끄기' : '달라진 점 표시'}</button>
    ${on && o.removed.length ? `<details style="margin-top:6px"><summary>빠진 조문 ${o.removed.length}개 보기</summary>${o.removed.map(q => `<p class="bl-gone"><del class="bl-del">${esc(q.full.trim())}</del></p>`).join('')}</details>` : ''}</div>`;
}
VIEWS.bylaws = async () => {
  const dd = await loadYoung();
  const sel = dd.bylaws.find(x => x.id === S.sub.bylaw); const kind = sel ? bylawKind(sel) : (S.sub.rdoc || 'young'); const DOC = RULE_DOCS[kind]; const isYoung = kind === 'young';
  const vs = bylawsOf(dd, kind).sort(bylawOrder);
  const b = vs.find(x => x.id === S.sub.bylaw) || currentOf(dd, kind);
  const docTabs = `<div class="row" style="gap:6px;margin:-4px 0 14px">${Object.entries(RULE_DOCS).map(([k, d]) => `<button class="btn ${k === kind ? 'p' : ''}" data-rdoc="${esc(k)}">${d.name}</button>`).join('')}<span class="note" style="margin-left:6px">${isYoung ? '청년부 총회 자동 판정의 기준' : kind === 'gideon' ? '기드온 찬양팀 자체 회칙 — 총회 자동 판정에는 쓰지 않습니다' : '통상 규례 — 총회 자동 판정에는 쓰지 않습니다'}</span></div>`;
  const edit = canYoung();
  if (S.sub.print) return `<div class="topbar no-print"><div><h1>회칙 출력</h1></div><div class="row"><button class="btn" id="bl-back">돌아가기</button><button class="btn p" id="bl-pr">PDF로 저장 / 인쇄</button></div></div><section class="paper"><div class="hd"><div><h1>${esc(b.title)}</h1><div class="sub">${esc(b.revision)} · ${esc(b.date)}</div></div><div class="meta">${{ current: '현행', draft: '개정안', old: '이전 판' }[b.status]}</div></div><div class="bylaw-text">${bylawHTML(b.text) || '<p>(본문 없음)</p>'}</div><div class="ft"><b>${esc(DOC.org)}</b><span>CBCS에서 생성</span></div></section>`;
  if (S.sub.editText) return `<div class="topbar"><div><h1>${esc(DOC.name)} 본문 수정</h1><div class="sub">${esc(b.revision)} · 한글 파일에서 전체 선택 → 복사 → 아래에 붙여넣기. "제1조", "제1장"으로 시작하는 줄은 자동으로 제목이 됩니다.</div></div><div class="row"><button class="btn" id="bt-cancel">취소</button><button class="btn p" id="bt-save">저장</button></div></div>
    <div class="card"><div class="fields"><label class="f"><span>제목</span><input type="text" id="bt-title" value="${esc(b.title)}"></label><label class="f"><span>개정 차수</span><input type="text" id="bt-rev" value="${esc(b.revision)}"></label><label class="f"><span>개정일</span><input type="text" id="bt-date" value="${esc(b.date)}" placeholder="예: 2025-12-28 (모르면 연도만)"></label></div>
    <textarea id="bt-text" style="width:100%;min-height:520px;margin-top:10px;font-size:14px;line-height:1.7">${esc(b.text)}</textarea></div>`;
  const R = b.params || RULE_2025;
  return `<div class="topbar"><div><h1>${esc(DOC.name)}</h1><div class="sub">${b.status === 'current' ? '<span class="pill ok">현행</span>' : b.status === 'draft' ? '<span class="pill warn">개정안 · 총회 통과 전</span>' : '<span class="pill mute">이전 판</span>'} ${esc(b.revision)}${b.date ? ' · ' + esc(b.date) : ''}${b.status === 'current' && isYoung ? ' · 총회 자료의 자동 판정이 이 판을 따릅니다' : ''}</div></div>
    <div class="row">${canEdit() ? `<button class="btn" id="bl-print">${kind === 'charter' ? '헌장' : '회칙'} 출력</button>` : ''}${edit ? `<button class="btn p" id="bl-upload">파일 올리기 (HWP·PDF·Word)</button><button class="btn" id="bl-edit">본문 수정</button><button class="btn d" id="bl-del">이 판 삭제</button>${b.status !== 'current' ? '<button class="btn p" id="bl-current">현행으로 지정</button>' : ''}` : ''}</div></div>${docTabs}${isYoung ? principleHTML() : ''}
  <div class="grid2 bylaw-grid">
    <div class="card"><h2>${esc(b.title)}</h2>${b.text.trim() ? bylawDiffBlock(b, vs) : ''}${b.text.trim() ? `<div class="bylaw-text">${bylawHTML(b.text, S.sub.nodiff ? {} : bylawDiffOpt(b, vs))}</div>` : b.gap ? `<div class="hint"><b>${b.gap === 'missing' ? '본문 없음' : '결번'}</b> — ${b.gap === 'missing' ? '개정 기록은 있으나 이 판의 본문 파일을 아직 찾지 못했습니다. 찾으면 "파일 올리기"로 이 판에 넣으세요.' : '이 차수의 본문은 없습니다.'}${b.notes ? '' : ' 다음 판은 바로 앞에 본문이 있는 판과 비교합니다.'}</div>` : `<div class="hint">아직 본문이 없습니다. ${edit ? '"파일 올리기"로 HWP·HWPX·PDF·Word(DOCX) 원본을 올리면 본문을 자동으로 읽어 넣습니다. "본문 수정"으로 직접 붙여넣어도 됩니다.' : ''}</div>`}
      ${b.file ? `<div class="note" style="margin-top:10px">원본 파일: ${esc(b.file.name)} (${Math.round((b.file.size || 0) / 1024)}KB, ${esc(b.file.at || '')})${b.file.stored ? ' <button class="btn s" id="bl-down">원본 내려받기</button>' : ' — 파일이 커서 원본은 저장하지 않고 본문만 넣음'}</div>` : ''}
      ${b.notes ? `<div class="note" style="margin-top:10px">${esc(b.notes)}</div>` : ''}</div>
    <div class="stack">
      <div class="card"><h2>판(版) 목록</h2><div class="list vlist">${vs.map(x => `<button class="item ${x.id === b.id ? 'on' : ''}" data-bylaw="${esc(x.id)}" style="text-align:left;width:100%"><div><div class="t">${esc(x.revision || DOC.name)}</div><div class="d">${x.date ? esc(x.date) + ' · ' : ''}${x.gap ? (x.gap === 'missing' ? '본문 없음' : '결번') : { current: '현행', draft: '개정안', old: '이전 판' }[x.status]}</div></div></button>`).join('')}</div>
        ${edit ? `<div class="row" style="margin-top:10px"><button class="btn s" id="bl-add">새 개정안 추가</button>${isYoung || kind === 'gideon' ? '<button class="btn s" id="bl-import">역대 회칙 가져오기 (JSON)</button>' : ''}</div>` : ''}</div>
      ${b.text.trim() ? (() => { const o = bylawDiffOpt(b, vs); if (!o.pv) return `<div class="card"><h2>앞 판에서 바뀐 점</h2><div class="note">이 판보다 앞선 판이 없어 비교할 수 없습니다.</div></div>`;
        const groups = []; o.changes.forEach(c => { let g = groups.find(x => x.art === c.art); if (!g) groups.push(g = { art: c.art, items: [] }); g.items.push(c); });
        return `<div class="card bl-chgcard"><h2>${esc(b.revision || '')}에서 바뀐 점 <span class="r">${esc(o.pv.revision || '')} 대비 · 조문 ${groups.length}곳</span></h2>${groups.length ? groups.map(g => `<div class="bl-cg"><div class="bl-cg-h">${esc(g.art)} ${[...new Set(g.items.map(x => x.kind))].map(k => `<span class="pill ${k === '빠짐' ? 'bad' : k === '새로 생김' ? 'ok' : 'warn'}">${k}</span>`).join(' ')}</div>${g.items.map(x => `<div class="bl-cg-b">${x.html}</div>`).join('')}</div>`).join('') : '<div class="note">앞 판과 글자가 같습니다.</div>'}</div>`; })() : ''}
      ${isYoung && (b.summary || []).length ? `<div class="card"><h2>${b.status === 'current' ? '총회 판정 기준 (현행 회칙 요약)' : '이 판의 총회 판정 기준 (요약)'}</h2><div class="tw"><table class="bl-sum"><tbody>${(b.summary || []).map(x => Array.isArray(x) ? x : [x.no, x.title, x.body]).map(([n, t, d]) => `<tr><th style="white-space:nowrap">${esc(n)}</th><td><b>${esc(t)}</b> <span class="note">${esc(d)}</span></td></tr>`).join('')}</tbody></table></div></div>` : ''}
      ${isYoung ? `<div class="card"><h2>판정 기준값 <span class="r">${edit ? '개정되면 여기 숫자만 고치면 됩니다' : ''}</span></h2><div class="fields" style="grid-template-columns:1fr 1fr">
        ${[['ageMin', '회원 최소 나이'], ['ageMax', '회원 최대 나이'], ['voterMonths', '선거권: 수료 후 개월'], ['voterRate', '선거권: 1년 출석률(%)'], ['presAgeMax', '회장 최대 나이 (0=제한 없음)'], ['presYears', '회장 출석 연수'], ['vpYears', '부회장 출석 연수'], ['apptYears', '임명직 출석 연수'], ['sameRoleMax', '같은 직위 연속 최대 연수 (9조)'], ['chairTeamMax', '회장단 연속 최대 연수 (0=제한 없음)'], ['quorumWeeks', '정족수: 직전 몇 주']].map(([k, l]) => `<label class="f"><span>${l}</span><input type="number" data-rp="${esc(k)}" value="${R[k] ?? ''}" ${edit ? '' : 'readonly'}></label>`).join('')}
        <label class="f"><span>정족수 비율</span><div class="row" style="gap:4px"><input type="number" data-rp="quorumNum" value="${esc(R.quorumNum)}" style="width:60px" ${edit ? '' : 'readonly'}>/<input type="number" data-rp="quorumDen" value="${esc(R.quorumDen)}" style="width:60px" ${edit ? '' : 'readonly'}></div></label>
        <div class="note" style="grid-column:span 2">세례교인 요건은 교회 원칙으로 <b>결의권자·회장·부회장·임명직 모두</b>에 항상 적용되며 판마다 바꾸지 않습니다 (학습·유아세례만으로는 안 됨).</div>
      </div>${edit ? '<div class="row" style="margin-top:8px"><button class="btn s" id="rp-save">기준값 저장</button></div>' : ''}</div>` : `<div class="card"><h2>헌장에 대하여</h2><p class="note" style="margin:0">한국성서선교회 헌장은 통상 규례 중 하나입니다. 원본(HWP·PDF·Word)을 올려 두고 판(개정)별로 보관합니다. 청년부 총회 자료의 자동 판정은 청년부 회칙만 따릅니다.</p></div>`}
    </div>
  </div>`;
};
/* 회칙 파일 올리기: HWP(한글 5.0)·HWPX·PDF에서 본문 글자를 브라우저 안에서 읽는다(서버로 보내지 않음) */
const LIBS = { cfb: 'https://cdn.jsdelivr.net/npm/cfb@1.2.2/dist/cfb.min.js', pako: 'https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js', jszip: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', pdf: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', pdfw: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js', xlsx: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', html2pdf: 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js' };
const _libs = {};
function loadLib(k, global) { if (window[global]) return Promise.resolve(window[global]); return _libs[k] || (_libs[k] = new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = LIBS[k]; sc.onload = () => ok(window[global]); sc.onerror = () => no(new Error('도구를 불러오지 못했습니다(인터넷 연결 확인)')); document.head.appendChild(sc); })); }
function hwpParaText(u8) { const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); let out = ''; let j = 0; while (j + 1 < u8.length) { const c = dv.getUint16(j, true); if (c === 10) { out += '\n'; j += 2; continue; } if (c === 0 || c === 13 || (c >= 24 && c <= 31)) { j += 2; continue; } if (c === 9) { out += ' '; j += 16; continue; } if (c < 32) { j += 16; continue; } out += String.fromCharCode(c); j += 2; } return out; }
async function hwpToText(buf) {
  const CFB = await loadLib('cfb', 'CFB'); const pako = await loadLib('pako', 'pako');
  const cfb = CFB.read(new Uint8Array(buf), { type: 'array' });
  const hdr = CFB.find(cfb, 'FileHeader'); if (!hdr) throw new Error('한글(HWP 5.0) 파일이 아닙니다');
  const h = hdr.content; const compressed = h[36] & 1, distributed = h[36] & 4;
  if (distributed) throw new Error('배포용(보호된) 한글 파일은 읽을 수 없습니다. 한글에서 "다른 이름으로 저장"한 뒤 올려 주세요');
  const secs = cfb.FullPaths.map((p, i) => [p, cfb.FileIndex[i]]).filter(([p]) => /BodyText\/Section\d+$/i.test(p)).sort((a, b) => +a[0].match(/(\d+)$/)[1] - +b[0].match(/(\d+)$/)[1]);
  const lines = [];
  for (const [, e] of secs) {
    let d = new Uint8Array(e.content); if (compressed) d = pako.inflateRaw(d);
    const dv = new DataView(d.buffer, d.byteOffset, d.byteLength); let i = 0;
    while (i + 4 <= d.length) { const hh = dv.getUint32(i, true); i += 4; const tag = hh & 0x3ff; let size = hh >>> 20; if (size === 0xfff) { size = dv.getUint32(i, true); i += 4; } if (tag === 67) lines.push(hwpParaText(d.subarray(i, i + size))); i += size; }
  }
  return lines.join('\n');
}
async function hwpxToText(buf) {
  const JSZip = await loadLib('jszip', 'JSZip'); const z = await JSZip.loadAsync(buf);
  const names = Object.keys(z.files).filter(n => /Contents\/section\d+\.xml$/i.test(n)).sort((a, b) => +a.match(/(\d+)\.xml/i)[1] - +b.match(/(\d+)\.xml/i)[1]);
  const lines = [];
  for (const n of names) { const xml = await z.file(n).async('string'); const doc = new DOMParser().parseFromString(xml, 'application/xml'); doc.querySelectorAll('*').forEach(el => { if (el.localName === 'p') { const t = [...el.children].filter(c => c.localName === 'run').map(r => [...r.children].filter(x => x.localName === 't').map(x => x.textContent).join('')).join(''); lines.push(t); } }); }
  return lines.join('\n');
}
async function pdfToText(buf) {
  const lib = await loadLib('pdf', 'pdfjsLib'); lib.GlobalWorkerOptions.workerSrc = LIBS.pdfw;
  const pdf = await lib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise; /* 복사본을 넘긴다 — PDF 읽기 도구가 넘겨받은 자료를 가져가 버려서 원본 파일 보관(저장)이 실패하던 문제 */ const lines = [];
  for (let p = 1; p <= pdf.numPages; p++) { const tc = await (await pdf.getPage(p)).getTextContent(); let line = '', y = null; tc.items.forEach(it => { const yy = Math.round(it.transform[5]); if (y !== null && Math.abs(yy - y) > 2) { lines.push(line); line = ''; } line += it.str; y = yy; if (it.hasEOL) { lines.push(line); line = ''; y = null; } }); if (line) lines.push(line); }
  return lines.join('\n');
}
async function docxToText(buf) {
  const JSZip = await loadLib('jszip', 'JSZip'); const z = await JSZip.loadAsync(buf); const f = z.file('word/document.xml'); if (!f) throw new Error('Word(DOCX) 파일이 아닙니다');
  const doc = new DOMParser().parseFromString(await f.async('string'), 'application/xml'); const lines = [];
  doc.querySelectorAll('*').forEach(el => { if (el.localName !== 'p') return; let t = ''; el.querySelectorAll('*').forEach(x => { if (x.localName === 't') t += x.textContent; else if (x.localName === 'tab') t += ' '; else if (x.localName === 'br') t += '\n'; }); lines.push(t); });
  return lines.join('\n');
}
async function odtToText(buf) {
  const JSZip = await loadLib('jszip', 'JSZip'); const z = await JSZip.loadAsync(buf); const f = z.file('content.xml'); if (!f) throw new Error('ODT 파일이 아닙니다');
  const doc = new DOMParser().parseFromString(await f.async('string'), 'application/xml'); const lines = [];
  doc.querySelectorAll('*').forEach(el => { if (el.localName === 'p' || el.localName === 'h') lines.push(el.textContent); });
  return lines.join('\n');
}
async function fileToRuleText(file, buf) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return pdfToText(buf);
  if (ext === 'hwpx') return hwpxToText(buf);
  if (ext === 'hwp') return hwpToText(buf);
  if (ext === 'docx') return docxToText(buf);
  if (ext === 'odt') return odtToText(buf);
  if (ext === 'txt' || ext === 'md') return new TextDecoder('utf-8').decode(buf);
  if (ext === 'doc') throw new Error('옛 Word(.doc) 파일은 읽을 수 없습니다. Word에서 .docx로 저장하거나 PDF로 저장해 올려 주세요');
  throw new Error('HWP·HWPX·PDF·DOCX·ODT·TXT 파일만 읽을 수 있습니다');
}
/* @@UNWRAP-START — 한글에서 Tab(정렬) 대신 "Enter + 스페이스 여러 번"이나 "스페이스 여러 번"으로 다음 줄에 맞춘 글을
   원래 문장으로 되돌린다. 끊긴 자리에서 띄어 쓸지 붙여 쓸지는 아래 규칙으로 정한다.
   ① 뒤쪽이 조사·어미 한 덩어리(에, 를, 으로, 다. 등)면 붙인다 — "자격 에" → "자격에", "맡는 다." → "맡는다."
   ② 앞쪽이 한 글자(흔한 낱말 제외)이고, 그 글자+뒷말 첫 글자가 다른 판·다른 줄에서 붙어 쓰인 적이 있으면 붙인다 — "미 만자로" → "미만자로"
   ③ "가. 회  장 -"처럼 줄 맞추려고 띄운 두 글자 직함은 붙인다 — "회장", "총무"
   그 밖에는 원래대로 한 칸 띄운다. */
const BL_PART = new Set(['에', '를', '을', '로', '으로', '과', '와', '는', '은', '다', '도', '에서', '에게', '까지', '부터']);
const BL_COMMON = new Set('본 각 및 등 시 후 중 그 전 구 정 수 타 또 더 잘 꼭 할 될 한 된 두 세 네 첫 매 현 약 즉 곧 단 총 회 서 부 새 안 내 외 저 줄 때 것 자 곳'.split(' '));
const blTokSet = corpus => { const set = new Set(); String(corpus || '').split(/\s+/).forEach(w => { const h = w.replace(/[^가-힣]/g, ''); for (let i = 0; i + 1 < h.length; i++) set.add(h.slice(i, i + 2)); }); return set; };
function blGlue(L, R, pairs) {
  R = String(R).trim().split(/\s+/)[0] || ''; L = String(L).trim().split(/\s+/).pop() || '';
  const l = (L.match(/[가-힣]+$/) || [''])[0], r0 = R.replace(/[.,)」』:;·\]]+$/, ''), r = (R.match(/^[가-힣]+/) || [''])[0];
  if (!l || !r) return ' ';
  if (BL_PART.has(r0)) return '';
  if (/으$/.test(l) && /^로/.test(r)) return '';
  if (L === l && l.length === 1 && !BL_COMMON.has(l) && !BL_PART.has(l) && !/^(의|가|이)$/.test(l) && pairs && pairs.has(l + r[0])) return '';
  return ' ';
}
function blJoinTitles(x) { return x.replace(/^(\s*[가-하]\s*[.)]\s*)([가-힣])\s+([가-힣])(\s*[-:：])/, '$1$2$3$4'); }
function unwrapHwpText(t, corpus = '') {
  const NEW = /^(제\s*\d+\s*(편|장|절|관|조)|[가-하]\s*[.)]\s*\S|\d+\s*항|[①-⑳]|\(\d+\)|（\d+）|\d+\s*[.)]\s*\S|[*※]|부\s*칙|[<〈《【\[「])/;
  const ends = x => /([.。!?」』)\]]|다|함|음|됨|임|요)$/.test(x);
  const BR = '\u0001'; const out = [];
  String(t).replace(/\r/g, '').split('\n').forEach(raw => {
    const x = raw.replace(/\s+$/, ''); const ind = /^\s{2,}/.test(x); const body = x.replace(/(\S)\s{4,}(?=\S)/g, '$1' + BR).trim();
    const prev = out[out.length - 1];
    const frag = body.length <= 3 && /^[가-힣]{1,2}[.)]?$/.test(body);
    if (prev && body && ((ind && !ends(prev.replace(/\u0001/g, ' ')) && (!NEW.test(body) || frag || /^제\s*\d+\s*(장|조)\s*\d*\s*(조|항)?\s*(에|의|를|을|및|과|와)/.test(body))) || (ind && /^\(/.test(body) && prev.trim()))) out[out.length - 1] = prev + BR + body;
    else out.push(body);
  });
  const pairs = blTokSet(corpus + '\n' + out.join('\n').replace(/\u0001/g, ' '));
  const joined = out.map(l => blJoinTitles(l.split(BR).reduce((a, b) => a + blGlue(a, b, pairs) + b)).replace(/(\S) {2,}/g, '$1 ')).join('\n');
  return tidyBylawSpaces(joined, corpus + '\n' + joined);
}
/* 이미 저장된 본문(줄 맞춤 띄어쓰기가 한 칸으로 남은 것)에 같은 규칙을 조심스럽게 적용 */
function tidyBylawSpaces(t, corpus = '') {
  const pairs = blTokSet(corpus);
  return String(t).split('\n').map(line => { const w = line.split(' '); let res = w[0];
    for (let i = 1; i < w.length; i++) { const L = res.split(' ').pop(); res += (L && w[i] ? blGlue(L, w[i], pairs) : ' ') + w[i]; }
    return blJoinTitles(res); }).join('\n');
}
/* @@UNWRAP-END */
/* 판 목록 순서: 개정일이 늦은 판이 위. 날짜가 같거나 없으면 차수 큰 판이 위. 날짜 없는 개정안은 맨 위 */
function bylawNo(x) { const m = String(x && x.revision || '').match(/(\d+)\s*차/); return m ? +m[1] : -1; }
function bylawOrder(a, b) {
  const da = a.date || (a.status === 'draft' ? '9999' : ''), db = b.date || (b.status === 'draft' ? '9999' : '');
  return da !== db ? (da < db ? 1 : -1) : bylawNo(b) - bylawNo(a);
}
/* 본문 끝의 "N차 수정 : YYYY년 M월 D일" 기록에서 이 판의 차수와 개정일을 찾는다. 기록이 없으면 파일 이름의 연도를 쓴다 */
function bylawGuess(text, fileName, kind) {
  // 한 줄에 여러 기록이 붙어 있어도("1 차 수정일 : 2013년 11월 23일 2 차 수정일 : …") 모두 찾는다. "**일", "??일"은 모르는 날
  let best = null; const re = /(\d+)\s*차\s*(?:수정|개정)\s*일?\s*[:：]?\s*(\d{4})\s*년\s*(\d{1,2}|[?*]+)?\s*월?\s*(\d{1,2}|[?*]+)?\s*일?/g; let m;
  while ((m = re.exec(String(text || '')))) { const no = +m[1]; if (best && best.no >= no) continue;
    const mo = /^\d+$/.test(m[3] || '') ? m[3].padStart(2, '0') : '', da = mo && /^\d+$/.test(m[4] || '') ? m[4].padStart(2, '0') : '';
    best = { no, rev: no + '차 수정', date: m[2] + (mo ? '-' + mo + (da ? '-' + da : '') : ''), from: 'text' }; }
  if (best) return best;
  const n = String(fileName || ''); const y = n.match(/(?:^|\D)(20\d\d|19\d\d)(?!\d)/) || n.match(/(?:^|\D)(\d\d)\s*년/);
  const c = n.match(/(\d+)\s*차/); const charter = kind === 'charter';
  // 헌장 말고는 파일 이름을 판 이름으로 쓰지 않는다 — 판 이름은 늘 "N차 수정"
  return { no: c ? +c[1] : -1, rev: c ? c[1] + '차 수정' : charter ? n.replace(/\.[^.]+$/, '') : '', date: y ? (y[1].length === 2 ? '20' + y[1] : y[1]) : '', from: y || c ? 'name' : '' };
}
/* 판 이름 맞추기: "24", "24차", "24 차 개정" → "24차 수정" (헌장은 그대로) */
function bylawRevName(v, kind) { v = String(v || '').trim(); if (kind === 'charter') return v; const m = v.match(/^(\d+)\s*(?:차)?\s*(?:수정|개정)?\s*(\(.*\))?$/); return m ? `${m[1]}차 수정${m[2] ? ' ' + m[2] : ''}` : v; }
function cleanBylawText(t) { return t.replace(/\r/g, '').split('\n').map(l => l.replace(/[\u0000-\u0008-]/g, '').replace(/\s+$/, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim(); }
function bylawUploadDialog(dd, b) {
  const kind = bylawKind(b); const DOC = RULE_DOCS[kind];
  openModal(`<h2>${esc(DOC.name)} 파일 올리기<button class="btn s" id="modal-close">닫기</button></h2>
    <p class="note">한글(.hwp, .hwpx), PDF, Word(.docx) 원본을 고르면 본문 글자를 읽어 옵니다. 구글 문서는 "파일 → 다운로드 → Microsoft Word(.docx)" 또는 PDF로 받은 뒤 올려 주세요. 파일은 이 컴퓨터의 브라우저 안에서만 읽고, 원본은 청년부 자료에 함께 보관합니다(큰 파일은 본문만).</p>
    <div class="stack" style="margin-top:8px"><input type="file" id="bu-file" accept=".hwp,.hwpx,.pdf,.docx,.odt,.txt,.doc">
      <div class="fields"><label class="f"><span>넣을 곳</span><select id="bu-to"><option value="this">지금 보고 있는 판: ${esc(b.revision || DOC.name)}</option><option value="new">새 판으로 추가</option></select></label>
      <label class="f"><span>새 판 이름(개정 차수)</span><input type="text" id="bu-rev" placeholder="예: 24차 수정"></label><label class="f"><span>개정일</span><input type="text" id="bu-date" value="${today()}" placeholder="예: 2025-12-28 (모르면 2013처럼 연도만)"></label>
      <label class="f"><span>새 판 상태</span><select id="bu-status"><option value="draft">개정안</option><option value="old">이전 판</option><option value="current">현행</option></select></label></div>
      <div id="bu-msg" class="note"></div><div id="bu-guess" class="note" style="color:var(--ink)"></div><textarea id="bu-text" style="width:100%;min-height:300px;font-size:13.5px;line-height:1.7" placeholder="파일을 고르면 여기에 본문이 나옵니다. 저장 전에 고칠 수 있습니다."></textarea>
      <div class="row"><button class="btn p" id="bu-save" disabled>저장</button><span class="note">"제1조", "제1장"으로 시작하는 줄은 자동으로 제목이 됩니다.</span></div></div>`);
  let file = null, buf = null, sameId = null;
  $('#bu-to').onchange = e => { const nw = e.target.value === 'new'; ['bu-rev', 'bu-date', 'bu-status'].forEach(id => { $('#' + id).disabled = !nw; }); };
  $('#bu-to').onchange({ target: $('#bu-to') });
  $('#bu-file').onchange = async e => {
    file = e.target.files[0]; if (!file) return; const msg = $('#bu-msg'); msg.textContent = '읽는 중…'; $('#bu-save').disabled = true;
    try {
      buf = await file.arrayBuffer();
      const raw0 = await fileToRuleText(file, buf); const ext = (file.name.split('.').pop() || '').toLowerCase();
      const raw = /^(hwp|hwpx|docx|odt|txt)$/.test(ext) ? unwrapHwpText(raw0, (S.data.young && S.data.young.bylaws || []).map(x => x.text || '').join('\n')) : raw0;
      const txt = cleanBylawText(raw); $('#bu-text').value = txt;
      const arts = (txt.match(/^제\s*\d+\s*조/gm) || []).length;
      msg.textContent = `${file.name} — ${txt.length.toLocaleString()}자, 조문 ${arts}개를 찾았습니다.${arts ? '' : ' 조문 제목을 찾지 못했으니 내용을 확인해 주세요.'}`;
      /* 차수·개정일을 본문 끝 기록(또는 파일 이름)에서 찾아 채우고, 넣을 곳·상태도 맞춘다 */
      const g = bylawGuess(txt, file.name, kind); const all = bylawsOf(dd, kind); const cur = currentOf(dd, kind);
      const nb = s => String(s || '').replace(/\s+/g, '');
      const same = all.find(x => x.text && nb(x.text) === nb(txt));
      const sameNo = g.no > 0 ? all.find(x => bylawNo(x) === g.no) : null;
      sameId = same ? same.id : null; const hit = same || sameNo; const to = $('#bu-to');
      [...to.options].filter(o => o.value.startsWith('id:')).forEach(o => o.remove());
      if (hit && hit.id !== b.id) to.add(new Option(`이미 있는 판에 넣기: ${hit.revision}${hit.date ? ' (' + hit.date + ')' : ''}`, 'id:' + hit.id));
      to.value = hit ? (hit.id === b.id ? 'this' : 'id:' + hit.id) : 'new'; to.onchange({ target: to });
      $('#bu-rev').value = g.rev || ''; if (g.date) $('#bu-date').value = g.date;
      const st = !cur || !g.date ? 'draft' : g.date < (cur.date || '') || (g.no > 0 && g.no < bylawNo(cur)) ? 'old' : g.date === cur.date || g.no === bylawNo(cur) ? 'current' : 'draft';
      $('#bu-status').value = st === 'current' && hit ? 'old' : st;
      $('#bu-guess').innerHTML = (g.from === 'text' ? `본문 끝의 개정 기록에서 <b>${esc(g.rev)} · ${esc(g.date)}</b>을(를) 찾았습니다.` : g.from === 'name' ? `개정 기록이 없어 파일 이름에서 <b>${esc([g.rev, g.date].filter(Boolean).join(' · '))}</b>을(를) 짐작했습니다.${kind !== 'charter' && !g.rev ? ' 차수는 직접 적어 주세요 (예: 24차 수정).' : ' 맞는지 확인해 주세요.'}` : kind === 'charter' ? '개정일을 찾지 못했습니다. 직접 적어 주세요.' : '차수와 개정일을 찾지 못했습니다. 판 이름에 "24차 수정"처럼 차수를 적어 주세요.')
        + (same ? ` 본문이 이미 있는 <b>${esc(same.revision)}</b>과 글자까지 같아, 새 판을 만들지 않고 그 판에 원본 파일을 붙이도록 골라 두었습니다.` : sameNo ? ` 이미 <b>${esc(sameNo.revision)}</b>이 있어 그 판의 본문을 바꾸도록 골라 두었습니다. 새 판으로 두려면 "넣을 곳"을 바꾸세요.` : to.value === 'new' ? ` 새 판으로 추가하고 상태는 <b>${{ old: '이전 판', draft: '개정안', current: '현행' }[$('#bu-status').value]}</b>으로 골라 두었습니다.` : '');
      $('#bu-save').disabled = !txt;
    } catch (err) { msg.textContent = '읽지 못했습니다: ' + err.message; }
  };
  $('#bu-save').onclick = async () => {
    const text = $('#bu-text').value; if (!text.trim()) return;
    let target = b; const toV = $('#bu-to').value;
    if (toV.startsWith('id:')) target = dd.bylaws.find(x => x.id === toV.slice(3)) || b;
    const dv = $('#bu-date').value.trim(); if (toV === 'new' && dv && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(dv)) { toast('개정일은 2025-12-28 또는 2013처럼 적어 주세요'); return; }
    const rv = bylawRevName($('#bu-rev').value, kind); if (toV === 'new' && kind !== 'charter' && !/^\d+차 수정/.test(rv)) { toast('판 이름은 "24차 수정"처럼 차수로 적어 주세요'); return; }
    if (toV === 'new') {
      const st = $('#bu-status').value; const cur = currentOf(dd, kind) || { title: DOC.name };
      target = { id: (kind === 'charter' ? 'charter_' : 'rev_') + uid(), ...(kind === 'young' ? {} : { kind }), title: cur.title, revision: rv || file.name, date: dv, status: st, text: '', params: { ...(cur.params || RULE_2025) }, summary: [], notes: '' };
      if (st === 'current') { for (const x of bylawsOf(dd, kind)) if (x.status === 'current' && !x.unsaved) { x.status = 'old'; await saveBylaw(dd, x); } }
      if (st === 'current') bylawsOf(dd, kind).filter(x => x.unsaved && !x.text).forEach(x => dd.bylaws.splice(dd.bylaws.indexOf(x), 1));
      dd.bylaws.push(target);
    }
    if (target.id !== sameId) target.text = text; delete target.gap; if (!target.revision && file && kind === 'charter') target.revision = file.name.replace(/\.[^.]+$/, '');
    let stored = false;
    if (file && buf && buf.byteLength < 650 * 1024) { const u8 = new Uint8Array(buf); let bin = ''; for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); await backend.set(`depts/young/bylawFiles/${target.id}`, { name: file.name, type: file.type || '', size: file.size, data: btoa(bin), at: today() }); stored = true; }
    if (file) target.file = { name: file.name, size: file.size, at: today(), stored };
    await saveBylaw(dd, target); closeModal(); S.sub = { bylaw: target.id }; render(); toast(`${DOC.name} 본문을 넣었습니다`);
  };
}
BIND.bylaws = () => {
  const dd = S.data.young; const kind = (dd.bylaws.find(x => x.id === S.sub.bylaw) ? bylawKind(dd.bylaws.find(x => x.id === S.sub.bylaw)) : (S.sub.rdoc || 'young')); const b = dd.bylaws.find(x => x.id === S.sub.bylaw) || currentOf(dd, kind);
  const prc = document.querySelector('details.principle'); if (prc) prc.ontoggle = () => { S.principleClosed = !prc.open; };
  document.querySelectorAll('[data-bltoc]').forEach(a => a.onclick = e => { e.preventDefault(); const h = document.getElementById(a.dataset.bltoc); if (h) h.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  document.querySelectorAll('[data-rdoc]').forEach(x => x.onclick = () => { S.sub = { rdoc: x.dataset.rdoc }; renderHere(); });
  document.querySelectorAll('[data-bylaw]').forEach(x => x.onclick = () => { S.sub = { bylaw: x.dataset.bylaw, nodiff: S.sub.nodiff }; renderHere(); });
  const dt = $('#bl-difft'); if (dt) dt.onclick = () => { S.sub.nodiff = !S.sub.nodiff; renderHere(); };
  const pr = $('#bl-print'); if (pr) pr.onclick = () => { S.sub.print = true; render(); };
  const up = $('#bl-upload'); if (up) up.onclick = () => bylawUploadDialog(dd, b);
  const dn = $('#bl-down'); if (dn) dn.onclick = async () => { const f = await backend.get(`depts/young/bylawFiles/${b.id}`); if (!f || !f.data) { toast('원본 파일을 찾지 못했습니다'); return; } const bin = atob(f.data); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([u8], { type: f.type || 'application/octet-stream' })); a.download = f.name || 'bylaw'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); };
  const bk = $('#bl-back'); if (bk) { bk.onclick = () => { delete S.sub.print; render(); }; $('#bl-pr').onclick = doPrint; return; }
  const dl = $('#bl-del'); if (dl) dl.onclick = () => {
    const DOCN = RULE_DOCS[kind].name; const same = bylawsOf(dd, kind); const isCur = b.status === 'current' && kind === 'young';
    openModal(`<h2>${esc(DOCN)} 판 삭제<button class="btn s" id="modal-close">닫기</button></h2><p>"${esc(b.revision || DOCN)}"${b.date ? ' (' + esc(b.date) + ')' : ''}을(를) 지울까요? 본문과 올린 원본 파일이 함께 지워지고 되돌릴 수 없습니다.</p>${isCur ? `<div class="hint">지금 <b>현행</b> 회칙입니다. 지우면 총회 자료의 자동 판정은 남은 판${same.length > 1 ? ' 중 하나' : '이 없어 기본 기준값'}을 따릅니다. 새 현행을 먼저 지정하는 것이 좋습니다.</div>` : ''}<div class="row" style="margin-top:10px"><button class="btn d" id="bd-yes">삭제</button><button class="btn" id="bd-no">취소</button></div>`);
    $('#bd-no').onclick = closeModal;
    $('#bd-yes').onclick = async () => { $('#bd-yes').disabled = true;
      if (!b.unsaved) { await backend.del(`depts/young/bylaws/${b.id}`); if (b.file) await backend.del(`depts/young/bylawFiles/${b.id}`).catch(() => {}); }
      dd.bylaws.splice(dd.bylaws.indexOf(b), 1);
      if (kind === 'young' && !bylawsOf(dd, 'young').length) dd.bylaws.push(...BYLAW_SEED.map(x => ({ ...x, unsaved: true })));
      if (kind === 'charter' && !bylawsOf(dd, 'charter').length) dd.bylaws.push({ id: 'charter', kind: 'charter', title: '한국성서선교회 헌장', revision: '', date: '', status: 'current', text: '', summary: [], notes: '', unsaved: true });
      closeModal(); S.sub = { rdoc: kind }; render(); toast('삭제했습니다'); };
  };
  const ed = $('#bl-edit'); if (ed) ed.onclick = () => { S.sub.editText = true; S.sub.bylaw = b.id; render(); };
  const cc = $('#bt-cancel'); if (cc) { cc.onclick = () => { delete S.sub.editText; render(); }; $('#bt-save').onclick = async () => { Object.assign(b, { title: $('#bt-title').value.trim(), revision: bylawRevName($('#bt-rev').value, kind), date: $('#bt-date').value, text: $('#bt-text').value }); if (b.text.trim()) delete b.gap; await saveBylaw(dd, b); delete S.sub.editText; render(); toast(`${RULE_DOCS[kind].name}을(를) 저장했습니다`); }; return; }
  const cu = $('#bl-current'); if (cu) cu.onclick = () => { openModal(`<h2>현행 ${esc(RULE_DOCS[kind].name)} 지정<button class="btn s" id="modal-close">닫기</button></h2><p>"${esc(b.revision)}"을 현행으로 지정할까요? 지금 현행인 판은 "이전 판"이 됩니다.${kind === 'young' ? ' 총회 자료의 자동 판정은 이 판의 기준값을 따릅니다. 보통 총회에서 개정안이 통과된 뒤에 누릅니다.' : ''}</p><div class="row"><button class="btn p" id="cu-yes">지정</button><button class="btn" id="cu-no">취소</button></div>`); $('#cu-no').onclick = closeModal; $('#cu-yes').onclick = async () => { for (const x of bylawsOf(dd, kind)) { if (x.status === 'current' && x !== b && !x.unsaved) { x.status = 'old'; await saveBylaw(dd, x); } } b.status = 'current'; await saveBylaw(dd, b); closeModal(); render(); toast('현행으로 지정했습니다'); }; };
  const bi = $('#bl-import'); if (bi) bi.onclick = () => importYoungBylaws(dd);
  const ad = $('#bl-add'); if (ad) ad.onclick = async () => { const cur = currentOf(dd, kind); const n = { id: (kind === 'charter' ? 'charter_' : 'rev_') + uid(), ...(kind === 'young' ? { params: { ...(cur.params || RULE_2025) } } : { kind }), title: cur.title.replace(/ 개정안$/, '') + ' 개정안', revision: `${YEAR + 1} 개정안`, date: today(), status: 'draft', text: cur.text, summary: [], notes: '' }; await saveBylaw(dd, n); dd.bylaws.push(n); S.sub = { bylaw: n.id, editText: true }; render(); };
  const rs = $('#rp-save'); if (rs) rs.onclick = async () => { const R = { ...(b.params || RULE_2025) }; document.querySelectorAll('[data-rp]').forEach(i => { const k = i.dataset.rp; R[k] = /Baptized/.test(k) ? i.value === '1' : +i.value || 0; }); b.params = R; await saveBylaw(dd, b); render(); toast('기준값을 저장했습니다'); };
};

/* 총회 자료 */
function memberInfoForm(s) {
  return `<div class="fields"><label class="f"><span>청년부 첫 출석일</span><input type="date" id="mi-join" value="${esc(s.joinDate || '')}"></label><label class="f"><span>본 교회 첫 출석일</span><input type="date" id="mi-cjoin" value="${esc(s.churchJoin || '')}"></label><label class="f"><span>새가족반 수료일</span><input type="date" id="mi-new" value="${esc(s.newcomerDone || '')}"></label><label class="f"><span>생년월일</span><input type="date" id="mi-birth" value="${esc(s.birth || '')}"></label><label class="f"><span>청년부에 들어온 길</span><select id="mi-origin">${[['', '자동 판단'], ['school', '주일학교 출신 (만 19세 되는 해 1월)'], ['evang', '전도 (청년부 등록일)']].map(([k, l]) => `<option value="${esc(k)}" ${(s.origin || '') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="f"><span>신급</span><select id="mi-faith">${faithOptions(s)}</select></label><label class="f"><span>결혼</span><select id="mi-married"><option value="">미혼</option><option value="1" ${s.married ? 'selected' : ''}>기혼</option></select></label>
    <label class="f"><span>교회 직분</span><select id="mi-role">${churchRoleOptions(s.churchRole || '')}</select></label><label class="f"><span>타 부서 직책</span><input type="text" id="mi-other" value="${esc(s.otherRole || '')}" placeholder="교사, 찬양팀 임원 등"></label>
    <label class="f"><span>타 목장·전도회 소속</span><select id="mi-cell"><option value="">아니오</option><option value="1" ${s.otherCell ? 'selected' : ''}>예</option></select></label><label class="f"><span>제명 이력</span><input type="text" id="mi-exp" value="${esc(s.expelled || '')}" placeholder="예: 2022 제명"></label></div>`;
}
function readMemberInfo(s) { if ($('#mi-origin')) s.origin = $('#mi-origin').value; Object.assign(s, { joinDate: $('#mi-join').value, churchJoin: $('#mi-cjoin').value, newcomerDone: $('#mi-new').value, birth: $('#mi-birth').value, faith: $('#mi-faith').value, married: !!$('#mi-married').value, churchRole: $('#mi-role').value, otherRole: $('#mi-other').value.trim(), otherCell: !!$('#mi-cell').value, expelled: $('#mi-exp').value.trim() }); }
// 임원 자격 한 줄 요약: 될 수 있는 자리, 안 되면 첫 사유
function officerSum(j) {
  const P = [['pres', '회장'], ['vp', '부회장'], ['appt', '임명직']]; const ok = P.filter(([k]) => j[k] === 'ok').map(x => x[1]); const ck = P.filter(([k]) => j[k] === 'check').map(x => x[1]);
  if (j.minister) return { ok: '해당 없음', why: '교역자 — 피선거권 없음 (회칙 5조 2항)', cls: 'mute' };
  if (j.fam && !ok.length && !ck.length) return { ok: '불가', why: '팸장 — 청년부 회원이 아님', cls: 'mute' };
  const why = (P.map(([k]) => (j.rsn && j.rsn[k] || [])[0]).find(Boolean) || '').replace(/\s+/g, ' ');
  return { ok: ok.length ? ok.join('·') + ' 가능' : ck.length ? ck.join('·') + ' 확인 필요' : '불가', why: ok.length === 3 ? '' : why, cls: ok.length ? 'ok' : ck.length ? 'warn' : 'mute' };
}
/* 회칙 본문에서 조항 몇 개만 뽑기 — 총회 자료의 판정 기준 표시용 */
function bylawArticles(text, nums) {
  const lines = String(text || '').split(/\r?\n/); const out = []; let cur = null;
  const artNo = l => { const m = l.match(/^\s*제\s*(\d+)\s*조/); return m ? +m[1] : null; };
  lines.forEach(l => { const n = artNo(l); if (n != null) { cur = nums.includes(n) ? { n, lines: [l.trim()] } : null; if (cur) out.push(cur); return; } if (/^\s*제\s*\d+\s*장/.test(l)) { cur = null; return; } if (cur && l.trim()) cur.lines.push(l.trim()); });
  return nums.map(n => out.find(x => x.n === n)).filter(Boolean);
}
function bylawArtHTML(dd, nums, title) {
  const b = currentBylaw(dd) || {}; const arts = bylawArticles(b.text, nums); if (!arts.length) return '';
  return `<div class="bl-basis"><div class="bl-basis-h">${esc(title)} <span>— 청년부 회칙 ${esc(b.revision || '')}</span></div>${arts.map(a => `<div class="bl-art">${a.lines.map((l, i) => `<div${i ? '' : ' class="h"'}>${esc(l.replace(/\s{2,}/g, ' '))}</div>`).join('')}</div>`).join('')}</div>`;
}
function assemblyPaper(dd, a, J) {
  const voters = J.list.filter(j => j.voter === 'ok');
  return `<section class="paper"><div class="hd"><div><h1>${esc(a.title)} 자료</h1><div class="sub">중앙성서교회 청년부 · 회칙 ${esc((currentBylaw(dd) || {}).revision || '')} 기준</div></div><div class="meta">${fmtK(a.date)}${a.place ? ' · ' + esc(a.place) : ''}</div></div>
    <h2>1. 정족수 (회칙 13조)</h2><table class="kv"><tbody><tr><th>직전 ${J.q.rows.length}주 출석</th><td>${J.q.rows.map(r => `${r.date.slice(5).replace('-', '/')} ${r.p}명`).join(' · ')}</td></tr><tr><th>평균</th><td>${J.q.avg.toFixed(1)}명</td></tr><tr><th>정족수</th><td><b>${J.q.need}명</b> (평균의 ${J.R.quorumNum}/${J.R.quorumDen})</td></tr></tbody></table>
    ${bylawArtHTML(dd, [13], '정족수 기준 조항')}
    <h2>현 임원 구성</h2><table class="kv"><tbody>${(() => { const g = staffByKind(dd); return ['임원', '팀장', '팸장'].map(k => `<tr><th>${k}</th><td>${g[k].map(x => `${esc(x.role)} ${esc(x.name)}`).join(', ') || '—'}</td></tr>`).join(''); })()}</tbody></table>
    <h2>2. 결의권 판정표 (회칙 5조)</h2><h3>결의권자 (${voters.length}명${voters.some(j => j.fam && !j.minister) ? ` · 그중 팸장 ${voters.filter(j => j.fam && !j.minister).length}명` : ''}${voters.some(j => j.minister) ? ` · 교역자 ${voters.filter(j => j.minister).length}명` : ''})</h3><table class="tight"><thead><tr><th class="n">번호</th><th>이름</th><th>구분</th><th class="n">1년 출석률</th><th>임원 자격</th><th>사유</th></tr></thead><tbody>${voters.map((j, i) => { const o = officerSum(j); return `<tr><td class="n">${i + 1}</td><td>${esc(j.s.name)}</td><td>${j.minister ? '교역자' : j.fam ? '팸장' : '회원'}</td><td class="n">${j.rate != null ? j.rate + '%' : '—'}</td><td>${o.ok}</td><td style="font-size:11px">${esc(o.why)}</td></tr>`; }).join('')}</tbody></table>
    ${(() => { const vr = j => ((j.rsn && j.rsn.voter) || j.why || []).map(x => String(x).replace(/\s+/g, ' ')).filter(Boolean).join(' · ');
      const ck = J.list.filter(j => j.voter === 'check'), no = J.list.filter(j => j.voter === 'no'), ex = J.excluded || [];
      const head = `<thead><tr><th class="n" style="width:6%">번호</th><th style="width:10%;white-space:nowrap">이름</th><th style="width:10%;white-space:nowrap">구분</th><th class="n" style="width:11%;white-space:nowrap">1년 출석률</th><th>사유</th></tr></thead>`;
      const sp = j => speakOf(dd, j, a.date); const nsp = arr => arr.filter(sp).length;
      const row = (j, i) => `<tr><td class="n">${i + 1}</td><td>${esc(j.s.name)}</td><td>${j.minister ? '교역자' : j.fam ? '팸장' : sp(j) ? '<b>발언권자</b>' : '회원'}</td><td class="n">${j.rate != null ? j.rate + '%' : ''}</td><td style="font-size:11px">${esc(vr(j))}</td></tr>`;
      const exSp = ex.filter(x => x.speak !== undefined ? x.speak : AWAY.includes(x.s.status) && speakOf(dd, { s: x.s, voter: 'no' }, a.date));
      return `<p class="note" style="margin:6px 0 0">발언권자: 결의권은 없지만 교회 등록 ${SPEAK_MONTHS}개월이 지나 총회에서 발언할 수 있는 사람</p><h3>확인 필요 (${ck.length}명${nsp(ck) ? ` · 그중 발언권자 ${nsp(ck)}명` : ''})</h3><table class="tight">${head}<tbody>${ck.map(row).join('') || '<tr><td colspan="5">없음</td></tr>'}</tbody></table>
      <h3>해당 아님 (${no.length + ex.length}명${nsp(no) + exSp.length ? ` · 그중 발언권자 ${nsp(no) + exSp.length}명` : ''})</h3><table class="tight">${head}<tbody>${no.map(row).join('')}${ex.map((x, i) => `<tr><td class="n">${no.length + i + 1}</td><td>${esc(x.s.name)}</td><td>${exSp.includes(x) ? '<b>발언권자</b>' : AWAY.includes(x.s.status) ? '회원' : '회원 아님'}</td><td class="n"></td><td style="font-size:11px">${esc(x.why)}${AWAY.includes(x.s.status) ? ' — 회원 자격 일시 정지' : ''}</td></tr>`).join('') || (no.length ? '' : '<tr><td colspan="5">없음</td></tr>')}</tbody></table>`; })()}
    ${bylawArtHTML(dd, [4, 5, 6, 11], '판정 기준 조항 (회원 자격 4조 · 결의권 5조 · 결석과 제명 6조 · 임원 자격 11조)')}
    <h2>3. 후보자 명단 (회칙 11조)</h2><table><thead><tr><th>직위</th><th>후보</th><th>비고</th></tr></thead><tbody>${[...ASSEMBLY_POS, ...ASSEMBLY_POS_SUB].map(p => { const c = (a.candidates || []).filter(x => x.pos === p); return c.length ? c.map((x, i) => `<tr>${i ? '' : `<th rowspan="${c.length}">${p}</th>`}<td>${esc(x.name)}</td><td>${esc(x.note || '')}</td></tr>`).join('') : ''; }).join('') || '<tr><td colspan="3">후보 미정</td></tr>'}</tbody></table>
    <div class="ft"><b>중앙성서교회 청년부</b><span>CBCS에서 생성 · ${esc(a.date)}-총회자료.pdf</span></div></section>`;
}
function assemblySignPaper(dd, a, J) {
  const voters = J.list.filter(j => j.voter === 'ok');
  return `<section class="paper"><div class="hd"><div><h1>${esc(a.title)} 출석 확인표</h1><div class="sub">중앙성서교회 청년부 · 결의권자 ${voters.length}명 · 정족수 ${J.q.need}명</div></div><div class="meta">${fmtK(a.date)}${a.place ? ' · ' + esc(a.place) : ''}</div></div>
    <table class="tight"><thead><tr><th class="n" style="width:8%">번호</th><th style="width:22%">이름</th><th style="width:14%">구분</th><th>출석 서명</th></tr></thead><tbody>${voters.map((j, i) => `<tr><td class="n">${i + 1}</td><td>${esc(j.s.name)}</td><td>${j.minister ? '교역자' : j.fam ? '팸장' : '회원'}</td><td class="sign" style="height:30px"></td></tr>`).join('')}</tbody></table>
    <table style="margin-top:16px"><tbody><tr><th style="width:25%">참석 인원</th><td style="width:25%">명</td><th style="width:25%">성원 여부 (${J.q.need}명 이상)</th><td>성원 / 미달</td></tr></tbody></table>
    <div class="ft"><b>중앙성서교회 청년부</b><span>CBCS에서 생성 · ${esc(a.date)}-총회-출석확인표.pdf</span></div></section>`;
}
/* 총회 자료 내보내기 — 엑셀(시트 5개)·PDF 파일로 바로 받기 */
function saveBlob(blob, name) { const url = URL.createObjectURL(blob); const el = document.createElement('a'); el.href = url; el.download = name; document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); }
/* PDF는 브라우저 인쇄로 만든다 — 글자가 그대로 살아 있어(검색·복사·OCR 불필요) 쪽 나눔도 줄 단위로 깔끔하다.
   예전 html2pdf 방식은 화면을 그림으로 찍어 붙여서 글자가 없고, 가장자리·쪽 경계가 잘렸다. */
function printAsPDF(fileName) {
  const old = document.title; document.title = String(fileName || old).replace(/\.pdf$/i, '');
  const back = () => { document.title = old; window.removeEventListener('afterprint', back); }; window.addEventListener('afterprint', back);
  toast('인쇄 창에서 대상(프린터)을 "PDF로 저장"으로 고르면 PDF 파일이 됩니다');
  S.printing = true; setTimeout(() => { window.print(); setTimeout(() => { S.printing = false; }, 1500); }, 250); // 휴대폰 브라우저는 인쇄 전후 알림을 안 주기도 해서 직접 표시
}
async function exportAssemblyXLSX(dd, a, J) {
  const X = await loadLib('xlsx', 'XLSX');
  const pill = k => (JP[k] || ['', ''])[1]; const fam = s => (classOf(dd, s) || {}).name || '';
  const bl = currentBylaw(dd) || {}; const g = staffByKind(dd); const cnt = k => J.list.filter(j => j.voter === k).length;
  const voters = J.list.filter(j => j.voter === 'ok');
  const sheet = (rows, widths) => { const ws = X.utils.aoa_to_sheet(rows); ws['!cols'] = widths.map(w => ({ wch: w })); return ws; };
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, sheet([
    [`${a.title} 자료`], ['중앙성서교회 청년부'], [],
    ['총회 날짜', a.date], ['구분', a.kind || ''], ['장소', a.place || ''], ['판정 기준 회칙', bl.revision || ''], [],
    ['정족수 (회칙 13조)'], ...J.q.rows.map(r => ['  ' + r.date, r.p]), ['직전 평균 출석', +J.q.avg.toFixed(1)], ['정족수', J.q.need, `평균의 ${J.R.quorumNum}/${J.R.quorumDen}`], [],
    ['결의권자 (회칙 5조)', cnt('ok')], ['확인 필요', cnt('check')], ['해당 아님', cnt('no')], ['발언권자 (결의권 없음 · 교회 등록 6개월 이상)', J.list.filter(j => speakOf(dd, j, a.date)).length + (J.excluded || []).filter(x => x.speak).length], [],
    ['현 임원 구성'], ...['임원', '팀장', '팸장'].map(k => [k, g[k].map(x => `${x.role} ${x.name}`).join(', ')]), [],
    ['만든 날', today(), 'CBCS에서 생성']], [18, 14, 60]), '요약');
  const kindOf = j => j.minister ? '교역자' : j.fam ? '팸장' : speakOf(dd, j, a.date) ? '발언권자' : '회원';
  X.utils.book_append_sheet(wb, sheet([['번호', '이름', '구분', '나이', '1년 출석', '출석 체크 주일', '출석률(%)', '임원 자격', '사유'],
    ...voters.map((j, i) => { const o = officerSum(j); return [i + 1, j.s.name, kindOf(j), j.age ?? '', j.cnt ?? '', j.of ?? '', j.rate ?? '', o.ok, o.why]; })], [6, 10, 8, 6, 9, 13, 10, 22, 40]), '결의권자 명단');
  X.utils.book_append_sheet(wb, sheet([['번호', '이름', '구분', '출석 서명'],
    ...voters.map((j, i) => [i + 1, j.s.name, kindOf(j), ''])], [6, 12, 8, 24]), '출석 확인표');
  X.utils.book_append_sheet(wb, sheet([['No.', '직위', '이름', '자격 판정', '비고'],
    ...[...ASSEMBLY_POS, ...ASSEMBLY_POS_SUB].flatMap(pos => (a.candidates || []).filter(c => c.pos === pos).map(c => { const j = J.list.find(x => x.s.id === c.sid); const k = pos === '회장' ? 'pres' : pos === '부회장' ? 'vp' : 'appt'; return [pos, c.name, j ? pill(j[k]) : '', c.note || '']; })).map((r, i) => [i + 1, ...r])], [5, 10, 10, 10, 40]), '후보자 명단');
  X.utils.book_append_sheet(wb, sheet([['No.', '이름', '구분', '나이', '신급', '청년부 출석 시작', '추정', '1년 출석', '출석 체크 주일', '출석률(%)', '선거권', '회장', '부회장', '임명직', '이력', '판정 사유', '직접 지정'],
    ...J.list.map((j, i) => { const o = (a.overrides || {})[j.s.id]; return [i + 1, j.s.name, kindOf(j), j.age ?? '', j.s.faith || '', j.ys ? j.ys.date : '', j.ys && j.ys.est ? '추정' : '', j.cnt ?? '', j.of ?? '', j.rate ?? '', pill(j.voter), pill(j.pres), pill(j.vp), pill(j.appt), (j.histList || []).join(', '), (j.why || []).filter(w => !/^임원 이력/.test(w)).join(', '), o ? [o.voter === 'ok' ? '결의권자로 넣음' : o.voter === 'no' ? '결의권자에서 뺌' : '', o.note || ''].filter(Boolean).join(' · ') : '']; })],
    [5, 10, 8, 6, 8, 14, 6, 9, 13, 10, 8, 8, 8, 8, 40, 40, 24]), '판정표');
  const yrFrom = addMonths(a.date, -12); const reps = namedReports(dd).filter(r => r.date < a.date && r.date >= yrFrom);
  const mark = v => v === 'P' ? '●' : v === 'O' ? '◐' : v ? '○' : '';
  X.utils.book_append_sheet(wb, sheet([['No.', '이름', '구분', ...reps.map(r => r.date.slice(5).replace('-', '/')), '출석'],
    ...J.list.map((j, i) => { const ms = reps.map(r => mark(attEvidence(r, j.s).v)); return [i + 1, j.s.name, kindOf(j), ...ms, ms.filter(Boolean).length]; }),
    [], ['● 출석  ◐ 온라인  ○ 이름만·교사 명단  (빈칸) 기록 없음']], [5, 10, 8, ...reps.map(() => 5.5), 6]), '직전 1년 주별 출석');
  saveBlob(new Blob([X.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${a.date}-청년부-총회자료.xlsx`);
}
function bindAssemblyExport(dd, a) {
  const run = async (btn, job) => { const t = btn.textContent; btn.disabled = true; btn.textContent = '만드는 중…'; try { await job(); toast('파일을 받았습니다'); } catch (e) { toast(e.message || '내보내기에 실패했습니다'); } finally { btn.disabled = false; btn.textContent = t; } };
  document.querySelectorAll('[data-asx]').forEach(b => b.onclick = () => run(b, () => exportAssemblyXLSX(dd, a, a.snapshot ? { ...clone(a.snapshot), snap: true } : assemblyJudge(dd, a))));
  document.querySelectorAll('[data-asp]').forEach(b => b.onclick = () => { if (S.sub.print !== true) { S.sub = { ...S.sub, print: true }; render(); } printAsPDF(`${a.date}-청년부-총회자료.pdf`); });
}
const asmExportBtns = () => '<button class="btn" data-asx>엑셀로 받기</button><button class="btn" data-asp>PDF로 받기</button>';
VIEWS.assembly = async () => {
  const dd = await loadYoung(); const { a, list } = pickAssembly(dd); const J = assemblyJudge(dd, a); const edit = canYoung();
  if (S.sub.print === 'sign') return `<div class="topbar no-print"><div><h1>총회 출석 확인표</h1><div class="sub">결의권자 명단과 서명란 — 총회 당일 출결 확인용</div></div><div class="row"><button class="btn" id="as-back">돌아가기</button><button class="btn p" id="as-pr">인쇄 / PDF로 저장</button></div></div>${assemblySignPaper(dd, a, J)}`;
  if (S.sub.print) return `<div class="topbar no-print"><div><h1>총회 자료 출력</h1></div><div class="row"><button class="btn" id="as-back">돌아가기</button><button class="btn" data-asx>엑셀로 받기</button><button class="btn p" id="as-pr">인쇄 / PDF로 저장</button></div></div>${assemblyPaper(dd, a, J)}`;
  const cnt = k => J.list.filter(j => j.voter === k).length;
  const filter = S.sub.vf || 'ok';
  const rows = J.list.filter(j => filter === 'all' || (filter === 'border' ? (j.rate !== null && j.rate >= 55 && j.rate <= 65) : j.voter === filter));
  const yrFrom = addMonths(a.date, -12); const yrReps = yearSundays(dd, a.date);
  const stripHead = (() => { let last = ''; return yrReps.map(r => { const m = r.date.slice(0, 7); const first = m !== last; last = m; const mo = +r.date.slice(5, 7); return `<span class="yw ${first ? 'ym' : ''}" title="${r.date}">${first && [1, 4, 7, 10].includes(mo) ? (mo === 1 ? "'" + r.date.slice(2, 4) + '.1' : mo + '월') : ''}</span>`; }).join(''); })();
  const strip = j => yrReps.map(r => { const e = attEvidence(r, j.s); const v = e.v; return `<span class="yw ${v === 'P' ? 'p' : v === 'O' ? 'o' : v ? 't' : r.missing ? 'm' : 'x'}" title="${r.date}${v ? ' ' + e.src : r.missing ? ' 보고서 없음(결석으로 셈)' : ' 결석'}"></span>`; }).join('');
  const unBapt = dd.students.filter(s => s.status !== 'left' && !isBaptized(s));
  const col = (k, label) => { const ok = J.list.filter(j => j[k] === 'ok'), ck = J.list.filter(j => j[k] === 'check'); return `<div class="cand-col"><h3>${label} <span class="note">${ok.length}명${ck.length ? ` · 확인 ${ck.length}` : ''}</span></h3><div class="row" style="gap:4px">${ok.map(j => `<button class="chip" data-mi="${esc(j.s.id)}">${esc(j.s.name)}</button>`).join('') || '<span class="note">없음</span>'}</div>${ck.length ? `<div class="note" style="margin-top:6px">확인 필요: ${ck.map(j => `<a href="#" data-mi="${esc(j.s.id)}">${esc(j.s.name)}</a>`).join(', ')}</div>` : ''}</div>`; };
  const R = J.R;
  return `<div class="topbar"><div><h1>총회 자료</h1><div class="sub">${esc(a.title)} · ${fmtK(a.date)} · 회칙 ${esc((currentBylaw(dd) || {}).revision || '')} 기준 자동 판정${a.unsaved ? ' · <b>아직 저장 안 됨</b>' : ''}</div></div>
    <div class="row">${asmPicker(list, a)}${canEdit() && edit && !a.unsaved ? (a.snapshot ? `<button class="btn" id="as-live">${S.sub.asLive ? '확정 판정 보기' : '지금 기준으로 다시 보기'}</button><button class="btn d" id="as-unlock">확정 풀기</button>` : `<button class="btn p" id="as-lock">판정 확정</button>`) : ''}${canEdit() ? `<button class="btn" id="as-print">총회 자료 출력</button><button class="btn" id="as-sign">출석 확인표 출력</button>${a.unsaved ? '' : asmExportBtns()}` : ''}</div></div>
  <div class="stack">
    ${a.snapshot ? `<div class="hint ${S.sub.asLive ? '' : 'info'}">${S.sub.asLive ? `<b>지금 기준으로 다시 계산한 판정</b>을 보고 있습니다. 출력·엑셀은 여전히 ${esc(a.snapshot.at)} 확정 판정으로 나옵니다.` : `<b>${esc(a.snapshot.at)}에 판정을 확정했습니다</b> (회칙 ${esc(a.snapshot.bylaw)} 기준). 이 총회의 화면·출력·엑셀은 확정 당시 결과로 나오며, 그 뒤 회원 상태나 출석이 바뀌어도 달라지지 않습니다.`}</div>` : ''}
    ${edit ? `<div class="card"><div class="fields"><label class="f"><span>총회 날짜 (판정 기준일)</span><input type="date" id="as-date" value="${esc(a.date)}"></label><label class="f"><span>구분</span><select id="as-kind">${['정기총회', '임시총회'].map(k => `<option ${a.kind === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label><label class="f"><span>제목</span><input type="text" id="as-title" value="${esc(a.title)}"></label><label class="f"><span>장소</span><input type="text" id="as-place" value="${esc(a.place || '')}"></label></div><div class="row" style="margin-top:8px"><button class="btn p" id="as-save">${a.unsaved ? '이 총회 만들기' : '저장'}</button></div></div>` : ''}
    <div class="grid2">
      <div class="card"><h2>정족수 <span class="r">회칙 13조 · 직전 ${R.quorumWeeks}주 평균 출석의 ${R.quorumNum}/${R.quorumDen} · 평균 × 2/3 그대로, 그 이상이어야 성원 · 출석부 기준</span></h2><div class="quorum"><span class="big">${J.q.need}명</span><span class="note">평균 ${J.q.avg.toFixed(1)}명 × 2/3 = ${J.q.exact.toFixed(2)}명 → 이 이상이려면 ${J.q.need}명</span></div>
        <div class="tw" style="margin-top:6px"><table><thead><tr><th>주일</th>${J.q.rows.map(r => `<th class="n">${r.date.slice(5).replace('-', '/')}</th>`).join('')}<th class="n">평균</th><th class="n">×2/3</th><th class="n">필요</th></tr></thead><tbody>
          <tr><td>보고서에 적힌 출석 수${J.q.basis === 'report' ? ' <span class="pill ok">기준</span>' : ''}</td>${J.q.rows.map(r => `<td class="n">${r.rep}</td>`).join('')}<td class="n">${J.q.alt.rep.avg.toFixed(1)}</td><td class="n">${J.q.alt.rep.exact.toFixed(2)}</td><td class="n"><b>${J.q.alt.rep.need}</b></td></tr>
          <tr><td>출석부에 체크된 회원 수${J.q.basis === 'check' ? ' <span class="pill ok">기준</span>' : ''}</td>${J.q.rows.map(r => `<td class="n">${r.chk}</td>`).join('')}<td class="n">${J.q.alt.chk.avg.toFixed(1)}</td><td class="n">${J.q.alt.chk.exact.toFixed(2)}</td><td class="n"><b>${J.q.alt.chk.need}</b></td></tr>
          <tr><td class="note">참석 교사·팸장 (참고, 정족수에 안 넣음)</td>${J.q.rows.map(r => `<td class="n note">${r.t}</td>`).join('')}<td></td><td></td><td></td></tr></tbody></table></div>
        ${edit ? `<div class="row" style="margin-top:6px;gap:6px"><span class="note">정족수 기준:</span>${[['report', '보고서 숫자'], ['check', '출석부 체크 수']].map(([k, l]) => `<button class="btn s ${J.q.basis === k ? 'p' : ''}" data-qbasis="${esc(k)}">${l}</button>`).join('')}<span class="note">둘이 다르면 서기가 보고서에 적은 숫자와 출석부 체크가 어긋난 것 — 보고서 열람에서 그 주를 확인</span></div>` : ''}${J.q.rows.length ? '' : '<div class="note">총회 날짜 이전 보고서가 없습니다.</div>'}</div>
      <div class="card"><h2>결의권자 <span class="r">회칙 5조</span></h2><div class="quorum"><span class="big">${cnt('ok')}명</span><span class="note">확인 필요 ${cnt('check')}명 · 해당 아님 ${cnt('no')}명 · 발언권자 ${J.list.filter(j => speakOf(dd, j, a.date)).length + (J.excluded || []).filter(x => x.speak).length}명</span></div>
        <div class="note" style="margin-top:6px;line-height:1.7">${(() => { const v = J.list.filter(j => j.voter === 'ok'); const chips = arr => arr.map(j => `<span class="chip">${esc(j.s.name)}</span>`).join(' '); const m = v.filter(j => !j.fam), f = v.filter(j => j.fam && !j.minister), mn = v.filter(j => j.minister); return v.length ? `<div class="vchips"><b>회원 ${m.length}</b> ${chips(m)}</div>${f.length ? `<div class="vchips"><b>팸장 ${f.length}</b> ${chips(f)}</div>` : ''}${mn.length ? `<div class="vchips"><b>교역자 ${mn.length}</b> ${chips(mn)}</div>` : ''}` : '없음'; })()}${cnt('check') ? `<div style="margin-top:4px">확인 필요: ${J.list.filter(j => j.voter === 'check').map(j => esc(j.s.name)).sort((a, b) => a.localeCompare(b, 'ko')).join(', ')}</div>` : ''}</div>
        <div class="note" style="margin-top:6px">새가족반 수료 후 ${R.voterMonths}개월 이상, 최근 1년 출석률 ${R.voterRate}% 이상, 회원(만 ${R.ageMin}~${R.ageMax}세 미혼, 직분자·타 목장 제외)</div></div>
    </div>
    <div class="card"><h2>올해 임원·팀장·팸장 <span class="r">임원은 회장·부회장·총무·서기·회계 5명(부총무 등 부임원 포함) · 팀장·팸장은 임원이 아님 · 출석부의 교사·임원 명단에서</span></h2>${staffKindsHTML(dd)}</div>
    <div class="card"><h2>후보 자격자 <span class="r">회칙 11조 · 이름을 누르면 판정 정보를 고칠 수 있습니다</span></h2><div class="grid2" style="grid-template-columns:repeat(3,1fr)">
      ${col('pres', `회장 <span class="note">(${R.presAgeMax ? `만 ${R.presAgeMax}세 이하, ` : ''}${R.presYears}년 이상, 세례교인)</span>`)}${col('vp', `부회장 <span class="note">(${R.vpYears}년 이상, 세례교인)</span>`)}${col('appt', `임명직 <span class="note">(본 교회 ${R.apptYears}년, 세례교인)</span>`)}</div>
      <div class="note" style="margin-top:8px">9조(연임)는 임원 이력으로 자동 판정합니다(이력이 비어 있으면 못 거릅니다). 10조(겸임)는 자동 판정하지 않으니 후보로 올리기 전에 직접 확인하세요.</div></div>
    <div class="card"><h2>후보자 명단 <span class="r">총회에 올릴 후보 · 회의록의 선거 결과로 이어집니다</span></h2>
      <div class="tw"><table><thead><tr><th class="n no">No.</th><th>직위</th><th>이름</th><th>자격</th><th>비고</th>${edit ? '<th></th>' : ''}</tr></thead><tbody>${(a.candidates || []).map((c, i) => { const j = J.list.find(x => x.s.id === c.sid); const k = c.pos === '회장' ? 'pres' : c.pos === '부회장' ? 'vp' : 'appt'; return `<tr><td class="n no">${i + 1}</td><td>${esc(c.pos)}</td><td>${esc(c.name)}</td><td>${j ? jpill(j[k]) : ''}</td><td>${esc(c.note || '')}</td>${edit ? `<td><button class="btn s d" data-del-cand="${esc(i)}">빼기</button></td>` : ''}</tr>`; }).join('') || `<tr><td colspan="6" class="note">아직 후보가 없습니다.</td></tr>`}</tbody></table></div>
      ${edit ? `<div class="row" style="margin-top:10px"><select id="cd-pos" style="width:auto">${[...ASSEMBLY_POS, ...ASSEMBLY_POS_SUB].map(p => `<option>${p}</option>`).join('')}</select><select id="cd-sid" style="flex:1">${J.list.filter(j => j.member !== 'no').map(j => `<option value="${esc(j.s.id)}">${esc(j.s.name)}</option>`).join('')}</select><input type="text" id="cd-note" placeholder="비고 (추천인 등)" style="flex:1"><button class="btn" id="cd-add">후보 추가</button></div>` : ''}</div>
    <div class="card"><h2><span>판정표 <span class="row" style="display:inline-flex;gap:4px;margin-left:8px">${[['ok', '결의권자'], ['check', '확인 필요'], ['no', '해당 아님'], ['border', '55~65% 경계'], ['all', '전체']].map(([k, l]) => `<button class="btn s ${filter === k ? 'p' : ''}" data-vf="${esc(k)}">${l}</button>`).join('')}</span></span><span class="r">직전 1년 = ${esc(yrReps[0].date)} ~ ${esc(yrReps[yrReps.length - 1].date)} (총회 당일 포함) · 달력상 주일 ${yrReps.length}주가 분모 · 보고서 없는 주일 ${yrReps.filter(r => r.missing).length}주는 결석으로 셈 · "(추정)"은 소속 이력·출석 기록으로 짐작한 날짜</span></h2>
      <div class="tw"><table class="judge"><thead><tr><th class="n no">No.</th><th>이름</th><th class="n">나이</th><th>청년부 출석 시작</th><th class="n">1년 출석</th><th class="ystrip-h"><div class="ystrip">${stripHead}</div></th><th>선거권</th><th>회장</th><th>부회장</th><th>임명직</th><th>이력</th>${edit ? '<th></th>' : ''}</tr></thead><tbody>
      ${rows.map((j, i) => `${j.fam && !j.minister && (i === 0 || !rows[i - 1].fam) ? `<tr class="j-div"><td colspan="12">팸장 <span class="note">회원은 아니지만 결의권자로 넣습니다</span></td></tr>` : ''}${j.minister && (i === 0 || !rows[i - 1].minister) ? `<tr class="j-div"><td colspan="12">교역자 <span class="note">회칙 5조 2항 — 발언권·선거권은 있고 피선거권은 없습니다</span></td></tr>` : ''}<tr${j.fam ? ' class="j-fam"' : ''}><td class="n no">${i + 1}</td><td>${esc(j.s.name)}${j.minister ? ' <span class="pill warn">교역자</span>' : j.fam ? ' <span class="pill info">팸장</span>' : ''}</td><td class="n">${j.age ?? ''}</td><td>${j.ys ? esc(j.ys.date) + (j.ys.est ? ' <span class="note">(추정)</span>' : j.ys.school ? ' <span class="note">(주일학교)</span>' : j.ys.evang ? ' <span class="note">(등록일)</span>' : '') : ''}</td><td class="n"><button class="btn s" data-attd="${esc(j.s.id)}" title="주별 출석 근거 보기">${j.rate === null ? '근거' : `${j.cnt}/${j.of} (${j.rate}%)`}</button></td><td><div class="ystrip">${strip(j)}</div></td><td>${jpill(j.voter, j.rsn.voter)}${speakOf(dd, j, a.date) ? ' <span class="pill info" title="교회 등록 6개월 이상 — 발언권">발언권</span>' : ''}</td><td>${jpill(j.pres, j.rsn.pres)}</td><td>${jpill(j.vp, j.rsn.vp)}</td><td>${jpill(j.appt, j.rsn.appt)}</td><td class="why">${[...(j.histList || []), ...j.why.filter(w => /^보정/.test(w))].map(x => `<div class="hist-line">${esc(x)}</div>`).join('')}</td>${edit ? `<td>${j.s.pseudo ? (j.minister ? '<span class="note">교역자</span>' : '<span class="note" title="학생 카드가 없는 팸장(교사·임원 명단)">팸장</span>') : `<button class="btn s" data-mi="${esc(j.s.id)}">정보</button>`}</td>` : ''}</tr>`).join('') || '<tr><td colspan="13" class="note">해당자가 없습니다.</td></tr>'}
      </tbody></table></div>
      ${J.excluded && J.excluded.length ? `<details class="judge-out" style="margin-top:10px"><summary>판정에서 뺀 사람 ${J.excluded.length}명 <span class="note">장기결석·군입대·학업 등은 회원이지만 자격을 잠시 멈춘 사람, 새친구·타 목장·라피끄는 회원이 아닌 사람 — 결혼·직분으로 자격이 끝난 사람은 아예 넣지 않음</span></summary><div class="row" style="gap:4px;flex-wrap:wrap;margin-top:6px">${J.excluded.map(x => `<span class="chip">${esc(x.s.name)} <span class="note">${esc(x.why)}</span></span>`).join('')}</div></details>` : ''}</div>
  </div>`;
};
function attEvidencePaper(dd, s, base) {
  const from = addMonths(base, -12); const all = yearSundays(dd, base);
  const rows = all.map(r => { const e = attEvidence(r, s); return { r, e, inDen: true }; });
  const den = rows.length, num = rows.filter(x => x.e.v).length;
  const missing = all.filter(r => r.missing).map(r => r.date);
  const V = { P: ['ok', '출석'], O: ['warn', '온라인'], U: ['info', '이름만'], T: ['info', '교사 명단'], '': ['mute', '—'] };
  return `<h2>${esc(s.name)} — 직전 1년 출석 근거<button class="btn s" id="modal-close">닫기</button></h2>
    <p class="note">${esc(all[0].date)} ~ ${esc(all[all.length - 1].date)} · 출석률 계산 = 출석(어떤 근거든) ${num} ÷ 직전 1년 달력상 주일 ${den}주 = <b>${den ? (num / den * 100).toFixed(1) : '—'}%</b> (60% 기준: ${Math.ceil(den * 0.6)}주 이상). 보고서가 없는 주일(${missing.length}주)도 결석으로 세며, 총회 당일 출석까지 포함합니다.</p>
    ${missing.length ? `<div class="hint" style="margin-bottom:8px">보고서가 없는 주일: ${missing.map(d => d.slice(5).replace('-', '/')).join(', ')}</div>` : ''}
    <div class="tw" style="max-height:60vh;overflow:auto"><table><thead><tr><th>주일</th><th>판정</th><th>근거</th><th>분모</th><th>보고서 출석/재적</th><th>비고</th></tr></thead><tbody>
    ${rows.map(({ r, e, inDen }) => { const st = reportStats(dd, r); return `<tr><td>${r.date}</td><td><span class="pill ${V[e.v][0]}">${V[e.v][1]}</span></td><td class="note">${esc(e.src)}</td><td>○</td><td class="n">${r.missing ? '<span class="note">보고서 없음</span>' : `${st.p}/${st.total}`}</td><td class="note">${r.imported ? '변환' : ''}${(r.absent || {})[s.id] ? ' 결석 사유: ' + esc(r.absent[s.id]) : ''}</td></tr>`; }).join('') || '<tr><td colspan="6" class="note">기간 안에 보고서가 없습니다.</td></tr>'}
    </tbody></table></div>
    <p class="note" style="margin-top:8px">근거: 출석 체크(출석부 연결) · 이름만(보고서 출석자 이름이 출석부와 연결 안 됨 — 출석부에서 이름·생일 확인) · 교사 명단(주일 보고서 "예배에 참석한 교사·임원" 칸) · —(어느 기록에도 없음)</p>`;
}
function bindAsmPicker(dd) {
  const pk = $('#as-pick'); if (pk) pk.onchange = e => { S.sub = { asm: e.target.value }; render(); };
  const nw = $('#as-new'); if (nw) nw.onclick = () => { const d = lastSundayOfYear(YEAR); S.sub = { asm: 'new', newDate: dd.assemblies.some(x => x.id === d) ? today() : d }; render(); };
}
BIND.assembly = () => {
  const dd = S.data.young; const { a } = pickAssembly(dd); bindAsmPicker(dd); bindAssemblyExport(dd, a);
  const lk = $('#as-lock'); if (lk) lk.onclick = () => { openModal(`<h2>판정 확정<button class="btn s" id="modal-close">닫기</button></h2><p>지금의 판정 결과(결의권자 ${assemblyJudge(dd, a).list.filter(j => j.voter === 'ok').length}명, 정족수 ${assemblyJudge(dd, a).q.need}명)를 이 총회 기록으로 고정합니다. 이후 화면·출력·엑셀은 이 결과로 나옵니다. 보통 총회 당일 또는 직전에 누릅니다.</p><div class="row"><button class="btn p" id="lk-yes">확정</button><button class="btn" id="lk-no">취소</button></div>`); $('#modal-close').onclick = closeModal; $('#lk-no').onclick = closeModal; $('#lk-yes').onclick = async () => { delete a.snapshot; a.snapshot = assemblySnapshot(dd, assemblyJudge(dd, a)); await saveAssembly(dd, a); closeModal(); delete S.sub.asLive; renderHere(); toast('판정을 확정했습니다'); }; };
  const ul = $('#as-unlock'); if (ul) ul.onclick = () => { openModal(`<h2>확정 풀기<button class="btn s" id="modal-close">닫기</button></h2><p>${esc(a.snapshot.at)} 확정 판정을 지우고 다시 자동 계산으로 돌아갈까요? 확정 당시 결과는 사라집니다.</p><div class="row"><button class="btn d" id="ul-yes">확정 풀기</button><button class="btn" id="ul-no">취소</button></div>`); $('#modal-close').onclick = closeModal; $('#ul-no').onclick = closeModal; $('#ul-yes').onclick = async () => { delete a.snapshot; await saveAssembly(dd, a); closeModal(); delete S.sub.asLive; renderHere(); toast('확정을 풀었습니다'); }; };
  const lv = $('#as-live'); if (lv) lv.onclick = () => { S.sub.asLive = !S.sub.asLive; renderHere(); };
  const pr = $('#as-print'); if (pr) pr.onclick = () => { const live = S.sub.asLive; S.sub = { ...S.sub, print: true }; delete S.sub.asLive; if (live) toast('출력은 확정 판정으로 나옵니다'); render(); }; const sg = $('#as-sign'); if (sg) sg.onclick = () => { S.sub = { ...S.sub, print: 'sign' }; delete S.sub.asLive; render(); };
  const bk = $('#as-back'); if (bk) { bk.onclick = () => { delete S.sub.print; render(); }; $('#as-pr').onclick = () => printAsPDF(`${a.date}-청년부-${S.sub.print === 'sign' ? '총회-출석확인표' : '총회자료'}.pdf`); return; }
  document.querySelectorAll('[data-vf]').forEach(b => b.onclick = () => { S.sub.vf = b.dataset.vf; renderHere(); });
  document.querySelectorAll('[data-attd]').forEach(b => b.onclick = e => { e.stopPropagation(); const s = dd.students.find(x => x.id === b.dataset.attd) || (assemblyJudge(dd, a).list.find(j => j.s.id === b.dataset.attd) || {}).s; if (s) openModal(attEvidencePaper(dd, s, a.date)); });
  document.querySelectorAll('[data-qbasis]').forEach(b => b.onclick = async () => { a.quorumBasis = b.dataset.qbasis; await saveAssembly(dd, a); render(); });
  const ba = $('#as-bapt-all'); if (ba) ba.onclick = async () => { const list = dd.students.filter(s => s.status !== 'left' && !isBaptized(s)); if (!list.length) return; ba.disabled = true; ba.textContent = '표기 중…'; for (const s of list) { s.faithPrev = s.faith || ''; s.faith = '세례'; s.flags = [...(s.flags || []).filter(f => !/신급 임시/.test(f)), `신급 임시 표기(세례) ${today()} — 신급 자료로 확인 필요${s.faithPrev ? ' (원래: ' + s.faithPrev + ')' : ''}`]; await backend.set(`depts/${dd.id}/students/${s.id}`, s); } render(); toast(`${list.length}명을 세례로 임시 표기했습니다`); };
  const read = () => { const d = $('#as-date'); if (!d) return; const nd = d.value || a.date; Object.assign(a, { kind: $('#as-kind').value, title: $('#as-title').value.trim(), place: $('#as-place').value.trim() }); if (a.minutes && (!a.minutes.order || [defaultOrder('정기총회'), defaultOrder('임시총회')].includes(a.minutes.order))) a.minutes.order = defaultOrder(a.kind); /* 손대지 않은 기본 순서는 구분에 맞춰 바꿈 */ if (nd !== a.date) { a.date = nd; if (a.unsaved) { a.id = nd; S.sub.newDate = nd; } } };
  const dt = $('#as-date'); if (dt) dt.onchange = () => { read(); if (a.unsaved) { S.sub.asm = 'new'; } render(); };
  const sv = $('#as-save'); if (sv) sv.onclick = async () => { read(); await saveAssembly(dd, a); S.sub = { asm: a.id }; render(); toast('총회를 저장했습니다'); };
  const ca = $('#cd-add'); if (ca) ca.onclick = async () => { read(); const sid = $('#cd-sid').value; const s = dd.students.find(x => x.id === sid); if (!s) return; (a.candidates = a.candidates || []).push({ pos: $('#cd-pos').value, sid, name: s.name, note: $('#cd-note').value.trim() }); await saveAssembly(dd, a); S.sub = { asm: a.id }; render(); };
  document.querySelectorAll('[data-del-cand]').forEach(b => b.onclick = async () => { a.candidates.splice(+b.dataset.delCand, 1); await saveAssembly(dd, a); render(); });
  document.querySelectorAll('[data-mi]').forEach(b => b.onclick = e => { e.preventDefault(); const s = dd.students.find(x => x.id === b.dataset.mi); const j = applyOverride(a, judge(dd, s, a.date, assemblyJudge(dd, a).R)); const o = (a.overrides || {})[s.id] || {};
    openModal(`<h2>${esc(s.name)} 판정 정보<button class="btn s" id="modal-close">닫기</button></h2><p class="note">자동 판정: 선거권 ${JP[j.voter][1]} · 회장 ${JP[j.pres][1]} · 부회장 ${JP[j.vp][1]} · 임명직 ${JP[j.appt][1]}${j.why.length ? ' — ' + esc(j.why.join(', ')) : ''}</p>
      ${canYoung() ? `${memberInfoForm(s)}<div class="fields" style="margin-top:10px"><label class="f"><span>이번 총회 선거권 직접 지정</span><select id="mi-ov"><option value="">자동 판정 따름</option><option value="ok" ${o.voter === 'ok' ? 'selected' : ''}>결의권자로 넣기</option><option value="no" ${o.voter === 'no' ? 'selected' : ''}>결의권자에서 빼기</option></select></label><label class="f" style="grid-column:span 2"><span>직접 지정 사유</span><input type="text" id="mi-ovn" value="${esc(o.note || '')}" placeholder="예: 군복무 중 온라인 출석"></label></div>
      <div class="row" style="margin-top:10px"><button class="btn p" id="mi-save">저장</button><span class="note">위쪽 정보는 출석부 학생 카드에 저장되어 다음 총회에도 쓰입니다.</span></div>` : ''}`);
    const ms = $('#mi-save'); if (ms) ms.onclick = async () => { readMemberInfo(s); await backend.set(`depts/young/students/${s.id}`, s); const ov = $('#mi-ov').value, on = $('#mi-ovn').value.trim(); a.overrides = a.overrides || {}; if (ov || on) a.overrides[s.id] = { voter: ov, note: on }; else delete a.overrides[s.id]; if (!a.unsaved || ov || on) await saveAssembly(dd, a); closeModal(); render(); toast('저장했습니다'); }; });
};

/* 총회 회의록 */
function minutesPaper(dd, a, J) {
  const m = a.minutes || {}; const att = +m.attendees || 0; const ok = att >= J.q.need;
  const para = t => esc(t || '').split('\n').map(l => `<p>${l || '&nbsp;'}</p>`).join('');
  return `<section class="paper"><div class="hd"><div><h1>${esc(a.title)} 회의록</h1><div class="sub">중앙성서교회 청년부</div></div><div class="meta">${m.status === 'confirmed' ? '확정' : '작성 중'}</div></div>
    <table class="kv"><tbody><tr><th>일시</th><td>${fmtK(a.date)} ${esc(m.opened || '')}${m.closed ? ' ~ ' + esc(m.closed) : ''}</td></tr><tr><th>장소</th><td>${esc(a.place || '')}</td></tr><tr><th>사회</th><td>${esc(m.presider || '')}</td></tr><tr><th>서기</th><td>${esc(m.secretary || '')}</td></tr>
    <tr><th>성원</th><td>결의권자 ${J.list.filter(j => j.voter === 'ok').length}명 중 ${att}명 참석 · 정족수 ${J.q.need}명 → <b>${att ? (ok ? '성원' : '성원 미달') : ''}</b></td></tr></tbody></table>
    <h2>1. 순서</h2><div class="lines">${para(m.order)}</div>
    <h2>2. 안건과 결의</h2><table><thead><tr><th class="n">번호</th><th>안건</th><th>내용</th><th>결의</th></tr></thead><tbody>${(m.agenda || []).map((g, i) => `<tr><td class="n">${i + 1}</td><td>${esc(g.title)}</td><td>${esc(g.body || '')}</td><td>${esc(g.result || '')}</td></tr>`).join('') || '<tr><td colspan="4"></td></tr>'}</tbody></table>
    <h2>3. 임원 선거 결과 (회칙 14조)</h2><table><thead><tr><th>직위</th><th>후보</th><th class="n">찬성(득표)</th><th class="n">투표수</th><th>결과</th></tr></thead><tbody>${(m.votes || []).map(v => `<tr><td>${esc(v.pos)}</td><td>${esc(v.name)}</td><td class="n">${esc(v.yes ?? '')}</td><td class="n">${esc(v.total ?? '')}</td><td>${esc(voteResult(v))}</td></tr>`).join('') || '<tr><td colspan="5"></td></tr>'}</tbody></table>
    ${m.notes ? `<h2>4. 기타</h2><div class="lines">${para(m.notes)}</div>` : ''}
    <table style="margin-top:24px"><tbody><tr><th style="width:15%">회장</th><td style="height:40px">${esc(m.presider || '')} (인)</td><th style="width:15%">서기</th><td>${esc(m.secretary || '')} (인)</td></tr></tbody></table>
    <div class="ft"><b>중앙성서교회 청년부</b><span>CBCS에서 생성 · ${esc(a.date)}-총회회의록.pdf</span></div></section>`;
}
const voteResult = v => v.result || (v.yes !== '' && v.total ? (+v.yes > +v.total / 2 ? '당선(과반)' : '과반 미달') : '');
VIEWS.minutes = async () => {
  const dd = await loadYoung(); const { a, list } = pickAssembly(dd); const J = assemblyJudge(dd, a); const m = a.minutes = a.minutes || blankAssembly(a.date).minutes;
  if (!(m.votes || []).length && (a.candidates || []).length) m.votes = a.candidates.map(c => ({ pos: c.pos, name: c.name, yes: '', total: '', result: '' }));
  if (S.sub.print) return `<div class="topbar no-print"><div><h1>회의록 출력</h1></div><div class="row"><button class="btn" id="mn-back">돌아가기</button><button class="btn p" id="mn-pr">PDF로 저장 / 인쇄</button></div></div>${minutesPaper(dd, a, J)}`;
  const edit = canYoung() && m.status !== 'confirmed'; const ro = edit ? '' : 'readonly';
  const att = +m.attendees || 0; const voters = J.list.filter(j => j.voter === 'ok').length;
  if (a.unsaved && !list.length) return `<div class="topbar"><div><h1>총회 회의록</h1></div></div><div class="hint">아직 만든 총회가 없습니다. "총회 자료"에서 총회 날짜를 정하고 "이 총회 만들기"를 누르면 여기서 회의록을 쓸 수 있습니다.</div>`;
  return `<div class="topbar"><div><h1>총회 회의록</h1><div class="sub">${esc(a.title)} · ${fmtK(a.date)} · ${m.status === 'confirmed' ? `<span class="pill ok">확정</span> ${esc(m.confirmedAt || '')}` : '<span class="pill warn">작성 중</span>'}</div></div>
    <div class="row">${asmPicker(list, a)}${canEdit() ? '<button class="btn" id="mn-print">회의록 출력</button>' : ''}${canYoung() ? (m.status === 'confirmed' ? '<button class="btn" id="mn-unconfirm">확정 취소(수정)</button>' : '<button class="btn" id="mn-save">저장</button><button class="btn p" id="mn-confirm">확정</button>') : ''}</div></div>
  <div class="stack">
    <div class="card"><h2>기본 사항</h2><div class="fields">
      <label class="f"><span>개회 시각</span><input type="time" id="mn-open" value="${esc(m.opened || '')}" ${ro}></label><label class="f"><span>폐회 시각</span><input type="time" id="mn-close" value="${esc(m.closed || '')}" ${ro}></label>
      <label class="f"><span>사회</span><input type="text" id="mn-pres" value="${esc(m.presider || '')}" ${ro}></label><label class="f"><span>서기</span><input type="text" id="mn-sec" value="${esc(m.secretary || '')}" ${ro}></label>
      <label class="f"><span>참석 결의권자 수</span><input type="number" id="mn-att" value="${esc(m.attendees || '')}" ${ro}></label>
      <div class="f"><span>성원 여부</span><div style="padding-top:8px">결의권자 ${voters}명 · 정족수 ${J.q.need}명 → ${att ? (att >= J.q.need ? '<span class="pill ok">성원</span>' : '<span class="pill bad">성원 미달</span>') : '<span class="note">참석 수를 넣으면 자동 판정</span>'}</div></div>
    </div></div>
    <div class="grid2">
      <div class="card"><h2>순서 ${edit ? `<span class="r"><button class="btn s" id="mn-order-default">${esc(a.kind || '정기총회')} 기본 순서 넣기</button></span>` : ''}</h2><textarea id="mn-order" style="width:100%;min-height:${a.kind === '임시총회' ? 220 : 360}px;line-height:1.6" ${ro}>${esc(m.order || '')}</textarea>${edit ? '<div class="note" style="margin-top:4px">정기총회는 16개 순서 전부, 임시총회는 1·2·3·4·9·13·14·15·16만. 임원 교체는 1월 첫 주에 따로 하므로 이·취임 순서는 없습니다. 줄을 지우거나 고쳐 쓰면 됩니다.</div>' : ''}</div>
      <div class="card"><h2>임원 선거 결과 <span class="r">회칙 14조 · 무기명 비밀투표 과반수</span></h2><div class="tw"><table><thead><tr><th>직위</th><th>후보</th><th class="n">득표</th><th class="n">투표수</th><th>결과</th>${edit ? '<th></th>' : ''}</tr></thead><tbody>${(m.votes || []).map((v, i) => `<tr><td><input type="text" data-v="${esc(i)}" data-k="pos" value="${esc(v.pos)}" style="width:70px" ${ro}></td><td><input type="text" data-v="${esc(i)}" data-k="name" value="${esc(v.name)}" style="width:90px" ${ro}></td><td class="n"><input type="number" data-v="${esc(i)}" data-k="yes" value="${esc(v.yes ?? '')}" style="width:64px" ${ro}></td><td class="n"><input type="number" data-v="${esc(i)}" data-k="total" value="${esc(v.total ?? '')}" style="width:64px" ${ro}></td><td>${esc(voteResult(v))}</td>${edit ? `<td><button class="btn s d" data-del-v="${esc(i)}">빼기</button></td>` : ''}</tr>`).join('') || '<tr><td colspan="6" class="note">총회 자료에서 후보를 올리면 자동으로 채워집니다.</td></tr>'}</tbody></table></div>
        ${edit ? '<div class="row" style="margin-top:8px"><button class="btn s" id="mv-add">줄 추가</button></div>' : ''}</div>
    </div>
    <div class="card"><h2>안건과 결의</h2><div class="tw"><table><thead><tr><th class="n">번호</th><th>안건</th><th>내용</th><th>결의</th>${edit ? '<th></th>' : ''}</tr></thead><tbody>${(m.agenda || []).map((g, i) => `<tr><td class="n">${i + 1}</td><td><input type="text" data-g="${esc(i)}" data-k="title" value="${esc(g.title)}" ${ro}></td><td><input type="text" data-g="${esc(i)}" data-k="body" value="${esc(g.body || '')}" ${ro}></td><td><input type="text" data-g="${esc(i)}" data-k="result" value="${esc(g.result || '')}" placeholder="가결 / 부결 / 보류" ${ro}></td>${edit ? `<td><button class="btn s d" data-del-g="${esc(i)}">빼기</button></td>` : ''}</tr>`).join('') || '<tr><td colspan="5" class="note">안건을 추가하세요. (예: 회칙 개정안 승인, 결산 보고 승인)</td></tr>'}</tbody></table></div>
      ${edit ? '<div class="row" style="margin-top:8px"><button class="btn s" id="mg-add">안건 추가</button></div>' : ''}</div>
    <div class="card"><h2>기타</h2><textarea id="mn-notes" style="width:100%" ${ro}>${esc(m.notes || '')}</textarea></div>
  </div>`;
};
function collectMinutes(a) {
  const m = a.minutes; if (!$('#mn-order') || $('#mn-order').readOnly) return;
  Object.assign(m, { opened: $('#mn-open').value, closed: $('#mn-close').value, presider: $('#mn-pres').value.trim(), secretary: $('#mn-sec').value.trim(), attendees: $('#mn-att').value, order: $('#mn-order').value, notes: $('#mn-notes').value });
  document.querySelectorAll('[data-v]').forEach(i => { m.votes[+i.dataset.v][i.dataset.k] = i.value; });
  document.querySelectorAll('[data-g]').forEach(i => { m.agenda[+i.dataset.g][i.dataset.k] = i.value; });
}
BIND.minutes = () => {
  const dd = S.data.young; const { a } = pickAssembly(dd); if (!a.minutes) return; const m = a.minutes; bindAsmPicker(dd);
  const od = $('#mn-order-default'); if (od) od.onclick = () => { if ($('#mn-order').value.trim() && !confirm('지금 적힌 순서를 기본 순서로 바꿉니다. 계속할까요?')) return; $('#mn-order').value = defaultOrder(a.kind); };
  const pr = $('#mn-print'); if (pr) pr.onclick = () => { collectMinutes(a); S.sub = { asm: a.id, print: true }; render(); };
  const bk = $('#mn-back'); if (bk) { bk.onclick = () => { delete S.sub.print; render(); }; $('#mn-pr').onclick = doPrint; return; }
  const save = async msg => { collectMinutes(a); await saveAssembly(dd, a); S.sub = { asm: a.id }; render(); if (msg) toast(msg); };
  const sv = $('#mn-save'); if (sv) sv.onclick = () => save('저장했습니다');
  const at = $('#mn-att'); if (at) at.onchange = () => save();
  document.querySelectorAll('[data-v][data-k=yes],[data-v][data-k=total]').forEach(i => i.onchange = () => save());
  const va = $('#mv-add'); if (va) va.onclick = () => { collectMinutes(a); (m.votes = m.votes || []).push({ pos: '', name: '', yes: '', total: '', result: '' }); save(); };
  const ga = $('#mg-add'); if (ga) ga.onclick = () => { collectMinutes(a); (m.agenda = m.agenda || []).push({ title: '', body: '', result: '' }); save(); };
  document.querySelectorAll('[data-del-v]').forEach(b => b.onclick = () => { collectMinutes(a); m.votes.splice(+b.dataset.delV, 1); save(); });
  document.querySelectorAll('[data-del-g]').forEach(b => b.onclick = () => { collectMinutes(a); m.agenda.splice(+b.dataset.delG, 1); save(); });
  const cf = $('#mn-confirm'); if (cf) cf.onclick = () => { collectMinutes(a); m.status = 'confirmed'; m.confirmedAt = today(); save('회의록을 확정했습니다'); };
  const uc = $('#mn-unconfirm'); if (uc) uc.onclick = () => { m.status = 'draft'; save('확정을 풀었습니다'); };
};

/* ───────────── 통계 ───────────── */
VIEWS.stats = async () => {
  const dd = D(); const now = today(); const range = S.sub.range || '1m';
  const RANGES = [['all', '전체'], ['6m', '6개월'], ['3m', '3개월'], ['1m', '1달'], ['custom', '날짜 지정']];
  const monthAgo = (() => { const d = new Date(now); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10); })();
  const custom = range === 'custom'; const cFrom = S.sub.from || monthAgo, cTo = S.sub.to || now;
  const from = custom ? cFrom : (() => { if (range === 'all') return YEAR + '-01-01'; const k = +range[0]; const d = new Date(now); d.setMonth(d.getMonth() - k); return d.toISOString().slice(0, 10); })();
  const to = custom ? cTo : now;
  const reps = Object.values(dd.reports).filter(r => (custom || r.date.startsWith(String(YEAR))) && r.date >= from && r.date <= to).sort((a, b) => a.date < b.date ? -1 : 1);
  const last4 = Object.values(dd.reports).filter(r => r.date.startsWith(String(YEAR)) && r.date <= now).sort((a, b) => a.date < b.date ? -1 : 1).slice(-4);
  const rows = activeStudents(dd).map(s => { const cnt = reps.filter(r => (r.att || {})[s.id]).length; const streak = last4.length >= 4 && last4.every(r => !(r.att || {})[s.id]); return { s, cnt, rate: reps.length ? Math.round(cnt / reps.length * 100) : 0, streak }; }).sort((a, b) => a.rate - b.rate);
  const trend = reps.map(r => ({ date: r.date, s: reportStats(dd, r) }));
  return `<div class="topbar"><div><h1>출석 통계</h1><div class="sub">${custom ? `${fmtK(from)} ~ ${fmtK(to)}` : `${YEAR}년 1주부터 오늘까지 중 ${range === 'all' ? '전체' : '최근 ' + RANGES.find(x => x[0] === range)[1]}`} · 주일 보고서 ${reps.length}장 기준${reps.length ? ` (${reps[0].date} ~ ${reps[reps.length - 1].date})` : ''}</div></div>
    <div class="doc-tabs no-print" style="margin:0">${RANGES.map(([k, l]) => `<button data-range="${esc(k)}" class="${range === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
  ${custom ? `<div class="card no-print" style="margin-bottom:12px"><div class="row" style="gap:8px;align-items:flex-end;flex-wrap:wrap"><label class="f" style="width:auto"><span>시작일</span><input type="date" id="st-from" value="${esc(cFrom)}"></label><span style="padding-bottom:8px">~</span><label class="f" style="width:auto"><span>끝날</span><input type="date" id="st-to" value="${esc(cTo)}" max="${now}"></label><button class="btn p" id="st-apply">보기</button><span class="note">지난 연도도 고를 수 있습니다. 4주 연속 결석은 기간과 상관없이 최근 4주 기준입니다.</span></div></div>` : ''}
  <div class="stack">
    <div class="card"><h2>주별 출석 추이</h2>${trend.length ? svgTrend(trend) : '<div class="note">보고서가 쌓이면 그래프가 그려집니다.</div>'}</div>
    <div class="grid2">
      <div class="card"><h2>장기 결석 (최근 4주 연속)</h2><div class="list">${rows.filter(r => r.streak).map(r => `<div class="item"><div class="t">${esc(r.s.name)} <span class="note">${esc((classOf(dd, r.s) || {}).name || '')}</span></div><span class="row" style="gap:6px"><span class="pill bad">4주 결석</span>${canEdit() ? `<button class="btn s" data-go="care">심방 카드</button>` : ''}</span></div>`).join('') || `<div class="note">${last4.length < 4 ? '보고서가 4장 이상 쌓이면 자동으로 찾습니다.' : '해당자가 없습니다.'}</div>`}</div><div class="note" style="margin-top:8px">연말 제적 정리 후보도 여기서 뽑습니다.</div></div>
      <div class="card"><h2>학생별 출석률 <span class="r">낮은 순</span></h2><div class="tw" style="max-height:480px;overflow:auto"><table><thead><tr><th>이름</th><th>${esc(dd.doc.classLabel)}</th><th class="n">출석</th><th class="n">출석률</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.s.name)}</td><td class="note">${esc((classOf(dd, r.s) || {}).name || '')}</td><td class="n">${r.cnt}/${reps.length}</td><td class="n">${r.rate}%</td></tr>`).join('')}</tbody></table></div></div>
    </div>
  </div>`;
};
BIND.stats = () => { document.querySelectorAll('[data-range]').forEach(b => b.onclick = () => { S.sub.range = b.dataset.range; renderHere(); });
  const ap = $('#st-apply'); if (ap) ap.onclick = () => { let f = $('#st-from').value, t = $('#st-to').value; if (!f || !t) { toast('시작일과 끝날을 고르세요'); return; } if (f > t) [f, t] = [t, f]; S.sub.from = f; S.sub.to = t; render(); }; };
function svgTrend(t) {
  const W = 640, H = 170, pl = 36, pr = 22, pt = 16, pb = 30; const max = Math.max(...t.map(x => x.s.total), 1);
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
VIEWS.members = async () => { const dd = D(); return `<div class="topbar"><div><h1>멤버</h1><div class="sub">${esc(dd.doc.name)} 교사·임원과 반 편성</div></div></div><div class="stack"><div class="card"><h2>교사·임원</h2><div class="list">${visibleStaff(dd).map(t => `<div class="item"><div><div class="t">${esc(t.name)}</div><div class="d">${esc(t.role)}${t.classId ? ' · ' + esc(t.classId) : ''}</div></div>${t.phone ? `<a href="tel:${esc(t.phone)}" class="note">${esc(t.phone)}</a>` : ''}</div>`).join('')}</div></div><div class="card"><h2>${esc(dd.doc.classLabel)} 편성</h2><div class="list">${dd.doc.classes.map(c => `<div class="item"><div><div class="t">${esc(c.name)}</div><div class="d">담임 ${esc(c.teacher || '미정')} · ${classStudents(dd, c.id).map(s => esc(s.name)).join(', ')}</div></div></div>`).join('')}</div></div></div>`; };

/* ───────────── 장학 (교육위원회) ───────────── */
/* 장학 첫 화면: 최근 5개년 확정 대상자 한눈에 — 해마다 몇 명·얼마·누구, 여러 해 받은 사람 */
function scholarshipOverview(all, cur) {
  const ys = [...new Set(all.map(s => s.year))].sort((a, b) => b - a).slice(0, 5); if (!ys.length) return '';
  const grp = s => { const t = (s.origDept || DEPTS[s.dept] || '') + ''; return /유치|초등|유아|유년|아동/.test(t) || ['kinder', 'elem'].includes(s.dept) ? '유·초' : /중|고/.test(t) || s.dept === 'youth' ? '중고' : /청년/.test(t) || s.dept === 'young' ? '청년' : '기타'; };
  const G = ['유·초', '중고', '청년', '기타'];
  const conf = y => all.filter(s => s.year === y && s.status === '확정').sort((a, b) => G.indexOf(grp(a)) - G.indexOf(grp(b)) || a.name.localeCompare(b.name, 'ko'));
  const cnt = {}; ys.forEach(y => conf(y).forEach(s => { cnt[s.name] = (cnt[s.name] || 0) + 1; }));
  const multi = Object.entries(cnt).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'));
  return `<div class="card sc-ov"><h2>최근 ${ys.length}개년 장학 대상자 <span class="r">확정 기준 · 연도를 누르면 아래에 그 해 상세가 나옵니다</span></h2><div class="tw"><table><thead><tr><th>연도</th><th class="n">인원</th><th class="n">합계(원)</th>${G.map(g => `<th class="n">${g}</th>`).join('')}<th>명단</th></tr></thead><tbody>
    ${ys.map(y => { const L = conf(y); return `<tr class="${y === cur ? 'on' : ''}" data-scy="${esc(y)}" style="cursor:pointer"><th>${y}</th><td class="n"><b>${L.length}</b></td><td class="n">${won(L.reduce((t, s) => t + (+s.amount || 0), 0))}</td>${G.map(g => `<td class="n">${L.filter(s => grp(s) === g).length || ''}</td>`).join('')}<td class="wrap">${G.map(g => { const n = L.filter(s => grp(s) === g); return n.length ? `<span class="sc-g">${g}</span> ${n.map(s => `<span class="${cnt[s.name] >= 2 ? 'sc-rep' : ''}">${esc(s.name)}</span>`).join(', ')}` : ''; }).filter(Boolean).join(' &nbsp; ')}</td></tr>`; }).join('')}
    </tbody></table></div>${multi.length ? `<div class="note" style="margin-top:8px"><b>${ys.length}년 동안 두 번 이상 받은 사람</b> (명단에 밑줄): ${multi.map(([n, k]) => `${esc(n)} ${k}회`).join(', ')}</div>` : ''}</div>`;
}
VIEWS.scholarship = async () => {
  const all = S.scholarship || (S.scholarship = await backend.list('scholarship'));
  const years = [...new Set(all.map(s => s.year))].sort((a, b) => b - a); const year = S.sub.year || years[0] || YEAR;
  const list = all.filter(s => s.year === year).sort((a, b) => (a.status === '확정' ? 0 : 1) - (b.status === '확정' ? 0 : 1) || (a.origDept || '').localeCompare(b.origDept || '') || a.name.localeCompare(b.name));
  const total = list.filter(s => s.status === '확정').reduce((a, s) => a + (+s.amount || 0), 0);
  const show = S.sub.showAcct;
  return `<div class="topbar"><div><h1>장학</h1><div class="sub">교육위원회 전용 · 2018년부터의 장학생 명단과 지급 내역</div></div><div class="row"><select id="sc-year" style="width:auto">${years.map(y => `<option ${y === year ? 'selected' : ''}>${y}</option>`).join('')}</select>${canEdit() ? `<button class="btn s" id="sc-acct">${show ? '계좌 숨기기' : '계좌 보기'}</button><button class="btn p" id="sc-new">대상자 추가</button>` : ''}</div></div>
  <div class="stack">
    ${scholarshipOverview(all, year)}
    <div class="tiles"><div class="tile"><div class="v">${list.filter(s => s.status === '확정').length}</div><div class="l">${year}년 확정</div></div><div class="tile"><div class="v">${list.filter(s => s.status !== '확정').length}</div><div class="l">후보·제외</div></div><div class="tile"><div class="v">${won(total)}</div><div class="l">확정 합계(원)</div></div></div>
    <div class="card"><div class="tw"><table><thead><tr><th>상태</th><th>이름</th><th>소속</th><th>학교·학년</th><th class="n">금액</th><th>사유·비고</th>${show ? '<th>계좌</th>' : ''}<th></th></tr></thead><tbody>
    ${list.map(s => `<tr><td><span class="pill ${s.status === '확정' ? 'ok' : s.status === '후보' ? 'info' : 'mute'}">${esc(s.status || '')}</span></td><td>${esc(s.name)}${s.flags && s.flags.length ? ` <span class="tag flag" title="${esc(s.flags.join(' / '))}">!</span>` : ''}</td><td>${esc(s.origDept || DEPTS[s.dept] || '')}</td><td class="wrap note">${esc([s.school, s.grade].filter(Boolean).join(' '))}</td><td class="n">${s.amount ? won(s.amount) : '—'}</td><td class="wrap note">${esc([s.reason, s.note].filter(Boolean).join(' · ')).slice(0, 90)}</td>${show ? `<td class="mask note">${esc([s.bank, s.account, s.holder].filter(Boolean).join(' '))}</td>` : ''}<td>${canEdit() ? `<button class="btn s" data-sc="${esc(s._id)}">수정</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="note">자료가 없습니다.</td></tr>'}
    </tbody></table></div></div>
  </div>`;
};
function scholarshipForm(s) { return `<div class="fields"><label class="f"><span>연도</span><input type="number" id="sf-year" value="${s.year || YEAR}"></label><label class="f"><span>상태</span><select id="sf-status">${['확정','후보','제외'].map(k => `<option ${s.status === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label><label class="f"><span>이름</span><input type="text" id="sf-name" value="${esc(s.name || '')}"></label><label class="f"><span>소속</span><input type="text" id="sf-dept" value="${esc(s.origDept || '')}" placeholder="청년부 / 성서선교회 등"></label><label class="f"><span>학교</span><input type="text" id="sf-school" value="${esc(s.school || '')}"></label><label class="f"><span>학년</span><input type="text" id="sf-grade" value="${esc(s.grade || '')}"></label><label class="f"><span>금액</span><input type="number" id="sf-amount" value="${s.amount || 0}"></label><label class="f"><span>생년월일</span><input type="text" id="sf-birth" value="${esc(s.birth || '')}"></label><label class="f"><span>은행</span><input type="text" id="sf-bank" value="${esc(s.bank || '')}"></label><label class="f"><span>계좌번호</span><input type="text" id="sf-account" value="${esc(s.account || '')}"></label><label class="f"><span>예금주</span><input type="text" id="sf-holder" value="${esc(s.holder || '')}"></label><label class="f"><span>수여식</span><input type="date" id="sf-ceremony" value="${esc(s.ceremony || '')}"></label><label class="f" style="grid-column:span 2"><span>선정 사유</span><input type="text" id="sf-reason" value="${esc(s.reason || '')}"></label><label class="f" style="grid-column:span 2"><span>비고</span><input type="text" id="sf-note" value="${esc(s.note || '')}"></label></div>`; }
function readScholarshipForm(s) { Object.assign(s, { year: +$('#sf-year').value, status: $('#sf-status').value, name: $('#sf-name').value.trim(), origDept: $('#sf-dept').value.trim(), school: $('#sf-school').value.trim(), grade: $('#sf-grade').value.trim(), amount: +$('#sf-amount').value || 0, birth: $('#sf-birth').value.trim(), bank: $('#sf-bank').value.trim(), account: $('#sf-account').value.trim(), holder: $('#sf-holder').value.trim(), ceremony: $('#sf-ceremony').value, reason: $('#sf-reason').value.trim(), note: $('#sf-note').value.trim(), flags: [] }); }
BIND.scholarship = () => {
  $('#sc-year').onchange = e => { S.sub.year = +e.target.value; render(); };
  document.querySelectorAll('[data-scy]').forEach(r => r.onclick = () => { S.sub.year = +r.dataset.scy; renderHere(); });
  const ac = $('#sc-acct'); if (ac) ac.onclick = () => { S.sub.showAcct = !S.sub.showAcct; render(); };
  const nw = $('#sc-new'); if (nw) nw.onclick = () => { const s = { id: 'sc_' + uid(), year: S.sub.year || YEAR, status: '후보', name: '', origDept: '', dept: '', sex: '', birth: '', school: '', grade: '', amount: 0, bank: '', account: '', holder: '', reason: '', note: '', ceremony: '', flags: [], source: ['앱 입력'] }; openModal(`<h2>장학 대상자 추가<button class="btn s" id="modal-close">닫기</button></h2>${scholarshipForm(s)}<div class="row" style="margin-top:10px"><button class="btn p" id="sf-save">저장</button></div>`); $('#sf-save').onclick = async () => { readScholarshipForm(s); if (!s.name) return; await backend.set(`scholarship/${s.id}`, s); S.scholarship.push({ _id: s.id, ...s }); closeModal(); render(); }; };
  document.querySelectorAll('[data-sc]').forEach(b => b.onclick = () => { const s = S.scholarship.find(x => x._id === b.dataset.sc); openModal(`<h2>${esc(s.name)} (${s.year})<button class="btn s" id="modal-close">닫기</button></h2>${s.flags && s.flags.length ? `<div class="flags">${s.flags.map(esc).join('<br>')}</div>` : ''}<div style="margin-top:8px">${scholarshipForm(s)}</div><div class="row" style="margin-top:10px"><button class="btn p" id="sf-save">저장</button><button class="btn d" id="sf-del">삭제</button></div>`); $('#sf-save').onclick = async () => { readScholarshipForm(s); const { _id, ...data } = s; await backend.set(`scholarship/${_id}`, data); closeModal(); render(); }; $('#sf-del').onclick = async () => { await backend.del(`scholarship/${s._id}`); S.scholarship = S.scholarship.filter(x => x._id !== s._id); closeModal(); render(); }; });
};

/* ───────────── 데이터 가져오기 (교육위원회) ───────────── */
/* 처음 옮길 때 쓰던 가져오기·교인명부 넣기 — 이제 "백업·복원" 화면 아래쪽 접힌 칸에 있다 */
const importCardsHTML = () => `  <div class="stack"><div class="card"><input type="file" id="im-file" accept="application/json,.json"><div class="row" style="margin-top:10px"><button class="btn p" id="im-go" disabled>올리기</button><label class="row" style="font-size:12.5px"><input type="checkbox" id="im-reports" checked> 주일 보고서</label><label class="row" style="font-size:12.5px"><input type="checkbox" id="im-students" checked> 출석부</label><label class="row" style="font-size:12.5px"><input type="checkbox" id="im-money" checked> 회계</label><label class="row" style="font-size:12.5px"><input type="checkbox" id="im-plan" checked> 연간 계획·월간</label><label class="row" style="font-size:12.5px"><input type="checkbox" id="im-sch" checked> 장학</label><label class="row" style="font-size:12.5px"><input type="checkbox" id="im-arch" checked> 보관 색인</label></div><pre class="progress" id="im-log" style="margin-top:12px"></pre></div>
  <div class="card"><h2>명부(신급·가족·연락처) 가져오기</h2><div class="note">tools/roster_xlsx.py로 교육부 명부 엑셀을 바꾼 <b>roster.json</b>을 올립니다. 부서마다 이름+생일로 기존 학생을 찾아 신급·신급연도·연락처·학교·부모·형제자매·주소·전도자·장학을 채웁니다. 신급은 명부 값으로 덮어쓰고(임시 "세례" 표기는 풀림), 나머지는 비어 있는 칸만 채웁니다. 명부에만 있는 사람은 새로 추가합니다.</div>
    <input type="file" id="rs-file" accept="application/json,.json" style="margin-top:8px"><div class="row" style="margin-top:10px"><button class="btn p" id="rs-go" disabled>가져오기 시작</button></div><pre class="progress" id="rs-log" style="margin-top:10px"></pre></div>
  <div class="card"><h2>엑셀 가져오기 (앞으로)</h2><div class="note">출석부·회계 엑셀을 정해진 양식으로 올리면 바로 반영하는 기능은 전 부서 시행 후 양식을 정해 추가합니다.</div></div></div>`;
VIEWS.import = async () => `<div class="topbar"><div><h1>데이터 가져오기</h1><div class="sub">변환된 초기 데이터(JSON)를 올립니다. 같은 id는 덮어쓰고, 앱에서 새로 만든 자료는 건드리지 않습니다.</div></div></div>
${importCardsHTML()}`;
BIND.import = () => {
  bindRosterImport();
  let payload = null; const log = m => { $('#im-log').textContent += m + '\n'; };
  $('#im-file').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { payload = JSON.parse(await f.text()); $('#im-go').disabled = false; if (payload.raw) log(`전체 자료 내려받기 파일입니다(${(payload.generated || '').slice(0, 10)} · ${payload.raw.length}건). 올리면 같은 자료를 그날 상태로 덮어씁니다.`); if (!payload.raw) log(`파일 확인: 부서 ${Object.keys(payload.depts || {}).join(', ')} · 장학 ${(payload.scholarship || []).length}건 · 보관 색인 ${(payload.archiveIndex || []).length}건`); } catch (err) { log('JSON을 읽지 못했습니다: ' + err.message); } };
  $('#im-go').onclick = async () => {
    if (!payload) return; $('#im-go').disabled = true; const on = id => $('#' + id).checked;
    const items = payload.raw ? payload.raw.map(x => ({ path: x.path, data: x.data })) : payloadToItems(payload, { students: on('im-students'), reports: on('im-reports'), money: on('im-money'), plan: on('im-plan'), sch: on('im-sch'), arch: on('im-arch') });
    log(`문서 ${items.length}개를 올립니다…`);
    try { await backend.batchSet(items, (a, b) => { $('#im-log').textContent = $('#im-log').textContent.replace(/\n진행.*$/, '') + `\n진행 ${a}/${b}`; }); log('완료. 새로고침하면 반영됩니다.'); S.data = {}; S.committee = null; S.scholarship = null; S.archive = null; }
    catch (err) { log('실패: ' + (err.code || err.message) + ' — Firestore 보안 규칙과 로그인 계정을 확인하세요.'); $('#im-go').disabled = false; }
  };
};

// 명부 JSON(roster_xlsx.py) 가져오기 — 부서별로 학생을 찾아 합친다
function bindRosterImport() {
  let payload = null; const log = m => { $('#rs-log').textContent += m + '\n'; };
  const fi = $('#rs-file'), go = $('#rs-go'); if (!fi || !go) return;
  fi.onchange = async e => { const f = e.target.files[0]; if (!f) return; try { payload = JSON.parse(await f.text()); go.disabled = !(payload.rows || []).length; log(`${f.name}: ${(payload.rows || []).length}명 (${payload.year || ''}년 명부)`); (payload._review || []).forEach(r => log('※ ' + r)); } catch (err) { log('JSON을 읽지 못했습니다: ' + err.message); } };
  go.onclick = async () => { go.disabled = true; try { await importRoster(payload, log); } catch (err) { log('실패: ' + (err.code || err.message)); } };
}
async function importRoster(payload, log) {
  const md = b => (b || '').slice(5); const byDept = {};
  for (const x of payload.rows || []) (byDept[x.dept] = byDept[x.dept] || []).push(x);
  for (const [d, rows] of Object.entries(byDept)) {
    if (!DEPTS[d]) { log(`${d}: 모르는 부서 — 건너뜀`); continue; }
    if (!isCommittee() && S.dept !== d) { log(`${DEPTS[d]} ${rows.length}명: 다른 부서라 건너뜀 (교육위원회로 들어가면 전 부서 가능)`); continue; }
    const dd = await loadDept(d); const items = []; let upd = 0, add = 0, lft = 0; const warn = [];
    // 같은 사람 찾기 — 공통 규칙(matchPerson): 생년월일(연도까지) 일치만 자동, 다르거나 동명이인이면 합치지 않고 "확인 필요"
    const findS = x => { const m = matchPerson(dd.students, x); if (m.status === 'none') return null; if (m.status === 'exact') return m.s; if (m.status === 'loose') { warn.push(`${x.name}: ${m.reason} — 맞는지 확인`); return m.s; } warn.push(`${x.name}: ${m.reason} — 합치지 않음${m.status === 'conflict' ? ', 같은 사람이면 앱에서 생일을 고친 뒤 다시 가져오기' : ''}`); return undefined; };
    for (const x of rows) {
      let s = findS(x); if (s === undefined) continue;
      if (!s) { s = { id: `${d}_${x.name}_${x.birth || uid()}`, name: x.name, sex: x.sex || '', birth: x.birth || '', dept: d, classId: '', status: x.left ? 'left' : 'active', faith: '', faithYear: '', faithHalf: '', phone: '', school: '', father: '', mother: '', siblings: [], address: '', evangelist: '', guardianPhone: '', guardianRel: '', scholarship: [], note: '', history: [], statusLog: [], flags: [`${payload.year || ''} 명부에서 추가`] }; dd.students.push(s); add++; } else upd++;
      const fill = (k, v) => { if (v && !s[k]) s[k] = v; };
      if (x.birth && s.birth && md(s.birth) !== md(x.birth)) s.flags = [...(s.flags || []), `생일이 다름: 앱 ${s.birth} / 명부 ${x.birth}`]; fill('birth', x.birth); fill('sex', x.sex);
      // 신급: 명부 값으로 덮어쓴다. 임시 "세례" 표기는 푼다
      if (s.faithPrev !== undefined) { s.faith = s.faithPrev; delete s.faithPrev; s.flags = (s.flags || []).filter(f => !/신급 임시/.test(f)); }
      if (x.faithRaw) { s.faith = x.faithRaw; normalizeFaith(s); if (x.faithYear) { s.faithYear = x.faithYear; s.faithHalf = x.faithHalf || ''; } }
      else if (x.faithYear && !s.faithYear) { s.faithYear = x.faithYear; s.faithHalf = x.faithHalf || ''; }
      fill('phone', x.phone); fill('guardianPhone', x.guardianPhone); fill('guardianRel', x.guardianRel); fill('school', x.school); fill('father', x.father); fill('mother', x.mother); fill('address', x.address); fill('evangelist', x.evangelist); fill('joinDate', x.joinDate);
      if (x.siblings && x.siblings.length) { const cur = Array.isArray(s.siblings) ? s.siblings : String(s.siblings || '').split(/[,，]\s*/).filter(Boolean); s.siblings = [...new Set([...cur, ...x.siblings])]; }
      if (x.scholarship && x.scholarship.length) s.scholarship = [...new Set([...(s.scholarship || []).map(Number), ...x.scholarship])].sort();
      if (x.note) { const parts = String(s.note || '').split(/\s*[,，]\s*/).filter(Boolean); for (const t of x.note.split(/\s*[,，/]\s*/).filter(Boolean)) if (!parts.includes(t) && !/제적$/.test(t)) parts.push(t); s.note = parts.join(', '); }
      for (const f of x.flags || []) if (!(s.flags || []).includes(f)) s.flags = [...(s.flags || []), f];
      if (x.left) { if (s.status !== 'left') { (s.statusLog = s.statusLog || []).push({ date: `${x.left}-12-31`, from: s.status, to: 'left', kind: '제적', reason: `${payload.year || ''} 명부 "${x.left}제적"` }); s.status = 'left'; } if (!s.leftDate) s.leftDate = `${x.left}-12-31`; s.leftKind = s.leftKind || '제적'; lft++; }
      else if (x.longabsent && s.status === 'active') { (s.statusLog = s.statusLog || []).push({ date: today(), from: 'active', to: 'longabsent', reason: `${payload.year || ''} 명부 장결자` }); s.status = 'longabsent'; }
      items.push({ path: `depts/${d}/students/${s.id}`, data: s });
    }
    await backend.batchSet(items, (a, b) => { $('#rs-log').textContent = $('#rs-log').textContent.replace(/\n진행.*$/, '') + `\n진행 ${DEPTS[d]} ${a}/${b}`; });
    log(`${DEPTS[d]}: 기존 ${upd}명 채움 · 새로 ${add}명 · 제적 ${lft}명`); warn.forEach(w => log('※ ' + DEPTS[d] + ' ' + w));
  }
  log('완료. 새로고침하면 반영됩니다.'); S.data = {};
}
function payloadToItems(payload, on) {
  const items = [];
  for (const [d, dep] of Object.entries(payload.depts || {})) {
    items.push({ path: `depts/${d}`, data: { ...dep.doc } });
    if (on.students) (dep.students || []).forEach(s => items.push({ path: `depts/${d}/students/${s.id}`, data: s }));
    if (on.reports) (dep.reports || []).forEach(r => items.push({ path: `depts/${d}/reports/${r.date}`, data: r }));
    if (on.money) { (dep.expenses || []).forEach(x => items.push({ path: `depts/${d}/expenses/${x.id}`, data: x })); (dep.incomes || []).forEach(x => items.push({ path: `depts/${d}/incomes/${x.id}`, data: x })); }
    if (on.plan) { (dep.plans || []).forEach(x => items.push({ path: `depts/${d}/plans/${x.year}`, data: x })); (dep.events || []).forEach(x => items.push({ path: `depts/${d}/events/${x.id}`, data: x })); (dep.notices || []).forEach(x => items.push({ path: `depts/${d}/notices/${x.id}`, data: x })); }
    if (on.students) { (dep.officers || []).forEach(o => items.push({ path: `depts/${d}/officers/${o.id}`, data: o })); (dep.timeline || []).forEach(t => items.push({ path: `depts/${d}/timeline/${t.id}`, data: t })); (dep.retreats || []).forEach(r => items.push({ path: `depts/${d}/retreats/${r.id}`, data: r })); } // care(심방 명부)는 암호화가 필요해 부서 관리자 모드의 "과거 자료 가져오기"로만 넣음
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
  <div style="margin-bottom:14px">${patchBoard()}</div>
  <div class="hint info" style="margin-bottom:14px">PC에서는 작성·수정·출력 전부, 휴대폰에서는 메인·일정·보고서 열람·통계·멤버 연락처·출석 체크. 2026년 보고서는 HWP에서 변환해 넣었고, 2027년 1월부터 앱에서 직접 작성합니다.</div>
  <div class="steps">
    ${c ? `
    <div class="step"><div><h3>메인에서 제출 현황 보기</h3><p>지난 주일 보고서를 어느 부서가 냈는지, 출석·헌금이 얼마인지 한 표로 봅니다. 날짜를 바꿔 지난 주도 볼 수 있습니다.</p><div class="who">교육위원장 · 교육디렉터</div></div></div>
    <div class="step"><div><h3>공지와 공통 일정 올리기</h3><p>메인의 공지·공통 일정에 적으면 모든 부서 메인 화면과 주일 보고서 "이달 일정"에 나타납니다.</p><div class="who">교육위원장 · PC</div></div></div>
    <div class="step"><div><h3>월례회 전에 월간 보고서 열람</h3><p>월간 보고서 화면에서 부서를 고르면 그 달 보고서가 보입니다. 부서가 출력해 온 종이와 같은 내용입니다.</p><div class="who">교육위원회</div></div></div>
    <div class="step"><div><h3>장학 관리</h3><p>장학 메뉴에서 연도별 명단·금액·계좌를 봅니다. 계좌번호는 "계좌 보기"를 눌러야 보입니다. 후보 추가와 확정 처리도 여기서 합니다.</p><div class="who">교육위원회 · PC</div></div></div>
    <div class="step"><div><h3>한 달에 한 번: 자료 내려받기</h3><p><b>자료 내려받기</b>에서 전체 자료를 파일 하나로 받아 시놀로지에 보관합니다. 연말 결산이 끝나면 같은 화면에서 영수증 사진을 한꺼번에 지웁니다. <b>차량 신청</b>에서는 전 부서 신청과 겹침을 봅니다.</p><div class="who">교육위원회 · PC</div></div></div>
    <div class="step"><div><h3>데이터 가져오기</h3><p>변환된 초기 데이터 파일이나, 앞으로 정해진 양식의 자료를 올립니다. 처음 한 번만 하면 됩니다.</p><div class="who">관리자</div></div></div>
    ` : `
    <div class="step"><div><h3>연초에 한 번: 출석부와 연간 계획</h3><p><b>출석부</b>에서 반(또는 팸·학년) 편성, 학생, 교사·임원을 넣습니다. <b>연간계획서</b>에 표어·말씀·목표·행사표·예산안을 쓰고 "확정"을 누르면 메인 화면에 알려집니다. 다음 해 계획서는 10~11월에 연도를 바꿔 작성합니다.</p><div class="who">교역자 · 총무 — 11~12월 · PC</div>${mob ? '' : '<button class="btn s" data-go="roster">출석부 열기</button> <button class="btn s" data-go="plan">연간계획서 열기</button>'}</div></div>
    <div class="step"><div><h3>매주 주일: 출석 체크와 보고서</h3><p>예배 후 담임은 휴대폰 <b>출석 체크</b>에서 학생 이름을 누릅니다(한 번 출석, 두 번 온라인·본당, 세 번 결석). 총무는 PC <b>주일 보고서</b>에서 설교·헌금·회의 내용을 채웁니다. 남·여·합계·출석률은 앱이 셉니다.</p><div class="who">담임(휴대폰) · 총무(PC) — 예배 후 10분</div><button class="btn s" data-go="${mob ? 'attend' : 'weekly'}">${mob ? '출석 체크 열기' : '주일 보고서 열기'}</button></div></div>
    <div class="step"><div><h3>작성 완료 → PDF → 종이로 보고</h3><p>"작성 완료"를 누르면 보고서 모양 그대로 미리보기가 뜹니다. "PDF로 저장 / 인쇄"를 누르고 브라우저 인쇄 창에서 "PDF로 저장"을 고르면 됩니다. 지금처럼 부장에게 종이로 보고합니다.</p><div class="who">총무 → 부장 서명 · PC</div></div></div>
    <div class="step"><div><h3>지출이 생길 때마다: 회계</h3><p><b>회계</b>에서 "지출결의서 작성"으로 (기자재·교재·비품은 <b>물품대장</b>에 자동 등록) 날짜·항목·내역·금액을 넣고 결의서를 인쇄해 결재를 받습니다(영수증은 뒷면에). 월 합계, 누계, 예산 잔액, 집행률이 바로 계산됩니다. 찬조금·수련회처럼 잔액을 따로 보는 돈은 장부를 하나 더 만듭니다.</p><div class="who">회계 — 지출 당일 · PC</div>${mob ? '' : '<button class="btn s" data-go="ledger">회계 열기</button>'}</div></div>
    <div class="step"><div><h3>월말: 월간 보고서는 이미 만들어져 있습니다</h3><p><b>보고서 → 월간 보고서</b>를 열면 그 달 주일 보고서 4~5장과 회계가 모여 있습니다. 부장은 "다음 달 계획" 칸만 적고, 부장·총무·회계가 확인한 뒤 PDF로 출력해 교육위원회 월례회에 냅니다.</p><div class="who">부장 · 총무 · 회계 — 매월 마지막 주 · PC</div>${mob ? '' : '<button class="btn s" data-go="monthly">월간 보고서 열기</button>'}</div></div>
    <div class="step"><div><h3>심방 카드 (관리자 모드)</h3><p>왼쪽 <b>🔒 관리자 모드</b>를 누르고 부서 관리자 비밀번호(처음엔 교역자·부장이 정함)를 넣으면 <b>출석부 → 심방 카드</b>가 열립니다. 학생마다 가족·직장·상담 내용과 날짜별 심방 기록을 적고, 학생 카드의 <b>교회생활</b>과 함께 한 장으로 출력합니다. 기록은 그 비밀번호로 암호화되어 저장되므로 부서 비밀번호만으로는 볼 수 없고, 다른 부서나 교육위원회도 볼 수 없습니다. 비밀번호를 잊으면 복구할 수 없으니 담당자가 바뀔 때 "관리자 비밀번호 바꾸기"로 넘겨 주세요.</p><div class="who">교역자 · 부장 — 심방 후 · PC</div>${mob ? '' : '<button class="btn s" data-go="care">심방 카드 열기</button>'}</div></div>
    <div class="step"><div><h3>그때그때: 영수증 · 결석자 · 차량</h3><p>물건을 사면 휴대폰 <b>영수증</b>에서 사진을 찍어 올립니다. 날짜와 금액을 읽어 두었다가 PC 지출결의서에서 그 사진을 고르면 칸이 채워집니다(실물 영수증은 지금처럼 제출). 결석이 4주 이어지는 학생은 메인의 "챙길 일"과 <b>심방 카드</b>(관리자 모드) 맨 위 "먼저 챙길 학생"에 나타나고, 거기서 바로 카드를 열어 심방 기록을 적습니다. 교회 차량은 <b>차량 신청</b>에 올리면 다른 부서와 겹치는지 바로 보입니다. 새친구가 네 번 출석하면 메인에서 재적 전환을 알려 줍니다.</p><div class="who">회계 · 교역자 · 부장</div></div></div>
    <div class="step"><div><h3>가끔: 통계와 공지</h3><p><b>출석부 → 출석 통계</b>에서 기간(전체·6개월·3개월·1달)별 추이와 4주 연속 결석자를 보고, <b>출석부의 "제적" 탭</b>에서 오래 결석한 학생을 제적하거나 복적합니다. 청년부는 <b>회칙·총회</b>에서 회칙, 총회 정족수·결의권자·후보자, 회의록을 관리합니다. <b>메인</b>의 공지는 부서 교사들에게, 교육위원회 공지는 모든 부서에 보입니다.</p><div class="who">부장 · 교역자</div><button class="btn s" data-go="stats">출석 통계 열기</button></div></div>
    `}
  </div>
  <div class="card" style="margin-top:14px"><h2>변환 자료의 "!" 표시</h2><div class="note">HWP·엑셀에서 옮기면서 숫자가 안 맞거나 확인이 필요한 항목에는 <span class="tag flag">!</span>가 붙어 있습니다. 마우스를 올리면 내용이 보이고, 열어서 "확인했음"을 누르면 표시가 사라집니다.</div></div>`;
};

/* ───────────── 청년부: 교회생활(타임라인) ───────────── */
const TL_KINDS = { 등록: 'info', 새가족교육: 'info', 신급: 'ok', 임원: 'ok', 팸: 'mute', 목장: 'mute', 반: 'mute', 수련회: 'mute', 장학: 'ok', 제적: 'bad', 복귀: 'ok', 결혼: 'info', 군복무: 'warn', 유학: 'warn', 이사: 'warn', 심방: 'info', 기타: 'mute' };
const normName = n => String(n || '').replace(/\s/g, '').replace(/(권사|집사|목사|장로|전도사)$/, '');
function nameMatches(dd, s, ev) { // 이름이 같고, 둘 다 생년이 있으면 생년도 같아야 함
  if (normName(ev.name) !== normName(s.name)) return false;
  if (ev.birthYear && s.birth && String(ev.birthYear).length === 4 && ev.birthYear !== s.birth.slice(0, 4)) return false;
  if (ev.studentId && ev.studentId !== s.id) return false;
  return true;
}
function officersOf(dd, s) { // 연도별 임원 이력 (과거 자료 + 올해 교사·임원 명단)
  // '임원(직위 미상)'은 직위가 확인돼 더 쓰지 않음(예전 자료에 남아 있어도 무시). 찬양팀 직책은 '기드온 리더·인도자·부인도자'로 통일
  const rows = []; const add = (year, role, source, flags) => { role = canonRole(role); if (role && !rows.some(x => x.year === year && x.role === role)) rows.push({ year, role, source, flags }); };
  (dd.officers || []).filter(o => nameMatches(dd, s, o) && !/직위 미상/.test(o.role || '')).forEach(o => add(+o.year, o.role, o.source, o.flags || []));
  dd.doc.staff.filter(t => t.status !== 'left' && normName(t.name) === normName(s.name)).forEach(t => roleParts(t.role).forEach(r => add(YEAR, r, `${YEAR}년 교사·임원 명단`, [])));
  return rows.sort((a, b) => (+a.year - +b.year) || String(a.role).localeCompare(String(b.role), 'ko'));
}
function studentTimeline(dd, s) {
  const ev = (dd.timeline || []).filter(e => nameMatches(dd, s, e)).map(e => ({ ...e }));
  // 자동 생성: 올해 소속·상태, 연도별 출석 요약, 신급, 등록일
  if (s.joinDate) ev.push({ date: s.joinDate, kind: '등록', title: '청년부 첫 출석(등록)', note: '', auto: true, derived: true });
  if (s.newcomerDone) ev.push({ date: s.newcomerDone, kind: '새가족교육', title: '새가족반 수료', note: '', auto: true, derived: true });
  if (s.faith && s.faithYear) ev.push({ date: String(s.faithYear), kind: '신급', title: s.faith, note: s.faithHalf ? s.faithHalf + '반기' : '', auto: true, derived: true });
  if (s.married) ev.push({ date: s.marriedDate || '', kind: '결혼', title: '결혼', note: '청년부 회원 자격 종료 대상(회칙 4조) · 학생 카드의 "결혼"에서 고침', auto: true, derived: true });
  (s.statusLog || []).forEach(l => ev.push({ date: l.date || '', kind: l.to === 'left' ? '제적' : '복귀', title: l.to === 'left' ? `${l.kind || '제적'} 처리` : '복적', note: l.reason || '', auto: true, derived: true }));
  // 소속 표기: 청년부는 "팸", 나머지 부서(영유치·초등·중고등)는 "반" — 예) 중고등부 중1반
  (s.history || []).forEach(h => { const yg = h.dept === 'young'; const c = String(h.classId || '').trim(); const cl = !c ? '' : yg ? (+h.year >= 2027 ? c.replace(/\s*팸$/, ' 목장') : c) : /반$/.test(c) ? c : c + '반';
    ev.push({ date: String(h.year), kind: yg ? youngUnit(h.year) : '반', title: `${DEPTS[h.dept] || h.dept} ${cl}`.trim(), note: h.note || '', auto: true, derived: true }); });
  (s.scholarship || []).forEach(y => ev.push({ date: String(y), kind: '장학', title: `${y}년 장학생`, note: '', auto: true, derived: true }));
  const byYear = {}; Object.values(dd.reports).forEach(r => { const y = r.date.slice(0, 4); byYear[y] = byYear[y] || { n: 0, p: 0 }; byYear[y].n++; if ((r.att || {})[s.id]) byYear[y].p++; });
  Object.entries(byYear).forEach(([y, v]) => ev.push({ date: y + '-12-31', kind: '기타', title: `${y}년 출석 ${v.p}/${v.n}회 (${v.n ? Math.round(v.p / v.n * 100) : 0}%)`, note: '', auto: true, derived: true, att: true }));
  if (s.status === 'left' && !(s.statusLog || []).length) ev.push({ date: s.leftDate || '', kind: '제적', title: `현재 상태: ${s.leftKind || '제적'}`, note: s.leftReason || s.note || '', auto: true, derived: true });
  if (AWAY.includes(s.status)) ev.push({ date: '', kind: '기타', title: `현재 상태: ${statusName(s)}`, note: '', auto: true, derived: true });
  const hid = new Set(s.tlHidden || []); // 자동으로 만든 줄 중 "삭제"한 것은 학생 자료에 숨김 표시로 남긴다
  return ev.filter(e => !(e.derived && hid.has(tlKey(e)))).sort((a, b) => (a.date || '9999') < (b.date || '9999') ? -1 : 1);
}
const tlKey = e => [e.kind, e.date || '', e.title].join('|');
function timelineHTML(dd, s, edit) {
  const ev = studentTimeline(dd, s);
  return `<div class="card" style="margin-top:12px"><h2>교회생활 <span class="r">과거 자료와 올해 기록에서 자동으로 모은 것 + 직접 적은 것</span></h2>
    <div class="tl">${ev.map(e => `<div class="tl-row"><div class="tl-date">${esc((e.date || '').length === 4 ? e.date + '년' : fmtShort(e.date))}</div><div class="tl-dot ${TL_KINDS[e.kind] || 'mute'}"></div><div class="tl-body"><span class="pill ${TL_KINDS[e.kind] || 'mute'}">${esc(e.kind)}</span> ${esc(e.title)}${e.note ? `<div class="note">${esc(e.note)}</div>` : ''}${e.source && !e.derived ? `<div class="note" style="opacity:.7">출처: ${esc(e.source)}</div>` : ''}</div>${edit ? (e.derived ? `<button class="btn s d" data-tl-hide="${esc(tlKey(e))}">삭제</button>` : `<button class="btn s d" data-tl-del="${esc(e._id || e.id)}">삭제</button>`) : ''}</div>`).join('') || '<div class="note">기록이 없습니다.</div>'}</div>
    ${edit ? `<div class="row" style="margin-top:10px;flex-wrap:wrap"><input type="date" id="tl-date" style="width:auto"><select id="tl-kind" style="width:auto">${Object.keys(TL_KINDS).map(k => `<option>${k}</option>`).join('')}</select><input type="text" id="tl-title" placeholder="무슨 일 (예: 군 입대, 복학, 팸 이동)" style="flex:2"><input type="text" id="tl-note" placeholder="메모" style="flex:2"><button class="btn" id="tl-add">기록 추가</button></div><div class="note" style="margin-top:4px">여기 적는 기록은 청년부 계정 모두가 봅니다. 상담 내용처럼 민감한 것은 관리자 모드의 <b>심방 카드</b>에 적으세요.</div>` : ''}</div>`;
}
const fmtShort = d => d ? d.replace(/^(\d{4})-(\d{2})-(\d{2})$/, (m, y, mm, dd) => `${y}.${+mm}.${+dd}`) : '날짜 미상';
function bindHistory(dd, s) {
  const save = async msg => { await backend.set(`depts/${dd.id}/students/${s.id}`, s); S.sub.open = s.id; renderHere(); toast(msg); };
  const js = $('#hr-join-save'); if (js) js.onclick = () => { s.joinDate = $('#hr-join').value; save('등록일을 저장했습니다'); };
  const ad = $('#ha-add'); if (ad) ad.onclick = () => { const y = +$('#ha-year').value; if (!y) { toast('연도를 넣으세요'); return; } (s.history = s.history || []).push({ year: y, dept: dd.id, origDept: DEPTS[dd.id], classId: $('#ha-fam').value.trim(), note: $('#ha-note').value.trim() }); s.history.sort((a, b) => +a.year - +b.year); save('소속 이력을 추가했습니다'); };
  document.querySelectorAll('[data-h-del]').forEach(b => b.onclick = () => { const i = +b.dataset.hDel; const h = s.history[i]; if (!confirmInline(b, `${h.year} ${h.classId || ''} 이력을 지울까요?`)) return; s.history.splice(i, 1); save('소속 이력을 지웠습니다'); });
  document.querySelectorAll('[data-h-edit]').forEach(b => b.onclick = () => { const i = +b.dataset.hEdit; const h = s.history[i]; const tr = b.closest('tr');
    tr.innerHTML = `<td><input type="number" class="he-y" value="${esc(h.year)}" style="width:70px"></td><td>${esc(DEPTS[h.dept] || h.dept || '')}</td><td><input type="text" class="he-f" value="${esc(h.classId || '')}"></td><td><input type="text" class="he-n" value="${esc(h.note || '')}" placeholder="메모 (예: 4/19 등록)"></td><td class="hist-act"><button class="btn s p he-ok">저장</button><button class="btn s he-no">취소</button></td>`;
    tr.querySelector('.he-no').onclick = () => { S.sub.open = s.id; renderHere(); };
    tr.querySelector('.he-ok').onclick = () => { Object.assign(h, { year: +tr.querySelector('.he-y').value || h.year, classId: tr.querySelector('.he-f').value.trim(), note: tr.querySelector('.he-n').value.trim() }); s.history.sort((a, b) => +a.year - +b.year); save('소속 이력을 고쳤습니다'); }; });
}
// 버튼 자리에서 한 번 더 눌러 확인 (실수 방지): 처음 누르면 "정말?"으로 바뀌고 두 번째에 실행
function confirmInline(btn, title) { if (btn.dataset.armed) return true; btn.dataset.armed = '1'; const t = btn.textContent; btn.textContent = '한 번 더'; btn.title = title; setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = t; } }, 3000); return false; }
function bindTimeline(dd, s) {
  const a = $('#tl-add'); if (a) a.onclick = async () => { const kind = $('#tl-kind').value; const t = $('#tl-title').value.trim() || kind; if (!$('#tl-date').value && !$('#tl-title').value.trim()) { toast('날짜나 내용을 넣으세요'); return; } const e = { id: 'tl_' + uid(), name: s.name, studentId: s.id, birthYear: (s.birth || '').slice(0, 4), date: $('#tl-date').value, kind: $('#tl-kind').value, title: t, note: $('#tl-note').value.trim(), source: '앱 입력 ' + today(), auto: false }; await backend.set(`depts/${dd.id}/timeline/${e.id}`, e); dd.timeline.push({ _id: e.id, ...e }); if (kind === '등록' && e.date && !s.joinDate) { s.joinDate = e.date; await backend.set(`depts/${dd.id}/students/${s.id}`, s); } S.sub.open = s.id; renderHere(); toast('기록을 추가했습니다'); };
  document.querySelectorAll('[data-tl-hide]').forEach(b => b.onclick = async () => { s.tlHidden = [...new Set([...(s.tlHidden || []), b.dataset.tlHide])]; await backend.set(`depts/${dd.id}/students/${s.id}`, s); S.sub.open = s.id; renderHere(); toast('교회생활에서 지웠습니다'); });
  document.querySelectorAll('[data-tl-del]').forEach(b => b.onclick = async () => { const id = b.dataset.tlDel; await backend.del(`depts/${dd.id}/timeline/${id}`); dd.timeline = dd.timeline.filter(e => (e._id || e.id) !== id); S.sub.open = s.id; renderHere(); });
}

/* ───────────── 청년부: 심방 카드 (교역자·부장 전용) ───────────── */
// 가족: 심방 카드의 가족 기록이 없으면 출석부의 부·모·형제자매에서 표를 만듦 (이름 뒤 직분은 교회(직분) 칸으로)
const TITLE_RE = /\s*(목사|전도사|장로|권사|안수집사|집사|성도|청년)$/;
function familyRows(s) {
  const split = (v, rel) => { const t = String(v || '').trim(); if (!t) return null; const m = t.match(TITLE_RE); return { name: m ? t.slice(0, m.index).trim() : t, rel, birth: '', church: m ? m[1] : '', note: '' }; };
  const rows = [split(s.father, '부'), split(s.mother, '모')].filter(Boolean);
  sibs(s).forEach(n => { let where = ''; for (const d of Object.keys(DEPTS)) { const dd = S.data[d]; const x = dd && dd.students.find(y => y.name === n && y.status !== 'left'); if (x) { where = `${DEPTS[d]} ${(classOf(dd, x) || {}).name || x.classId || ''}`.trim(); break; } } rows.push({ name: n, rel: '형제자매', birth: '', church: where ? '본교회' : '', note: where }); });
  return rows;
}
// 지도 보기는 없앴다(주소를 외부 지도 서비스로 보내지 않음)
function mapToggle() { return ''; }
function careOf(dd, s) { return (dd.care || []).find(c => c._id === s.id) || (dd.care || []).find(c => normName(c.name) === normName(s.name) && (!c.birth || !s.birth || c.birth === s.birth)) || null; }
function careCardHTML(dd, s, c, forPrint) {
  const tl = studentTimeline(dd, s); const off = officersOf(dd, s);
  const famSaved = (c && c.family || []).filter(f => f.name || f.rel); const fam = famSaved.length ? famSaved : familyRows(s);
  const notes = (c && c.notes || []).slice().sort((a, b) => a.date < b.date ? 1 : -1);
  return `<div class="care-card">
    <div class="care-head"><div><div class="care-name">${esc(s.name)} <span class="note">${esc(s.sex)} · ${s.birth ? fmtShort(s.birth) + ' (만 ' + ageAt(s.birth, today()) + '세)' : '생년월일 미입력'} · ${esc((classOf(dd, s) || {}).name || s.classId || '')}</span></div><div class="note">${esc(faithLabel(s))}${c && c.faith && c.faith !== s.faith ? ' · 명부 신급: ' + esc(c.faith) : ''} · ${esc(phoneLabel(s))}</div></div><div class="note">${esc(statusName(s))}</div></div>
    <dl class="kvl"><dt>직장·학교</dt><dd>${esc(c && c.job || s.school || '')}</dd><dt>취미</dt><dd>${esc(c && c.hobby || '')}</dd><dt>주소</dt><dd>${esc(s.address || c && c.address || '')}${forPrint ? '' : mapToggle(s.address || c && c.address || '')}</dd><dt>청년부 첫 출석</dt><dd>${esc(s.joinDate || '')}</dd><dt>임원</dt><dd>${off.filter(o => roleKind(o.role) === '임원').map(o => `${o.year} ${esc(o.role)}`).join(', ')}</dd><dt>팀장·팸장</dt><dd>${off.filter(o => ['팀장', '팸장'].includes(roleKind(o.role))).map(o => `${o.year} ${esc(o.role)}`).join(', ')}</dd></dl>
    <h3>가족 ${famSaved.length ? '' : fam.length ? '<span class="note">출석부의 부모·형제 정보에서 가져옴 — 아래에서 고쳐 저장하면 이 표가 됩니다</span>' : ''}</h3><div class="tw"><table class="fam"><colgroup><col style="width:22%"><col style="width:13%"><col style="width:13%"><col style="width:20%"><col></colgroup><thead><tr><th>이름</th><th>관계</th><th>생년</th><th>교회(직분)</th><th>기타</th></tr></thead><tbody>${fam.map(f => `<tr><td>${esc(f.name)}</td><td>${esc(f.rel)}</td><td>${esc(f.birth)}</td><td>${esc(f.church)}</td><td class="wrap">${esc(f.note)}</td></tr>`).join('') || `<tr><td colspan="5" class="note">기록 없음</td></tr>`}</tbody></table></div>
    <h3>상담·참고 (명부)</h3><p class="care-text">${esc(c && c.counsel || '—')}</p>
    <h3>심방 기록 <span class="note">${notes.length}건</span></h3>
    <div class="list">${notes.map(n => `<div class="item"><div><div class="t">${fmtShort(n.date)} <span class="note">${esc(n.by || '')}${n.place ? ' · ' + esc(n.place) : ''}</span></div><div class="d care-text">${esc(n.text)}</div></div>${forPrint ? '' : `<button class="btn s d" data-note-del="${esc(n.id)}">삭제</button>`}</div>`).join('') || '<div class="note">아직 심방 기록이 없습니다.</div>'}</div>
    <h3>교회생활</h3><div class="tl compact">${tl.filter(e => !e.att).map(e => `<div class="tl-row"><div class="tl-date">${esc((e.date || '').length === 4 ? e.date + '년' : fmtShort(e.date))}</div><div class="tl-dot ${TL_KINDS[e.kind] || 'mute'}"></div><div class="tl-body"><span class="pill ${TL_KINDS[e.kind] || 'mute'}">${esc(e.kind)}</span> ${esc(e.title)}${e.note ? ` <span class="note">${esc(e.note)}</span>` : ''}</div></div>`).join('') || '<div class="note">기록 없음</div>'}</div>
    <div class="note" style="margin-top:6px">연도별 출석: ${tl.filter(e => e.att).map(e => esc(e.title.replace('년 출석 ', '년 '))).join(' · ') || '—'}</div>
  </div>`;
}
VIEWS.care = async () => {
  const dd = D();
  if (!isCare()) return `<div class="topbar"><div><h1>심방 카드 🔒</h1><div class="sub">${esc(dd.doc.name)} 관리자 모드에서만 보입니다</div></div></div><div class="card"><p>심방 카드(가족·직장·상담 내용·심방 기록)는 <b>${esc(dd.doc.name)} 관리자 비밀번호</b>로 암호화되어 저장됩니다. 부서 비밀번호만으로는 열 수 없고, 다른 부서나 교육위원회도 볼 수 없습니다.</p><div class="row" style="margin-top:10px"><button class="btn p" id="care-unlock">🔒 관리자 모드로 열기</button></div>${(dd.careRaw || []).some(c => c._id === '_verify') ? '' : '<div class="note" style="margin-top:8px">아직 관리자 비밀번호가 없습니다. 처음 여는 사람(교역자·부장)이 비밀번호를 정합니다.</div>'}</div>`;
  const show = S.sub.show || 'active';
  const list = dd.students.filter(s => show === 'all' ? true : show === 'active' ? (inRoll(s) || s.status === 'newcomer') : s.status === show).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  if (S.sub.print) { const s = dd.students.find(x => x.id === S.sub.print); return `<div class="topbar no-print"><div><h1>심방 카드 출력</h1><div class="sub">${esc(s.name)} · ${esc(dd.doc.name)} 관리자 모드 — 출력물 보관에 주의</div></div><div class="row"><button class="btn" id="cr-back">돌아가기</button><button class="btn p" id="cr-print">PDF로 저장 / 인쇄</button></div></div><section class="paper">${careCardHTML(dd, s, careOf(dd, s), true)}<div class="ft"><b>중앙성서교회 ${esc(dd.doc.name)} 심방 카드</b><span>관리자 모드 전용 · ${fmtK(today())}</span></div></section>`; }
  const lastNote = s => { const c = careOf(dd, s); const n = (c && c.notes || []).slice().sort((a, b) => a.date < b.date ? 1 : -1)[0]; return n ? n.date : ''; };
  const sorted = S.sub.sort === 'visit' ? list.slice().sort((a, b) => (lastNote(a) || '0') < (lastNote(b) || '0') ? -1 : 1) : list;
  return `<div class="topbar"><div><h1>심방 카드 <span class="pill info">${esc(dd.doc.name)} 관리자 모드</span></h1><div class="sub">학생 한 명의 교회생활·가족·상담 내용과 심방 기록. 이 부서 관리자 비밀번호로 암호화되어 저장됩니다.</div></div>
    <div class="row">${['active', 'left', 'all'].map(k => `<button class="btn s ${show === k ? 'p' : ''}" data-show="${esc(k)}">${{ active: '재적·새친구', left: '제적', all: '전체' }[k]}</button>`).join('')}<button class="btn s ${S.sub.sort === 'visit' ? 'p' : ''}" id="cr-sort">심방 오래된 순</button>${canEdit() ? `<button class="btn s" id="cr-import">과거 자료 가져오기</button><button class="btn s" id="cr-pw">관리자 비밀번호 바꾸기</button>` : ''}</div></div>
  <div class="stack">
    ${careNeedsCard(dd)}
    <details class="card"><summary><b>심방 카드 백업 · 복원</b> <span class="note">잠긴(암호화된) 상태 그대로 파일로 받고, 같은 관리자 비밀번호로만 다시 열립니다</span></summary>
      <div class="row" style="margin-top:8px"><button class="btn" id="cb-down">심방 카드 백업 내려받기 (${(dd.careRaw || []).length}건)</button><label class="btn s" style="cursor:pointer">백업 파일로 되돌리기<input type="file" id="cb-file" accept=".json,application/json" hidden></label></div>
      <div class="note" style="margin-top:6px">전체 백업(교육위원회)에는 심방 카드가 들어가지 않으므로, 부서 관리자가 이 단추로 따로 받아 둡니다. 비밀번호를 바꾸면 그 전 백업은 예전 비밀번호로만 열립니다.</div><pre class="progress" id="cb-log"></pre></details>
    <div class="card"><div class="tw"><table class="rtab"><thead><tr><th>이름</th><th>나이</th><th>${esc(dd.doc.classLabel || "반")}</th><th>직장·학교</th><th>최근 심방</th><th>최근 기록</th><th>명부</th><th></th></tr></thead><tbody>
    ${sorted.map(s => { const c = careOf(dd, s); const n = (c && c.notes || []).slice().sort((a, b) => a.date < b.date ? 1 : -1)[0]; const yr = Object.values(dd.reports).filter(r => r.date.startsWith(String(YEAR))); const p = yr.filter(r => (r.att || {})[s.id]).length;
      return `<tr class="click" data-care="${esc(s.id)}"><td>${esc(s.name)}</td><td>${s.birth ? '만 ' + ageAt(s.birth, today()) : '—'}</td><td class="note">${esc((classOf(dd, s) || {}).name || s.classId || '')}</td><td class="wrap note">${esc(c && c.job || s.school || '')}</td><td>${n ? fmtShort(n.date) : '<span class="pill warn">없음</span>'}</td><td class="wrap note">${esc(n ? n.text.slice(0, 50) : '')}</td><td>${c ? '<span class="pill ok">있음</span>' : '<span class="pill mute">없음</span>'}</td><td class="note">${YEAR} 출석 ${p}/${yr.length}</td></tr>`; }).join('')}
    </tbody></table></div></div>
    <div class="card"><h2>심방 자료 다루기</h2><div class="note">· 명부(직장·취미·가족·상담내용)는 ${dd.id === 'young' ? '2025년 팸원 명부에서 옮겨 왔고, 없는 사람은' : ''} 카드에서 직접 채웁니다.<br>· 심방 기록은 날짜·심방자·내용으로 쌓입니다. 기록은 관리자 비밀번호로 암호화되어 저장되므로 <b>비밀번호를 잊으면 아무도 복구할 수 없습니다</b>. 담당자가 바뀔 때 "관리자 비밀번호 바꾸기"로 넘겨 주세요.<br>· 출력물은 교역자·부장만 보관하고, 총회·보고서에는 쓰지 않습니다.</div></div>
  </div>`;
};
function careForm(dd, s, c) {
  c = c || { name: s.name, birth: s.birth || '', job: '', hobby: '', address: '', faith: '', counsel: '', family: [], notes: [], source: '앱 입력' };
  return `<h2>${esc(s.name)} 심방 카드<span class="row" style="float:right;gap:6px"><button class="btn s" id="cr-paper">출력</button><button class="btn s" id="modal-close">닫기</button></span></h2>
    ${careCardHTML(dd, s, c, false)}
    <div class="fields" style="margin-top:12px"><label class="f"><span>직장·학교</span><input type="text" id="cf-job" value="${esc(c.job || '')}"></label><label class="f"><span>취미</span><input type="text" id="cf-hobby" value="${esc(c.hobby || '')}"></label>
      <label class="f" style="grid-column:span 2"><span>상담·참고 (명부)</span><textarea id="cf-counsel">${esc(c.counsel || '')}</textarea></label>
      <label class="f" style="grid-column:span 2"><span>가족 (한 줄에 한 명: 이름 / 관계 / 생년 / 교회(직분) / 기타)</span><textarea id="cf-family" placeholder="홍길동 / 부 / 1970년생 / 본교회(집사) / 비고">${esc(((c.family || []).filter(f => f.name || f.rel).length ? c.family : familyRows(s)).map(f => [f.name, f.rel, f.birth, f.church, f.note].join(' / ')).join('\n'))}</textarea></label></div>
    <div class="row" style="margin-top:8px"><button class="btn p" id="cf-save">카드 저장</button></div>
    <h3 style="font-size:13px;margin:14px 0 6px">심방 기록 추가</h3><div class="row" style="flex-wrap:wrap"><input type="date" id="cn-date" value="${today()}" style="width:auto"><input type="text" id="cn-by" placeholder="심방자" style="width:120px"><input type="text" id="cn-place" placeholder="장소·방법 (식사, 전화…)" style="width:160px"></div><textarea id="cn-text" placeholder="만나서 나눈 내용, 기도 제목, 다음에 챙길 것" style="margin-top:6px"></textarea><div class="row" style="margin-top:6px"><button class="btn p" id="cn-add">기록 저장</button></div>`;
}
BIND.care = () => {
  const cbd = $('#cb-down'); if (cbd) cbd.onclick = async () => { const dd = D(); try { const raw = await backend.list(`depts/${dd.id}/care`); downloadText(`CBCS-심방카드-${dd.id}-${today()}.json`, JSON.stringify({ kind: 'cbcs-care-backup', schemaVersion: 1, dept: dd.id, generated: new Date().toISOString(), count: raw.length, docs: raw })); $('#cb-log').textContent = `${raw.length}건을 잠긴 상태 그대로 내려받았습니다. 시놀로지의 부서 관리자 폴더에 보관하세요.`; } catch (e) { $('#cb-log').textContent = '내려받기 실패: ' + (e.code || e.message); } };
  const cbf = $('#cb-file'); if (cbf) cbf.onchange = async () => { const dd = D(); const lg = $('#cb-log'); const f = cbf.files[0]; if (!f) return;
    try { const pay = JSON.parse(await f.text()); if (pay.kind !== 'cbcs-care-backup' || pay.dept !== dd.id || !Array.isArray(pay.docs)) throw new Error('이 부서의 심방 카드 백업 파일이 아닙니다');
      const ver = pay.docs.find(x => x._id === '_verify'); if (ver && S.careKey) { try { await decJSON(S.careKey, ver); } catch (e) { throw new Error('지금 관리자 비밀번호로 열리지 않는 백업입니다(다른 비밀번호로 만든 백업)'); } }
      let cur = []; try { cur = await backend.list(`depts/${dd.id}/care`); } catch (e) { throw new Error('지금 심방 카드를 읽지 못해 비교할 수 없습니다 — 다시 시도하세요'); }
      const have = new Set(cur.map(x => x._id)); const over = pay.docs.filter(x => have.has(x._id)).length;
      openModal(`<h2>심방 카드 되돌리기<button class="btn s" id="modal-close">닫기</button></h2><p>${esc((pay.generated || '').slice(0, 10))} 백업 ${pay.docs.length}건으로 <b>${over}건을 덮어쓰고 ${pay.docs.length - over}건을 새로 만듭니다.</b> 백업에 없는 지금 카드는 그대로 둡니다.</p><div class="row"><button class="btn d" id="cbr-yes">되돌리기</button><button class="btn" id="cbr-no">취소</button></div>`); $('#modal-close').onclick = closeModal; $('#cbr-no').onclick = closeModal;
      $('#cbr-yes').onclick = async () => { closeModal(); try { await backend.batchSet(pay.docs.map(({ _id, ...data }) => ({ path: `depts/${dd.id}/care/${_id}`, data }))); lg.textContent = `${pay.docs.length}건을 되돌렸습니다. 관리자 모드를 끝냈다가 다시 들어오면 반영됩니다.`; } catch (e) { lg.textContent = '되돌리기 실패: ' + (e.code || e.message); } };
    } catch (e) { lg.textContent = e.message || '파일을 읽지 못했습니다'; } };
  const dd = D(); const ul = $('#care-unlock'); if (ul) { ul.onclick = () => adminModeDialog(dd); return; }
  if (!isCare()) return;
  const pw = $('#cr-pw'); if (pw) pw.onclick = () => changeCarePassword(dd);
  const bk = $('#cr-back'); if (bk) { bk.onclick = () => { delete S.sub.print; render(); }; $('#cr-print').onclick = doPrint; return; }
  document.querySelectorAll('[data-show]').forEach(b => b.onclick = () => { S.sub.show = b.dataset.show; render(); });
  $('#cr-sort').onclick = () => { S.sub.sort = S.sub.sort === 'visit' ? '' : 'visit'; render(); };
  const im = $('#cr-import'); if (im) im.onclick = () => importYoungHistory(dd);
  bindCareNeeds(dd);
  const open = s => {
    let c = careOf(dd, s); openModal(careForm(dd, s, c));
    const saveCare = async (patch) => { if (!c) { c = { _id: s.id, name: s.name, birth: s.birth || '', job: '', hobby: '', address: '', faith: '', counsel: '', family: [], notes: [], source: '앱 입력' }; dd.care.push(c); } else if (c._id !== s.id) { dd.care = dd.care.filter(x => x !== c); c = { ...c, _id: s.id }; dd.care.push(c); } Object.assign(c, patch); await saveCareDoc(dd, s.id, c); };
    $('#cr-paper').onclick = () => { closeModal(); S.sub.print = s.id; render(); };
    $('#cf-save').onclick = async () => { const fam = $('#cf-family').value.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const [name = '', rel = '', birth = '', church = '', note = ''] = l.split('/').map(x => x.trim()); return { name, rel, birth, church, note }; }); await saveCare({ job: $('#cf-job').value.trim(), hobby: $('#cf-hobby').value.trim(), counsel: $('#cf-counsel').value.trim(), family: fam }); toast('저장했습니다'); open(s); };
    $('#cn-add').onclick = async () => { const t = $('#cn-text').value.trim(); if (!t) return; const notes = (c && c.notes || []).slice(); notes.push({ id: 'n_' + uid(), date: $('#cn-date').value || today(), by: $('#cn-by').value.trim(), place: $('#cn-place').value.trim(), text: t }); await saveCare({ notes }); toast('심방 기록을 저장했습니다'); open(s); };
    document.querySelectorAll('[data-note-del]').forEach(b => b.onclick = async () => { await saveCare({ notes: (c.notes || []).filter(n => n.id !== b.dataset.noteDel) }); open(s); });
  };
  document.querySelectorAll('[data-care]').forEach(tr => tr.onclick = () => open(dd.students.find(x => x.id === tr.dataset.care)));
};
// 과거 자료(young_history.json) 가져오기 — 교회생활·임원 이력·수련회는 청년부 자료로, 명부(care)는 심방 카드로
// 역대 회칙(tools/young_bylaws.py → young_bylaws.json) 가져오기: 없는 판은 새로 넣고, 이미 있는 판은 본문이 비어 있을 때만 본문을 채운다
function importYoungBylaws(dd) {
  openModal(`<h2>역대 회칙 가져오기<button class="btn s" id="modal-close">닫기</button></h2><p class="note">tools/young_bylaws.py로 만든 <b>young_bylaws.json</b>을 올립니다. 이전 판(2011~2025)·기드온 찬양팀 회칙이 판 목록에 들어가고, 현행 판은 본문이 비어 있을 때만 본문을 채웁니다. 이미 있는 판의 내용은 바꾸지 않습니다.</p><input type="file" id="yb-file" accept=".json,application/json"><pre class="progress" id="yb-log" style="margin-top:10px"></pre>`);
  $('#yb-file').onchange = async e => {
    const f = e.target.files[0]; if (!f) return; const log = m => { $('#yb-log').textContent += m + '\n'; };
    try { const d = JSON.parse(await f.text()); let added = 0, filled = 0, kept = 0;
      for (const x of d.bylaws || []) { const cur = dd.bylaws.find(b => b.id === x.id);
        if (x.textOnly) { if (cur && !(cur.text || '').trim()) { cur.text = x.text; await saveBylaw(dd, cur); filled++; } else kept++; continue; }
        if (cur) { if (!(cur.text || '').trim() && x.text) { cur.text = x.text; await saveBylaw(dd, cur); filled++; } else kept++; continue; }
        const { textOnly, ...n } = x; if (n.status === 'current') for (const o of dd.bylaws.filter(b => bylawKind(b) === bylawKind(n) && b.status === 'current')) { if (o.unsaved && !(o.text || '').trim()) dd.bylaws.splice(dd.bylaws.indexOf(o), 1); else { o.status = 'old'; await saveBylaw(dd, o); } }
        await saveBylaw(dd, n); dd.bylaws.push(n); added++; }
      log(`새 판 ${added} · 본문 채움 ${filled} · 그대로 둠 ${kept}`); (d._review || []).forEach(r => log('※ ' + r)); log('완료. 닫으면 판 목록에 보입니다.'); $('#modal-close').onclick = () => { closeModal(); render(); }; }
    catch (err) { log('실패: ' + (err.code || err.message)); }
  };
}
function importYoungHistory(dd) {
  openModal(`<h2>청년부 과거 자료 가져오기<button class="btn s" id="modal-close">닫기</button></h2><p class="note">tools/young_history.py로 만든 <b>young_history.json</b>을 올립니다. 임원 이력·교회생활·수련회는 청년부 자료에, 명부(직장·가족·상담내용)는 심방 카드에 들어갑니다. 같은 id는 덮어쓰고, 파일의 removeOfficers에 적힌 임원 이력은 지웁니다.</p><div class="row" style="margin-top:6px"><input type="file" id="yh-file" accept=".json,application/json"><button class="btn p" id="yh-go" disabled>가져오기 시작</button></div><pre class="progress" id="yh-log" style="margin-top:10px"></pre>`);
  let picked = null; const go = $('#yh-go');
  $('#yh-file').onchange = e => { picked = e.target.files[0] || null; go.disabled = !picked; $('#yh-log').textContent = picked ? `${picked.name} (${Math.round(picked.size / 1024).toLocaleString()}KB) — "가져오기 시작"을 누르면 올립니다.\n` : ''; };
  go.onclick = async () => {
    const f = picked; if (!f) return; go.disabled = true; go.textContent = '가져오는 중…'; const log = m => { $('#yh-log').textContent += m + '\n'; };
    try { const d = JSON.parse(await f.text()); const items = await youngHistoryItems(d, dd, true); log(`임원 ${(d.officers || []).length} · 교회생활 ${(d.timeline || []).length} · 수련회 ${(d.retreats || []).length} · 명부 ${(d.care || []).length} → 문서 ${items.length}개`);
      await backend.batchSet(items, (a, b) => { $('#yh-log').textContent = $('#yh-log').textContent.replace(/\n진행.*$/, '') + `\n진행 ${a}/${b}`; });
      const rm = d.removeOfficers || []; for (const id of rm) await backend.del(`depts/${dd.id}/officers/${id}`); if (rm.length) log(`예전 자료에서 잘못 들어간 임원 이력 ${rm.length}건 삭제`);
      log('완료. 새로고침하면 반영됩니다.'); (d._review || []).forEach(r => log('※ ' + r)); S.data = {}; }
    catch (err) { log('실패: ' + (err.code || err.message)); go.disabled = false; }
    go.textContent = '가져오기 시작';
  };
}
async function youngHistoryItems(d, dd, withCare) {
  const items = []; const dept = (dd && dd.id) || 'young';
  (d.officers || []).forEach(o => items.push({ path: `depts/${dept}/officers/${o.id}`, data: o }));
  (d.timeline || []).forEach(t => items.push({ path: `depts/${dept}/timeline/${t.id}`, data: t }));
  (d.retreats || []).forEach(r => items.push({ path: `depts/${dept}/retreats/${r.id}`, data: r }));
  if (withCare && S.careKey && S.careDept === dept) for (const c of (d.care || [])) { const s = dd.students.find(x => normName(x.name) === normName(c.name) && (!c.birth || !x.birth || x.birth === c.birth)); const id = s ? s.id : `${dept}_${c.name}_${c.birth || 'x'}`; const obj = { ...c, notes: c.notes || [], studentId: s ? s.id : '' }; items.push({ path: `depts/${dept}/care/${id}`, data: await encryptCare(obj) }); const i = dd.care.findIndex(x => x._id === id); const rec = { _id: id, ...obj }; if (i >= 0) dd.care[i] = rec; else dd.care.push(rec); }
  return items;
}

/* ───────────── 부서 관리자 모드: 심방 카드 암호화 (WebCrypto, 비밀번호 → PBKDF2 → AES-GCM) ───────────── */
const b64e = u8 => btoa(String.fromCharCode(...u8)); const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function deriveCareKey(pw, saltB64) { const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']); return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64d(saltB64), iterations: 200000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); }
async function encJSON(key, obj) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj))); return { iv: b64e(iv), data: b64e(new Uint8Array(ct)) }; }
async function decJSON(key, blob) { const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(blob.iv) }, key, b64d(blob.data)); return JSON.parse(new TextDecoder().decode(pt)); }
async function encryptCare(obj, key) { const { _id, ...plain } = obj; const e = await encJSON(key || S.careKey, plain); return { enc: 'aes-gcm-v1', name: plain.name || '', studentId: plain.studentId || '', updated: today(), ...e }; }
async function decryptCare(dd) { // dd.careRaw(암호문) → dd.care(평문). 열쇠가 안 맞는 문서는 건너뜀
  const out = []; for (const r of dd.careRaw || []) { if (r._id === '_verify') continue; if (r.enc) { try { out.push({ _id: r._id, ...(await decJSON(S.careKey, r)) }); } catch (e) { console.warn('심방 카드 복호화 실패', r._id); } } else out.push(r); } dd.care = out;
}
async function saveCareDoc(dd, id, obj) { const data = await encryptCare(obj); await backend.set(`depts/${dd.id}/care/${id}`, data); const i = (dd.careRaw || []).findIndex(x => x._id === id); const raw = { _id: id, ...data }; if (i >= 0) dd.careRaw[i] = raw; else (dd.careRaw = dd.careRaw || []).push(raw); }
function adminModeDialog(dd) {
  const ver = (dd.careRaw || []).find(c => c._id === '_verify');
  if (!ver) { // 처음: 비밀번호 정하기
    openModal(`<h2>${esc(dd.doc.name)} 관리자 비밀번호 정하기<button class="btn s" id="modal-close">닫기</button></h2><p class="note">심방 카드를 처음 여는 교역자·부장이 정합니다. 이 비밀번호로 심방 기록이 암호화되므로 <b>잊으면 복구할 수 없습니다</b>. 부서 비밀번호와 다르게 정하세요.</p><div class="stack" style="margin-top:8px"><input type="password" id="am-pw" placeholder="관리자 비밀번호 (8자 이상)"><input type="password" id="am-pw2" placeholder="한 번 더"><div id="am-err" class="note" style="color:var(--bad)" hidden></div><button class="btn p" id="am-go">정하고 관리자 모드 열기</button></div>`);
    $('#am-go').onclick = async () => { const a = $('#am-pw').value, b = $('#am-pw2').value; const el = $('#am-err'); if (a.length < 8) { el.hidden = false; el.textContent = '8자 이상으로 정하세요.'; return; } if (a !== b) { el.hidden = false; el.textContent = '두 번 입력한 비밀번호가 다릅니다.'; return; } const salt = b64e(crypto.getRandomValues(new Uint8Array(16))); const key = await deriveCareKey(a, salt); const check = await encJSON(key, { ok: true }); const v = { salt, ...check, set: today() }; await backend.set(`depts/${dd.id}/care/_verify`, v); (dd.careRaw = dd.careRaw || []).push({ _id: '_verify', ...v }); S.careKey = key; S.careDept = dd.id; await decryptCare(dd); closeModal(); S.view = 'care'; render(); toast('관리자 모드'); };
    return;
  }
  openModal(`<h2>${esc(dd.doc.name)} 관리자 모드<button class="btn s" id="modal-close">닫기</button></h2><p class="note">관리자 비밀번호를 넣으면 이 부서의 심방 카드가 열립니다. 브라우저를 닫거나 "나가기"를 누르면 다시 잠깁니다.</p><div class="stack" style="margin-top:8px"><input type="password" id="am-pw" placeholder="관리자 비밀번호" autocomplete="off"><div id="am-err" class="note" style="color:var(--bad)" hidden></div><button class="btn p" id="am-go">열기</button></div>`);
  const go = async () => { try { const key = await deriveCareKey($('#am-pw').value, ver.salt); await decJSON(key, ver); S.careKey = key; S.careDept = dd.id; await decryptCare(dd); closeModal(); S.view = 'care'; render(); toast('관리자 모드'); } catch (e) { const el = $('#am-err'); el.hidden = false; el.textContent = '비밀번호가 맞지 않습니다.'; } };
  $('#am-go').onclick = go; $('#am-pw').onkeydown = e => { if (e.key === 'Enter') go(); }; $('#am-pw').focus();
}
function changeCarePassword(dd) {
  openModal(`<h2>관리자 비밀번호 바꾸기<button class="btn s" id="modal-close">닫기</button></h2><p class="note">모든 심방 카드를 새 비밀번호로 다시 암호화합니다 (${(dd.care || []).length}건).</p><div class="stack" style="margin-top:8px"><input type="password" id="am-pw" placeholder="새 비밀번호 (8자 이상)"><input type="password" id="am-pw2" placeholder="한 번 더"><div id="am-err" class="note" style="color:var(--bad)" hidden></div><button class="btn p" id="am-go">바꾸기</button></div>`);
  $('#am-go').onclick = async () => { const a = $('#am-pw').value, b = $('#am-pw2').value; const el = $('#am-err'); if (a.length < 8 || a !== b) { el.hidden = false; el.textContent = a.length < 8 ? '8자 이상으로 정하세요.' : '두 번 입력한 비밀번호가 다릅니다.'; return; } const salt = b64e(crypto.getRandomValues(new Uint8Array(16))); const key = await deriveCareKey(a, salt); const items = [{ path: `depts/${dd.id}/care/_verify`, data: { salt, ...(await encJSON(key, { ok: true })), set: today() } }]; for (const c of dd.care) items.push({ path: `depts/${dd.id}/care/${c._id}`, data: await encryptCare(c, key) }); await backend.batchSet(items); S.careKey = key; dd.careRaw = items.map(it => ({ _id: it.path.split('/').pop(), ...it.data })); closeModal(); render(); toast('관리자 비밀번호를 바꿨습니다'); };
}


/* ═════════════ 추가 기능: 영수증 · 결석자 챙기기 · 자료 내려받기 · 생일/새친구 · 형제자매 · 예산 대비 · 차량 ═════════════ */
/* 필요할 때만 불러오는 부서 자료 (dd[key]에 보관, 새로고침하면 다시 읽음) */
async function lazy(dd, key, path) {
  if (!dd[key]) { try { dd[key] = (await backend.list(path)).map(x => ({ ...x, id: x.id || x._id })); dd[key + 'Err'] = ''; } catch (e) { console.warn(key, e); dd[key] = []; dd[key + 'Err'] = e.code || e.message || '읽기 실패'; } }
  return dd[key];
}
const deptLabel = d => DEPTS[d] || (d === 'committee' ? '교육위원회' : d || '');
const byDateDesc = (a, b) => (a.date || '') < (b.date || '') ? 1 : -1;
/* 부서 공통으로 읽는 자료(차량·형제자매 색인·내려받기 기록). S.committee에 붙여 두어 새로고침·로그아웃 때 함께 비워진다 */
async function loadShared(dd) {
  const c = await loadCommittee();
  if (!c.vehicles) { try { c.vehicles = (await backend.list('vehicles')).map(x => ({ ...x, id: x.id || x._id })); c.vehiclesErr = ''; } catch (e) { c.vehicles = []; c.vehiclesErr = e.code || e.message || '읽기 실패'; } }
  if (!c.sib) { try { c.sib = await backend.list('siblings'); c.sibErr = ''; } catch (e) { c.sib = []; c.sibErr = e.code || e.message || '읽기 실패'; } }
  if (isCommittee() && c.backupMeta === undefined) { try { c.backupMeta = await backend.get('meta/backup'); } catch (e) { c.backupMeta = null; } }
  if (dd) await loadReceipts(dd);
  return c;
}
const RULES_HINT = '<div class="hint">이 기능은 보안 규칙을 한 번 새로 게시해야 켜집니다. Firebase 콘솔 → Firestore → 규칙 탭에 저장소의 firestore.rules 내용을 붙여넣고 게시해 주세요.</div>';

/* ───────────── 영수증 사진 (글자 인식 → 지출결의서) ─────────────
   실물 영수증 제출이 원칙. 사진은 날짜·금액 입력을 돕는 용도이며 연말 결산 뒤 교육위원회가 한꺼번에 지운다.
   depts/{d}/receipts/{id}    날짜·금액·상호·메모 (가벼움)
   depts/{d}/receiptImgs/{id} 줄인 사진 한 장 (볼 때만 읽음) */
const loadReceipts = dd => lazy(dd, 'receipts', `depts/${dd.id}/receipts`);
const usedReceiptIds = dd => new Set(dd.expenses.map(e => e.receiptId).filter(Boolean));
const pendingReceipts = dd => { const used = usedReceiptIds(dd); return (dd.receipts || []).filter(r => !used.has(r.id)).sort(byDateDesc); };
async function shrinkImage(file, max, q) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('사진을 열 수 없습니다. JPG나 PNG로 다시 찍어 주세요.')); i.src = url; });
    const draw = (mx, qq) => { const k = Math.min(1, mx / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k)); const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', qq); };
    let out = draw(max, q); if (out.length > 600000) out = draw(Math.round(max * .75), Math.max(.4, q - .15)); if (out.length > 900000) out = draw(800, .4);
    return out;
  } finally { URL.revokeObjectURL(url); }
}
let ocrLib = null;
async function readReceiptText(dataUrl, onStep) {
  if (!ocrLib) ocrLib = new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'; s.onload = () => window.Tesseract ? ok(window.Tesseract) : no(new Error('글자 인식 도구를 불러오지 못했습니다')); s.onerror = () => no(new Error('글자 인식 도구를 불러오지 못했습니다(인터넷 연결 확인)')); document.head.appendChild(s); });
  let T; try { T = await ocrLib; } catch (e) { ocrLib = null; throw e; }
  const w = await T.createWorker('kor+eng', 1, { logger: m => { if (onStep && m.status === 'recognizing text') onStep(Math.round((m.progress || 0) * 100)); } });
  try { const { data } = await w.recognize(dataUrl); return data.text || ''; } finally { try { await w.terminate(); } catch (e) {} }
}
function parseReceipt(text) {
  const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean);
  const out = { date: '', amount: 0, vendor: '', sure: false };
  const okDate = (y, m, d) => y >= YEAR - 1 && y <= YEAR + 1 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
  for (const l of lines) {
    let x = /(20\d{2})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/.exec(l);
    if (x && okDate(+x[1], +x[2], +x[3])) { out.date = `${x[1]}-${pad2(+x[2])}-${pad2(+x[3])}`; break; }
    x = /(?:^|[^\d])(\d{2})[-./](\d{1,2})[-./](\d{1,2})(?:[^\d]|$)/.exec(l);
    if (x && okDate(2000 + +x[1], +x[2], +x[3])) { out.date = `${2000 + +x[1]}-${pad2(+x[2])}-${pad2(+x[3])}`; break; }
  }
  const nums = l => [...l.replace(/(\d)\s+(?=[,.]\d{3})/g, '$1').matchAll(/\d{1,3}(?:[,.]\d{3})+|\d{3,8}/g)].map(x => +x[0].replace(/[,.]/g, '')).filter(n => n >= 100 && n < 100000000);
  const KEY = /(합\s*계|총\s*액|총\s*금\s*액|결\s*제\s*금\s*액|받\s*을\s*금\s*액|판\s*매\s*합\s*계|승\s*인\s*금\s*액|청\s*구\s*금\s*액|총\s*결\s*제|총\s*구\s*매|total)/i;
  const SKIP = /(부가세|과세|면세|공급가|거스름|받은\s*돈|받은\s*금액|사업자|전화|tel|카드\s*번호|승인\s*번호|가맹점|단말기|포인트|주소|대표)/i;
  const keyed = [];
  lines.forEach((l, i) => { if (!KEY.test(l) || /부가세|면세|과세\s*물품|공급가/.test(l)) return; let n = nums(l); if (!n.length && lines[i + 1] && !SKIP.test(lines[i + 1])) n = nums(lines[i + 1]); keyed.push(...n); });
  if (keyed.length) { out.amount = Math.max(...keyed); out.sure = true; }
  else { const all = lines.filter(l => !SKIP.test(l) && !/20\d{2}\s*[-./년]/.test(l) && !/\d{2,4}-\d{2,4}-\d{4,5}/.test(l)).flatMap(nums); if (all.length) out.amount = Math.max(...all); }
  const v = lines.slice(0, 6).find(l => /[가-힣A-Za-z]{2,}/.test(l) && !/(영수증|receipt|매출\s*전표|신용|고객용|주문\s*번호|\[)/i.test(l) && !SKIP.test(l) && l.length <= 30);
  if (v) out.vendor = v.replace(/[^\w가-힣()&·.\- ]/g, '').trim();
  return out;
}
/* 사진 한 장을 줄이고, 글자를 읽어 값을 돌려준다. 읽기에 실패해도 사진과 빈 값은 돌려준다 */
async function processReceiptFile(file, say) {
  say('사진 줄이는 중…');
  const img = await shrinkImage(file, 1280, .6);
  let parsed = { date: '', amount: 0, vendor: '', sure: false }, err = '';
  try { say('글자 읽는 중… (처음 한 번은 20~30초 걸립니다)'); const big = await shrinkImage(file, 1800, .8); parsed = parseReceipt(await readReceiptText(big, p => say(`글자 읽는 중… ${p}%`))); }
  catch (e) { console.warn('영수증 인식 실패', e); err = /load|network|불러오지/i.test(String((e && e.message) || e)) ? '인터넷 연결이 약해 인식 도구를 받지 못했습니다' : '사진이 흐리거나 글자가 작습니다'; }
  return { img, parsed, err };
}
async function saveReceipt(dd, rec, img) {
  await backend.set(`depts/${dd.id}/receiptImgs/${rec.id}`, { id: rec.id, img, at: rec.at });
  await backend.set(`depts/${dd.id}/receipts/${rec.id}`, rec);
  (dd.receipts = dd.receipts || []).push(rec);
}
async function deleteReceipt(dd, id) { await backend.del(`depts/${dd.id}/receiptImgs/${id}`); await backend.del(`depts/${dd.id}/receipts/${id}`); dd.receipts = (dd.receipts || []).filter(r => r.id !== id); }
async function showReceiptImage(dd, id) {
  openModal(`<h2>영수증 사진<button class="btn s" id="modal-close">닫기</button></h2><div class="note" id="rcv-st">불러오는 중…</div><div id="rcv-img"></div><div class="note" style="margin-top:8px">증빙은 실물 영수증입니다. 이 사진은 연말 결산 뒤 지워집니다.</div>`);
  try { const d = await backend.get(`depts/${dd.id}/receiptImgs/${id}`); if (!$('#rcv-st')) return; if (d && d.img) { $('#rcv-st').textContent = ''; const im = document.createElement('img'); im.src = d.img; im.alt = '영수증 사진'; im.className = 'rc-full'; $('#rcv-img').appendChild(im); } else $('#rcv-st').textContent = '사진이 이미 지워졌습니다(결산 완료).'; }
  catch (e) { if ($('#rcv-st')) $('#rcv-st').textContent = '사진을 불러오지 못했습니다: ' + (e.code || e.message); }
}
const receiptLine = r => `${r.date ? r.date.slice(5).replace('-', '/') : '날짜 미상'} · ${won(r.amount)}원${r.vendor ? ' · ' + esc(r.vendor) : ''}${r.memo ? ' · ' + esc(r.memo) : ''}`;
function receiptCell(dd, e) {
  const has = e.receiptId && (dd.receipts || []).some(r => r.id === e.receiptId);
  return `<td class="c">${e.receipt ? '○' : '—'}${has ? ` <button class="btn link" data-rcv="${esc(e.receiptId)}" title="영수증 사진 보기">사진</button>` : ''}</td>`;
}
function bindReceiptView(dd) { document.querySelectorAll('[data-rcv]').forEach(b => b.onclick = ev => { ev.stopPropagation(); showReceiptImage(dd, b.dataset.rcv); }); }
/* 지출결의서 작성 화면 아래의 영수증 칸 (PC) */
function receiptPicker(dd, e) {
  const pend = pendingReceipts(dd); const cur = e.receiptId && (dd.receipts || []).find(r => r.id === e.receiptId);
  const opts = [...(cur ? [cur] : []), ...pend];
  return `<div class="rc-box"><h3 style="font-size:13px;margin:0 0 6px">영수증 사진 <span class="note" style="font-weight:400">찍어 둔 사진을 고르면 날짜·금액·받는 곳이 채워집니다. 맞는지 꼭 확인하세요.</span></h3>
    <div class="row"><select id="v-receipt" style="flex:1;min-width:200px"><option value="">(사진 없음)</option>${opts.map(r => `<option value="${esc(r.id)}" ${cur && cur.id === r.id ? 'selected' : ''}>${receiptLine(r)}</option>`).join('')}</select>
      <label class="btn" for="v-photo">새 사진 고르기</label><input type="file" id="v-photo" accept="image/*" hidden><button type="button" class="btn s" id="v-rc-view">사진 보기</button></div>
    <div class="note" id="v-rc-st" style="margin-top:6px">${pend.length ? `휴대폰으로 올린 영수증 ${pend.length}장이 기다리고 있습니다.` : '휴대폰 메뉴의 "영수증"에서 찍어 올리면 여기에 나타납니다.'} 실물 영수증은 결의서 뒷면에 붙여 제출합니다. 사진은 연말 결산 뒤 지워집니다.</div></div>`;
}
function fillVoucherFromReceipt(r) {
  if (!r) return; const got = [];
  if (r.date && $('#v-date')) { $('#v-date').value = r.date; got.push('날짜'); }
  const rows = document.querySelectorAll('#v-items tbody tr');
  if (r.amount && rows.length === 1) { const a = rows[0].querySelector('.vi-amt'); const q = rows[0].querySelector('.vi-qty'), p = rows[0].querySelector('.vi-price'); if (!(+q.value && +p.value)) { a.value = r.amount; a.dispatchEvent(new Event('input')); got.push('금액'); } }
  if (r.vendor && $('#v-payto') && !$('#v-payto').value.trim()) { $('#v-payto').value = r.vendor; got.push('받는 곳'); }
  if (r.memo && $('#v-desc') && !$('#v-desc').value.trim()) { $('#v-desc').value = r.memo; got.push('적요'); const d0 = rows[0] && rows[0].querySelector('.vi-desc'); if (d0 && !d0.value.trim()) d0.value = r.memo; }
  if ($('#v-rc')) $('#v-rc').value = '1';
  const st = $('#v-rc-st'); if (st) st.textContent = got.length ? `사진에서 채운 칸: ${got.join(', ')} — 실제 영수증과 맞는지 확인하세요.` : '사진을 연결했습니다. 읽은 값이 없어 직접 입력해 주세요.';
}
function bindReceiptPicker() {
  const sel = $('#v-receipt'); if (!sel) return; const dd = D();
  sel.onchange = () => fillVoucherFromReceipt((dd.receipts || []).find(r => r.id === sel.value));
  $('#v-rc-view').onclick = () => { if (sel.value) showReceiptImage(dd, sel.value); else toast('고른 사진이 없습니다'); };
  $('#v-photo').onchange = async ev => {
    const f = ev.target.files[0]; if (!f) return; const st = $('#v-rc-st'); const say = m => { if (st) st.textContent = m; };
    try {
      const { img, parsed, err } = await processReceiptFile(f, say);
      const rec = { id: 'r_' + uid(), at: today(), date: parsed.date || '', amount: parsed.amount || 0, vendor: parsed.vendor || '', memo: '', sure: !!parsed.sure };
      await saveReceipt(dd, rec, img);
      const o = document.createElement('option'); o.value = rec.id; o.innerHTML = receiptLine(rec); sel.appendChild(o); sel.value = rec.id; fillVoucherFromReceipt(rec);
      if (err && st) st.textContent = `사진은 올렸지만 글자를 읽지 못했습니다(${err}). 날짜와 금액을 직접 넣어 주세요.`;
    } catch (e) { say('사진을 올리지 못했습니다: ' + (e.code || e.message)); }
    ev.target.value = '';
  };
}
/* 휴대폰 "영수증" 화면: 찍어서 올려 두면 PC 지출결의서에서 골라 쓴다 */
VIEWS.receipt = async () => {
  const dd = D(); await loadReceipts(dd); const pend = pendingReceipts(dd); const d = S.sub.draft;
  return `<div class="topbar"><div><h1>영수증 올리기</h1><div class="sub">사진을 찍으면 날짜와 금액을 읽어 둡니다. 지출결의서는 PC 회계 화면에서 이 사진을 골라 씁니다.</div></div></div>
  <div class="stack">
    <div class="hint info">실물 영수증은 지금처럼 결의서에 붙여 제출합니다. 사진은 입력을 돕는 용도이고, 연말 결산이 끝나면 지워집니다.</div>
    ${dd.receiptsErr ? `<div class="hint">영수증 목록을 읽지 못했습니다: ${esc(dd.receiptsErr)}</div>` : ''}
    <div class="card"><h2>${d ? '읽은 내용 확인' : '사진 찍기'}</h2>
      ${d ? `<img class="rc-prev" src="${d.img}" alt="찍은 영수증">
        ${d.err ? `<div class="hint" style="margin-top:8px">글자를 읽지 못했습니다(${esc(d.err)}). 아래 칸에 직접 적어 주세요.</div>` : `<div class="note" style="margin-top:8px">${d.sure ? '합계 줄에서 금액을 읽었습니다.' : '합계 줄을 찾지 못해 가장 큰 숫자를 넣었습니다.'} 틀린 곳은 고쳐 주세요.</div>`}
        <div class="fields" style="margin-top:10px"><label class="f"><span>날짜</span><input type="date" id="rc-date" value="${esc(d.date || '')}"></label><label class="f"><span>금액</span><input type="number" id="rc-amount" inputmode="numeric" value="${d.amount || ''}"></label><label class="f"><span>산 곳</span><input type="text" id="rc-vendor" value="${esc(d.vendor || '')}"></label><label class="f"><span>무엇을 샀는지</span><input type="text" id="rc-memo" placeholder="예: 10월 생일 간식" value="${esc(d.memo || '')}"></label></div>
        <div class="row" style="margin-top:10px"><button class="btn p" id="rc-save">올려 두기</button><button class="btn" id="rc-cancel">다시 찍기</button></div>`
      : `<div class="row"><label class="btn p" for="rc-file">영수증 사진 찍기 / 고르기</label><input type="file" id="rc-file" accept="image/*" capture="environment" hidden></div><div class="note" id="rc-st" style="margin-top:8px">영수증 전체가 화면에 들어오게, 밝은 곳에서 반듯하게 찍어 주세요.</div>`}
    </div>
    <div class="card"><h2>기다리는 영수증 <span class="r">${pend.length}장 · 결의서에 연결되면 여기서 빠집니다</span></h2><div class="list">${pend.map(r => `<div class="item"><div><div class="t">${won(r.amount)}원 <span class="note">${esc(r.date || '날짜 미상')}</span></div><div class="d">${esc([r.vendor, r.memo].filter(Boolean).join(' · ') || '메모 없음')}</div></div><span class="row" style="gap:4px"><button class="btn s" data-rcv="${esc(r.id)}">보기</button><button class="btn s d" data-rc-del="${esc(r.id)}">삭제</button></span></div>`).join('') || '<div class="note">기다리는 영수증이 없습니다.</div>'}</div></div>
  </div>`;
};
BIND.receipt = () => {
  const dd = D(); bindReceiptView(dd);
  document.querySelectorAll('[data-rc-del]').forEach(b => b.onclick = async () => { try { await deleteReceipt(dd, b.dataset.rcDel); render(); toast('삭제했습니다'); } catch (e) { toast('삭제 실패: ' + (e.code || e.message), 4000); } });
  const f = $('#rc-file'); if (f) f.onchange = async ev => {
    const file = ev.target.files[0]; if (!file) return; const say = m => { const st = $('#rc-st'); if (st) st.textContent = m; };
    try { const { img, parsed, err } = await processReceiptFile(file, say); S.sub.draft = { img, date: parsed.date || today(), amount: parsed.amount || 0, vendor: parsed.vendor || '', memo: '', sure: !!parsed.sure, err }; if (S.view === 'receipt') render(); }
    catch (e) { say('사진을 처리하지 못했습니다: ' + (e.message || e)); }
  };
  const sv = $('#rc-save'); if (sv) sv.onclick = async () => {
    const d = S.sub.draft; const rec = { id: 'r_' + uid(), at: today(), date: $('#rc-date').value, amount: +$('#rc-amount').value || 0, vendor: $('#rc-vendor').value.trim(), memo: $('#rc-memo').value.trim(), sure: !!d.sure };
    sv.disabled = true; try { await saveReceipt(dd, rec, d.img); delete S.sub.draft; render(); toast('올려 두었습니다 — PC 회계에서 결의서를 쓰세요', 3200); } catch (e) { sv.disabled = false; toast('올리지 못했습니다: ' + (e.code || e.message), 4000); }
  };
  const cc = $('#rc-cancel'); if (cc) cc.onclick = () => { delete S.sub.draft; render(); };
};

/* ───────────── 결석자 → 심방 카드 ─────────────
   심방 기록 자체는 관리자 모드의 심방 카드(암호화)에 적는다. 여기서는 "누구를 먼저 챙길지"만 찾아 그 카드로 이어 준다.
   학생의 watch 표시(관심 학생)는 내용 없이 표시만 남는다. */
function absent4(dd) { // 이름별 출석이 적힌 최근 주일 보고서 4장에 모두 빠진 재적 학생
  const last4 = namedReports(dd).filter(r => r.date.startsWith(String(YEAR))).slice(-4); if (last4.length < 4) return [];
  return activeStudents(dd).filter(s => !s_excused(s) && last4.every(r => !(r.att || {})[s.id]));
}
const lastCareNote = (dd, s) => { const c = careOf(dd, s); return ((c && c.notes) || []).slice().sort(byDateDesc)[0] || null; };
function careNeeds(dd) {
  const map = new Map(); const add = (s, why) => { if (!map.has(s.id)) map.set(s.id, { s, why: [] }); map.get(s.id).why.push(why); };
  absent4(dd).forEach(s => add(s, '4주 연속 결석'));
  dd.students.filter(s => s.status === 'longabsent').forEach(s => add(s, '장기결석'));
  dd.students.filter(s => s.watch && s.status !== 'left').forEach(s => add(s, '관심 학생'));
  return [...map.values()].map(x => ({ ...x, last: lastCareNote(dd, x.s) })).sort((a, b) => ((a.last || {}).date || '') < ((b.last || {}).date || '') ? -1 : 1);
}
function careNeedsCard(dd) { // 심방 카드 화면(관리자 모드) 맨 위
  const needs = careNeeds(dd); const edit = canEdit(); const people = dd.students.filter(s => s.status !== 'left' && !s.watch).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return `<div class="card"><h2>먼저 챙길 학생 <span class="r">4주 연속 결석 · 장기결석 · 관심 학생 — 심방한 지 오래된 순</span></h2>
    ${needs.length ? `<div class="tw"><table><thead><tr><th>이름</th><th>${esc(dd.doc.classLabel)}</th><th>이유</th><th>마지막 출석</th><th>마지막 심방</th><th>연락처</th><th></th></tr></thead><tbody>${needs.map(x => `<tr><td>${esc(x.s.name)}</td><td class="note">${esc((classOf(dd, x.s) || {}).name || x.s.classId || '')}</td><td>${x.why.map(w => `<span class="pill ${w === '관심 학생' ? 'info' : 'bad'}">${w}</span>`).join(' ')}</td><td>${lastAttended(dd, x.s) || '기록 없음'}</td><td>${x.last ? esc(fmtShort(x.last.date)) : '<span class="pill warn">아직 없음</span>'}</td><td class="note">${esc(phoneLabel(x.s))}</td><td style="white-space:nowrap"><button class="btn s" data-care="${esc(x.s.id)}">카드 열기</button>${edit && x.s.watch ? ` <button class="btn s" data-unwatch="${esc(x.s.id)}">관심 해제</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : `<div class="note">${namedReports(dd).length < 4 ? '출석 체크된 주일 보고서가 4장 이상 쌓이면 결석이 이어지는 학생을 자동으로 찾습니다.' : '지금은 해당 학생이 없습니다.'}</div>`}
    ${edit ? `<div class="row" style="margin-top:10px"><select id="watch-pick" style="width:auto;max-width:220px"><option value="">학생 고르기</option>${people.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select><button class="btn" id="watch-add">관심 학생으로 표시</button><span class="note">결석이 아니어도 함께 챙길 학생을 이 목록에 올립니다. 표시만 남고 사유는 심방 카드에 적습니다.</span></div>` : ''}</div>`;
}
function bindCareNeeds(dd) {
  const setWatch = async (id, on) => { const s = dd.students.find(x => x.id === id); if (!s) return; s.watch = on; await backend.set(`depts/${dd.id}/students/${s.id}`, s); render(); toast(on ? s.name + ' — 관심 학생으로 표시' : s.name + ' — 관심 해제'); };
  document.querySelectorAll('[data-unwatch]').forEach(b => b.onclick = () => setWatch(b.dataset.unwatch, false));
  const wa = $('#watch-add'); if (wa) wa.onclick = () => { const id = $('#watch-pick').value; if (!id) { toast('학생을 고르세요'); return; } setWatch(id, true); };
}

/* ───────────── 형제자매 연결 ─────────────
   학생 카드의 형제자매 이름을 같은 부서·다른 부서 학생과 이어 보여 준다.
   siblings/{부서}: 형제자매가 적힌 학생의 이름·반·형제 이름만 담은 색인(연락처·주소 없음). 로그인한 모든 부서가 읽는다. */
/* 형제자매 — 예전 자료는 글자("홍길동")로, 새 자료는 목록으로 저장돼 있어 둘 다 받음 */
const sibs = s => Array.isArray(s && s.siblings) ? s.siblings : String((s && s.siblings) || '').split(/[,，、\/]\s*/).map(x => x.trim()).filter(Boolean);
const sibIndexOf = dd => dd.students.filter(s => s.status !== 'left' && sibs(s).length).map(s => ({ id: s.id, name: s.name, classId: (classOf(dd, s) || {}).name || s.classId || '', siblings: sibs(s) }));
async function syncSiblings(dd) {
  const c = await loadShared(); if (c.sibErr) return;
  const mine = sibIndexOf(dd); const cur = c.sib.find(x => x._id === dd.id);
  if (JSON.stringify((cur || {}).list || []) === JSON.stringify(mine)) return;
  const doc = { dept: dd.id, updated: today(), list: mine };
  try { await backend.set(`siblings/${dd.id}`, doc); c.sib = [...c.sib.filter(x => x._id !== dd.id), { _id: dd.id, ...doc }]; } catch (e) { c.sibErr = e.code || e.message; }
}
function siblingLinks(dd, s) {
  if (!s) return []; const names = new Set(sibs(s)); const out = []; const seen = new Set();
  dd.students.filter(x => x.id !== s.id && x.status !== 'left' && (names.has(x.name) || sibs(x).includes(s.name))).forEach(x => { seen.add(x.name); out.push({ name: x.name, where: (classOf(dd, x) || {}).name || x.classId || '', same: true }); });
  ((S.committee || {}).sib || []).filter(d => d._id !== dd.id).forEach(d => (d.list || []).forEach(x => { if (names.has(x.name) || sibs(x).includes(s.name)) { seen.add(x.name); out.push({ name: x.name, where: `${deptLabel(d._id)} ${x.classId || ''}`.trim(), same: false }); } }));
  [...names].filter(n => !seen.has(n)).forEach(n => out.push({ name: n, where: '', same: false }));
  return out;
}
const siblingChips = (dd, s) => siblingLinks(dd, s).map(l => `<span class="pill ${l.where ? (l.same ? 'ok' : 'info') : 'mute'}">${esc(l.name)}${l.where ? ' · ' + esc(l.where) : ''}</span>`).join(' ');
const siblingNote = (dd, s) => { const c = siblingChips(dd, s); return c ? '형제자매: ' + c : ''; };
/* 학생 카드에 붙는 칸: 형제자매 편집 */
function studentExtras(dd, s) {
  const edit = canEdit() && !isCommittee(); const chips = siblingChips(dd, s);
  return `<div class="sx">
    <div class="sx-row"><b>형제자매</b><span>${chips || '<span class="note">적힌 형제자매가 없습니다</span>'}</span></div>
    ${edit ? `<div class="row" style="margin-top:6px"><input type="text" id="sx-sib" value="${esc(sibs(s).join(', '))}" placeholder="이름을 쉼표로 구분 (예: 김하늘, 김바다)" style="flex:1;min-width:180px"><button class="btn s" id="sx-sib-save">형제자매 저장</button></div><div class="note" style="margin-top:4px">다른 부서에 있는 형제자매는 그 부서에서도 서로 이름을 적어 두면 부서·반이 함께 보입니다.</div>` : ''}
  </div>`;
}
function bindStudentExtras(dd, s) {
  const sv = $('#sx-sib-save'); if (sv) sv.onclick = async () => { s.siblings = [...new Set($('#sx-sib').value.split(/[,，、\/]/).map(x => x.trim().replace(/\s+/g, '')).filter(x => x && x !== s.name))]; await backend.set(`depts/${dd.id}/students/${s.id}`, s); try { await syncSiblings(dd); } catch (e) {} closeModal(); render(); toast('형제자매를 저장했습니다'); };
}

/* ───────────── 메인: 이달 생일 · 챙길 일(새친구 정착·결석·영수증·차량) ───────────── */
const SETTLE_COUNT = 4; // 새친구가 이만큼 출석하면 재적 전환을 권한다
const attendCount = (dd, s) => Object.values(dd.reports).filter(r => (r.att || {})[s.id]).length;
const settleCandidates = dd => dd.students.filter(s => s.status === 'newcomer').map(s => ({ s, n: attendCount(dd, s) })).filter(x => x.n >= SETTLE_COUNT);
function birthdaysOf(dd, month) {
  const mm = pad2(month); const out = [];
  dd.students.filter(s => s.status !== 'left' && (s.birth || '').slice(5, 7) === mm).forEach(s => out.push({ day: +s.birth.slice(8, 10), name: s.name, sub: (classOf(dd, s) || {}).name || s.classId || '', age: s.birth.slice(0, 4), birth: s.birth }));
  // 교사·임원 명단과 출석부에 같은 사람(이름·생일이 같음)이 있으면 한 번만 보이고, 직책을 옆에 붙인다
  dd.doc.staff.filter(t => t.status !== 'left' && /^\d{4}-\d{2}-\d{2}$/.test(t.birth || '') && t.birth.slice(5, 7) === mm).forEach(t => {
    const same = out.find(x => normName(x.name) === normName(t.name) && x.birth === t.birth);
    if (same) { if (t.role && !String(same.sub).includes(t.role)) same.sub = [same.sub, t.role].filter(Boolean).join(' · '); return; }
    out.push({ day: +t.birth.slice(8, 10), name: t.name, sub: t.role || '교사', age: '', birth: t.birth }); });
  return out.sort((a, b) => a.day - b.day || a.name.localeCompare(b.name, 'ko'));
}
function homeExtras(dd) {
  const now = new Date(); const mo = now.getMonth() + 1; const bd = birthdaysOf(dd, mo); const edit = canEdit();
  const settle = settleCandidates(dd); const abs = absent4(dd).filter(s => { if (!isCare()) return true; const n = lastCareNote(dd, s); return !n || (n.date || '') < today().slice(0, 8) + '01'; }); const pend = pendingReceipts(dd);
  const m = today().slice(0, 7); const mine = vehiclesIn(m).filter(v => v.dept === dd.id); const clash = vehicleClashes(vehiclesIn(m)); const myClash = mine.filter(v => clash.has(v.id));
  const todo = [];
  settle.forEach(x => todo.push(`<div class="item"><div><div class="t">${esc(x.s.name)} <span class="pill info">새친구</span></div><div class="d">등록 후 ${x.n}번 출석했습니다. 재적으로 바꿀 때가 되었습니다.</div></div>${edit ? `<button class="btn s" data-settle="${esc(x.s.id)}">재적으로 전환</button>` : ''}</div>`));
  if (abs.length) todo.push(`<div class="item"><div><div class="t">4주 연속 결석 ${abs.length}명 <span class="pill bad">심방 필요</span></div><div class="d">${abs.slice(0, 6).map(s => esc(s.name)).join(', ')}${abs.length > 6 ? ' 외' : ''}${isCare() ? ' · 이번 달 심방 기록이 없습니다' : ' · 심방 카드(관리자 모드)에서 챙겨 주세요'}</div></div>${edit ? '<button class="btn s" data-go="care">심방 카드</button>' : ''}</div>`);
  if (pend.length) todo.push(`<div class="item"><div><div class="t">기다리는 영수증 ${pend.length}장</div><div class="d">사진은 올라왔고 지출결의서가 아직 없습니다 · 합계 ${won(pend.reduce((a, r) => a + (+r.amount || 0), 0))}원</div></div><button class="btn s" data-go="${edit ? 'ledger' : 'receipt'}">${edit ? '회계 열기' : '영수증 보기'}</button></div>`);
  if (myClash.length) todo.push(`<div class="item"><div><div class="t">차량 신청 겹침 ${myClash.length}건 <span class="pill warn">확인</span></div><div class="d">${myClash.map(v => esc(v.date.slice(5).replace('-', '/') + ' ' + (v.vehicle || '차량 미정'))).join(', ')} — 다른 신청과 시간이 겹칩니다</div></div>${edit ? '<button class="btn s" data-go="vehicles">차량 신청</button>' : ''}</div>`);
  return `<div class="grid2">
    <div class="card"><h2>${mo}월 생일 <span class="r">${bd.length}명</span></h2><div class="bd-list">${bd.map(b => `<span class="bd ${b.day === now.getDate() ? 'today' : ''}"><b>${b.day}일</b> ${esc(b.name)} <span class="note">${esc(b.sub)}</span></span>`).join('') || '<span class="note">이달 생일인 학생·교사가 없습니다. 생년월일은 출석부 학생 카드에서 넣습니다.</span>'}</div></div>
    <div class="card"><h2>챙길 일 <span class="r">자동으로 찾은 것</span></h2><div class="list">${todo.join('') || '<div class="note">지금 챙길 일이 없습니다.</div>'}</div></div>
  </div>`;
}
function bindHomeExtras() {
  if (isCommittee()) return; const dd = D(); if (!dd) return;
  document.querySelectorAll('[data-settle]').forEach(b => b.onclick = async () => { const s = dd.students.find(x => x.id === b.dataset.settle); if (!s) return; s.status = 'active'; s.settled = today(); s.flags = (s.flags || []).filter(f => !/^새친구 등록/.test(f)); if (/새친구/.test(s.classId || '') && dd.doc.classes.some(c => !/새친구|장기/.test(c.id))) (s.flags = s.flags || []).push('재적 전환 — 반 배정 확인'); await backend.set(`depts/${dd.id}/students/${s.id}`, s); render(); toast(s.name + ' — 재적으로 전환했습니다. 출석부에서 반을 확인하세요.', 3200); });
}
function committeeExtras() {
  const c = S.committee || {}; const last = (c.backupMeta || {}).at || ''; const days = last ? Math.floor((new Date(today()) - new Date(last)) / 86400000) : null;
  const m = today().slice(0, 7); const clash = vehicleClashes(vehiclesIn(m)); const n = vehiclesIn(m).filter(v => clash.has(v.id)).length;
  const out = [];
  if (canEdit() && (days === null || days > 31)) out.push(`<div class="hint">${days === null ? '전체 자료를 아직 한 번도 내려받지 않았습니다.' : `마지막 자료 내려받기가 ${days}일 전(${esc(last)})입니다.`} 한 달에 한 번 내려받아 시놀로지에 보관해 주세요. <button class="btn s" data-go="backup">자료 내려받기</button></div>`);
  if (n) out.push(`<div class="hint">이번 달 차량 신청 ${n}건이 서로 겹칩니다. <button class="btn s" data-go="vehicles">차량 신청 보기</button></div>`);
  return out.join('');
}

/* ───────────── 항목별 예산 · 집행 · 차액 ───────────── */
function budgetVsActual(dd, ledgerId, m) {
  const y = m.slice(0, 4); const cats = new Map(); const at = c => { c = c || '기타'; if (!cats.has(c)) cats.set(c, { c, b: 0, a: 0, mon: 0 }); return cats.get(c); };
  (dd.doc.budgetPlan || []).forEach(b => { at(b.category).b += +b.amount || 0; });
  dd.expenses.filter(e => e.ledgerId === ledgerId && e.date && e.date.startsWith(y) && ym(e.date) <= m).forEach(e => { const x = at(e.category); x.a += +e.amount || 0; if (ym(e.date) === m) x.mon += +e.amount || 0; });
  const rows = [...cats.values()].map(x => ({ ...x, diff: x.b - x.a, rate: x.b ? Math.round(x.a / x.b * 1000) / 10 : null }));
  const sum = rows.reduce((t, x) => ({ b: t.b + x.b, a: t.a + x.a, mon: t.mon + x.mon }), { b: 0, a: 0, mon: 0 });
  return { rows, sum: { ...sum, diff: sum.b - sum.a, rate: sum.b ? Math.round(sum.a / sum.b * 1000) / 10 : null }, hasPlan: (dd.doc.budgetPlan || []).length > 0 };
}
function budgetVsCard(dd, ledgerId, m) {
  const L = dd.doc.ledgers.find(l => l.id === ledgerId); if (!L || L.kind !== 'budget') return '';
  const { rows, sum, hasPlan } = budgetVsActual(dd, ledgerId, m); if (!rows.length) return '';
  const mm = +m.slice(5);
  return `<div class="card"><h2>항목별 예산 · 집행 · 차액 <span class="r">${m.slice(0, 4)}년 1월 ~ ${mm}월 누계 · 예산은 연간계획서 예산안에서</span></h2>
    ${hasPlan ? '' : '<div class="hint" style="margin-bottom:8px">연간계획서에 예산안이 없어 집행액만 보입니다. 보고서 → 연간계획서에서 예산안을 넣으면 항목별로 비교됩니다.</div>'}
    <div class="tw"><table><thead><tr><th>항목</th><th class="n">예산</th><th class="n">${mm}월 집행</th><th class="n">누계 집행</th><th class="n">차액(남은 돈)</th><th class="n">집행률</th><th style="width:140px"></th></tr></thead><tbody>
    ${rows.map(x => `<tr><td>${esc(x.c)}${x.b === 0 && x.a > 0 ? ' <span class="pill warn">예산 없음</span>' : ''}${x.b > 0 && x.diff < 0 ? ' <span class="pill bad">초과</span>' : ''}</td><td class="n">${won(x.b)}</td><td class="n">${won(x.mon)}</td><td class="n">${won(x.a)}</td><td class="n" ${x.diff < 0 ? 'style="color:var(--bad)"' : ''}>${won(x.diff)}</td><td class="n">${x.rate === null ? '—' : x.rate + '%'}</td><td>${x.rate === null ? '' : `<div class="bar"><i style="width:${Math.min(100, x.rate)}%"></i></div>`}</td></tr>`).join('')}
    <tr class="sum"><td>합계</td><td class="n">${won(sum.b)}</td><td class="n">${won(sum.mon)}</td><td class="n">${won(sum.a)}</td><td class="n">${won(sum.diff)}</td><td class="n">${sum.rate === null ? '—' : sum.rate + '%'}</td><td></td></tr></tbody></table></div>
    ${hasPlan && L.budget && sum.b !== L.budget ? `<div class="note" style="margin-top:6px">예산안 합계(${won(sum.b)}원)와 장부의 연간 예산(${won(L.budget)}원)이 다릅니다. 연간계획서나 장부 설정을 확인하세요.</div>` : ''}</div>`;
}
function budgetVsPaper(dd, ledgerId, m) {
  const { rows, sum, hasPlan } = budgetVsActual(dd, ledgerId, m); if (!hasPlan || !rows.length) return '';
  const mm = +m.slice(5);
  return `<h2>4-1. 항목별 예산 대비 집행 <span class="tag">자동</span></h2><div class="tw"><table><thead><tr><th>항목</th><th class="n">예산</th><th class="n">${mm}월 집행</th><th class="n">누계 집행</th><th class="n">차액</th><th class="n">집행률</th></tr></thead><tbody>${rows.map(x => `<tr><td>${esc(x.c)}${x.b > 0 && x.diff < 0 ? ' (초과)' : ''}</td><td class="n">${won(x.b)}</td><td class="n">${won(x.mon)}</td><td class="n">${won(x.a)}</td><td class="n">${won(x.diff)}</td><td class="n">${x.rate === null ? '—' : x.rate + '%'}</td></tr>`).join('')}<tr class="sum"><td>합계</td><td class="n">${won(sum.b)}</td><td class="n">${won(sum.mon)}</td><td class="n">${won(sum.a)}</td><td class="n">${won(sum.diff)}</td><td class="n">${sum.rate === null ? '—' : sum.rate + '%'}</td></tr></tbody></table></div>`;
}

/* ───────────── 차량 신청 ─────────────
   vehicles/{id}: dept, date, dateEnd, start, end, vehicle, dest, purpose, driver, people, status(신청|확정|취소), note
   전 부서가 함께 보고(달력), 같은 차량·같은 시간이 겹치면 표시한다. 결재는 출력한 신청서로 받는다. */
const VEH_STATUS = ['신청', '확정', '취소'];
const vehNorm = s => String(s || '').replace(/\s+/g, '').toLowerCase();
const vehEnd = v => v.dateEnd && v.dateEnd > v.date ? v.dateEnd : v.date;
const vehiclesIn = m => (((S.committee || {}).vehicles) || []).filter(v => v.date && ym(v.date) <= m && ym(vehEnd(v)) >= m);
function vehicleClashes(list) {
  const out = new Set(); const act = list.filter(v => v.status !== '취소' && v.date);
  for (let i = 0; i < act.length; i++) for (let j = i + 1; j < act.length; j++) {
    const a = act[i], b = act[j]; if (vehNorm(a.vehicle) !== vehNorm(b.vehicle)) continue;
    if (a.date > vehEnd(b) || b.date > vehEnd(a)) continue;
    const multi = vehEnd(a) !== a.date || vehEnd(b) !== b.date;
    if (multi || ((a.start || '00:00') < (b.end || '23:59') && (b.start || '00:00') < (a.end || '23:59'))) { out.add(a.id); out.add(b.id); }
  }
  return out;
}
const vehTime = v => v.start || v.end ? `${v.start || ''}~${v.end || ''}` : '종일';
const vehicleEvents = () => (((S.committee || {}).vehicles) || []).filter(v => v.status !== '취소' && v.date).map(v => ({ date: v.date, end: v.dateEnd && v.dateEnd > v.date ? v.dateEnd : '', title: `차량 · ${deptLabel(v.dept)}${v.dest ? ' ' + v.dest : ''}`, note: [v.vehicle, vehTime(v)].filter(Boolean).join(' '), c: false }));
const homeEvents = dd => [...allEvents(dd), ...vehicleEvents()];
const CHURCH_CARS = ['8688(스타리아)', '4863(스타렉스)', '5309(레이)', '7908(버스)'];
const VEH_RULES = ['교회차량은 개인적 용도로 사용할 수 없으며, 반드시 교회와 소속 기관의 공적인 용무로만 사용할 수 있습니다.', '반드시 안전운행 해주시고, 차량운행 중에는 과속이나 신호위반에 주의해 주시며, 혹시 과태료가 부과될 경우에는 사용기관 및 개인 운전자가 부담합니다.', '각 기관에서 차량사용 후에는 차량 내부를 깨끗하게 청소해 주시기 바랍니다.', '차량이 심하게 더러워진 경우에는 사용기관에서 실내뿐만 아니라 외부세차를 하셔서 차량청결을 유지해 주시기 바랍니다.', '차량열쇠는 교회 사무실에서 받아 가시고 사용하신 후에는 책임자에게 차량상태를 점검 받으신 후 열쇠를 반납해 주시기 바랍니다.', '늦어도 1주일 전에는 차량신청서를 제출하시고 승인을 받으신 후 차량을 이용해 주시기 바랍니다.'];
/* 교회 양식 "차량 사용 신청서"(주말학습계획서 첨부 1)와 같은 칸 */
function vehiclePaper(v) {
  const dt = (d, t) => d ? `${d.slice(0, 4)}년 ${+d.slice(5, 7)}월 ${+d.slice(8, 10)}일${t ? ' ' + t : ''}` : '20&nbsp;&nbsp;&nbsp;년&nbsp;&nbsp;&nbsp;월&nbsp;&nbsp;&nbsp;일&nbsp;&nbsp;&nbsp;시';
  const known = CHURCH_CARS.includes(v.vehicle);
  return `<section class="paper voucher vehform">
    <div class="att">첨부 1) 차량신청서</div>
    <h1 class="ttl">차 량 사 용 신 청 서</h1><div class="ttl-sub">※ 1종 보통 반드시 확인</div>
    <table class="kv vk"><tbody>
      <tr><th>신 청 기 관 명</th><td>중앙성서교회 ${esc(deptLabel(v.dept))}</td></tr>
      <tr><th>사 용 일 시</th><td>${dt(v.date, v.start)} ~ ${dt(vehEnd(v), v.end)} 까지</td></tr>
      <tr><th>행 선 지</th><td>${esc(v.dest || '')}</td></tr>
      <tr><th>예 상 주 행 거 리</th><td>왕복 ${v.km ? esc(v.km) : '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'} Km</td></tr>
      <tr><th>신 청 차 량</th><td>${CHURCH_CARS.map(c => `${v.vehicle === c ? '☑' : '□'}${esc(c)}`).join('&nbsp;&nbsp;')}${!known && v.vehicle ? ` &nbsp;☑${esc(v.vehicle)}` : ''}</td></tr>
      <tr><th>차 량 사 용 목 적</th><td style="height:46px">${esc(v.purpose || '')}</td></tr>
      <tr><th>탑 승 인 원</th><td>${v.people ? esc(v.people) + '명' : ''}</td></tr>
      <tr><th>운 전 자 (연락처)</th><td>성명 : ${esc(v.driver || '')}<span class="gap"></span>연락처 : ${esc(v.driverPhone || '')}</td></tr>
      <tr><th>신 청 자 (연락처)</th><td>성명 : ${esc(v.requester || '')}<span class="gap"></span>연락처 : ${esc(v.requesterPhone || '')}</td></tr>
      <tr><td colspan="2" class="ask"><p>위와 같이 신청하오니 승인하여 주시기를 바랍니다.</p><p class="r">${esc(fmtK(v.created || today()))}</p><p class="r">신 청 인 &nbsp; ${esc(v.requester || '')} &nbsp;(인)</p>
        <div class="rules"><b>※ 교회차량 신청 시 유의사항</b><ol>${VEH_RULES.map(r => `<li>${esc(r)}</li>`).join('')}</ol></div></td></tr>
    </tbody></table>
    ${v.note ? `<div class="note" style="margin-top:6px">비고: ${esc(v.note)}</div>` : ''}
    <div class="ft"><b>중앙성서교회 교육부</b><span>CBCS에서 생성 · 차량사용신청서 ${esc(v.date || '')}</span></div>
  </section>`;
}
VIEWS.vehicles = async () => {
  const c = await loadShared(); const m = S.sub.month || today().slice(0, 7); const me = isCommittee() ? 'committee' : S.dept;
  if (S.sub.vehPrint) { const v = c.vehicles.find(x => x.id === S.sub.vehPrint); if (v) { if (DEPTS[v.dept]) await loadDept(v.dept).catch(() => {}); return `<div class="topbar no-print"><div><h1>차량 운행 신청서</h1><div class="sub">인쇄해 결재를 받습니다</div></div><div class="row"><button class="btn" id="vh-back">차량 신청으로</button><button class="btn p" id="vh-print">PDF로 저장 / 인쇄</button></div></div>${vehiclePaper(v)}`; } }
  const list = vehiclesIn(m).sort((a, b) => (a.date + (a.start || '')) < (b.date + (b.start || '')) ? -1 : 1); const clash = vehicleClashes(list);
  const editing = S.sub.vehEdit ? c.vehicles.find(x => x.id === S.sub.vehEdit) : null; const cur = editing || { date: '', dateEnd: '', start: '', end: '', vehicle: '', dest: '', purpose: '', driver: '', driverPhone: '', people: '', requester: '', note: '', status: '신청' };
  const names = [...new Set(c.vehicles.map(v => (v.vehicle || '').trim()).filter(Boolean))];
  const can = v => canEdit() && (isCommittee() || v.dept === me);
  return `<div class="topbar"><div><h1>차량 신청</h1><div class="sub">신청하면 모든 부서 달력에 올라가고, 같은 차량·같은 시간이 겹치면 표시됩니다. 결재는 출력한 신청서로 받습니다.</div></div></div>
  <div class="stack">
    ${c.vehiclesErr ? RULES_HINT : ''}
    ${monthNav(m)}
    ${clash.size ? `<div class="hint">${m.replace('-', '년 ')}월에 겹치는 신청이 ${clash.size}건 있습니다. 아래 표에서 "겹침" 표시를 확인하고 부서끼리 조정해 주세요.</div>` : ''}
    <div class="card"><h2>${m.replace('-', '년 ')}월 차량 달력 <span class="r">회색은 다른 부서</span></h2>${calendarHTML(m, list.filter(v => v.status !== '취소').map(v => ({ date: v.date, end: vehEnd(v), title: `${deptLabel(v.dept)} ${v.vehicle || ''}`.trim(), c: v.dept !== me })))}</div>
    <div class="card"><h2>${m.replace('-', '년 ')}월 신청 내역 <span class="r">${list.length}건</span></h2><div class="tw"><table><thead><tr><th>날짜</th><th>시간</th><th>부서</th><th>차량</th><th>행선지 · 목적</th><th>운전자</th><th class="n">인원</th><th>상태</th><th></th></tr></thead><tbody>
      ${list.map(v => `<tr><td>${v.date.slice(5).replace('-', '/')}${vehEnd(v) !== v.date ? '~' + vehEnd(v).slice(5).replace('-', '/') : ''} (${DAYS[new Date(v.date + 'T00:00:00').getDay()]})</td><td>${esc(vehTime(v))}</td><td>${esc(deptLabel(v.dept))}</td><td>${esc(v.vehicle || '미정')}</td><td class="wrap">${esc([v.dest, v.purpose].filter(Boolean).join(' · '))}</td><td>${esc(v.driver || '')}</td><td class="n">${esc(v.people || '')}</td><td><span class="pill ${v.status === '확정' ? 'ok' : v.status === '취소' ? 'mute' : 'info'}">${esc(v.status || '신청')}</span>${clash.has(v.id) ? ' <span class="pill bad">겹침</span>' : ''}</td><td style="white-space:nowrap">${canEdit() ? `<button class="btn s" data-vh-print="${esc(v.id)}">신청서</button>` : ''}${can(v) ? ` <button class="btn s" data-vh-edit="${esc(v.id)}">수정</button> <button class="btn s d" data-vh-del="${esc(v.id)}">삭제</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="9" class="note">이달 신청이 없습니다.</td></tr>'}
    </tbody></table></div></div>
    ${canEdit() ? `<div class="card" id="vh-form"><h2>${editing ? '신청 수정' : '차량 신청하기'} <span class="r">${esc(deptLabel(editing ? editing.dept : me))}</span></h2>
      <div class="fields"><label class="f"><span>운행일</span><input type="date" id="vh-date" value="${esc(cur.date || '')}"></label><label class="f"><span>끝나는 날 (수련회 등)</span><input type="date" id="vh-date-end" value="${esc(cur.dateEnd || '')}"></label><label class="f"><span>출발 시각</span><input type="time" id="vh-start" value="${esc(cur.start || '')}"></label><label class="f"><span>돌아오는 시각</span><input type="time" id="vh-end" value="${esc(cur.end || '')}"></label>
        <label class="f"><span>신청 차량</span><select id="vh-vehicle">${['', ...CHURCH_CARS, ...names.filter(n => !CHURCH_CARS.includes(n))].map(n => `<option value="${esc(n)}" ${(cur.vehicle || '') === n ? 'selected' : ''}>${n ? esc(n) : '— 고르기 —'}</option>`).join('')}<option value="__etc">기타 (직접 적기)</option></select><input type="text" id="vh-vehicle-etc" placeholder="차량 이름" style="margin-top:4px" hidden></label><label class="f"><span>예상 주행거리 (왕복 km)</span><input type="number" id="vh-km" value="${esc(cur.km || '')}"></label><label class="f"><span>탑승 인원</span><input type="number" id="vh-people" value="${esc(cur.people || '')}"></label><label class="f"><span>운전자</span><input type="text" id="vh-driver" value="${esc(cur.driver || '')}"></label><label class="f"><span>운전자 연락처</span><input type="tel" id="vh-phone" value="${esc(cur.driverPhone || '')}"></label>
        <label class="f" style="grid-column:span 2"><span>행선지</span><input type="text" id="vh-dest" value="${esc(cur.dest || '')}"></label><label class="f" style="grid-column:span 2"><span>목적</span><input type="text" id="vh-purpose" value="${esc(cur.purpose || '')}" placeholder="예: 가을 현장학습"></label>
        <label class="f"><span>신청인</span><input type="text" id="vh-req" value="${esc(cur.requester || '')}"></label><label class="f"><span>신청인 연락처</span><input type="tel" id="vh-req-phone" value="${esc(cur.requesterPhone || '')}"></label><label class="f"><span>상태</span><select id="vh-status">${VEH_STATUS.map(k => `<option ${(cur.status || '신청') === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label><label class="f" style="grid-column:span 2"><span>비고</span><input type="text" id="vh-note" value="${esc(cur.note || '')}"></label></div>
      <div class="row" style="margin-top:10px"><button class="btn p" id="vh-save">${editing ? '수정 저장' : '신청 저장'}</button>${editing ? '<button class="btn" id="vh-cancel">취소</button>' : ''}<span class="note">차량 이름을 똑같이 적어야 겹침을 찾습니다(목록에서 고르면 편합니다). 종이 결재가 끝나면 상태를 "확정"으로 바꿉니다.</span></div></div>` : ''}
  </div>`;
};
BIND.vehicles = () => {
  const c = S.committee; const me = isCommittee() ? 'committee' : S.dept;
  const vb = $('#vh-back'); if (vb) { vb.onclick = () => { delete S.sub.vehPrint; render(); }; $('#vh-print').onclick = doPrint; return; }
  bindMonthNav();
  document.querySelectorAll('[data-vh-print]').forEach(b => b.onclick = () => { S.sub.vehPrint = b.dataset.vhPrint; render(); });
  document.querySelectorAll('[data-vh-edit]').forEach(b => b.onclick = () => { S.sub.vehEdit = b.dataset.vhEdit; render().then(() => { const f = $('#vh-form'); if (f) f.scrollIntoView({ block: 'start' }); }); });
  document.querySelectorAll('[data-vh-del]').forEach(b => b.onclick = async () => { try { await backend.del(`vehicles/${b.dataset.vhDel}`); c.vehicles = c.vehicles.filter(v => v.id !== b.dataset.vhDel); render(); toast('신청을 삭제했습니다'); } catch (e) { toast('삭제 실패: ' + (e.code || e.message), 4000); } });
  const sv = $('#vh-save'); if (sv) sv.onclick = async () => {
    const date = $('#vh-date').value; if (!date) { toast('운행일을 넣어 주세요'); return; }
    const old = S.sub.vehEdit ? c.vehicles.find(x => x.id === S.sub.vehEdit) : null;
    const v = Object.assign(old || { id: 'vh_' + uid(), dept: me, created: today() }, { date, dateEnd: $('#vh-date-end').value > date ? $('#vh-date-end').value : '', start: $('#vh-start').value, end: $('#vh-end').value, vehicle: $('#vh-vehicle').value === '__etc' ? $('#vh-vehicle-etc').value.trim() : $('#vh-vehicle').value.trim(), people: $('#vh-people').value.trim(), driver: $('#vh-driver').value.trim(), driverPhone: $('#vh-phone').value.trim(), dest: $('#vh-dest').value.trim(), purpose: $('#vh-purpose').value.trim(), requester: $('#vh-req').value.trim(), requesterPhone: $('#vh-req-phone').value.trim(), km: $('#vh-km').value.trim(), status: $('#vh-status').value, note: $('#vh-note').value.trim() });
    try { const { _id, ...data } = v; await backend.set(`vehicles/${v.id}`, data); if (!old) c.vehicles.push(v); S.sub = { month: ym(date) }; await render(); const hit = vehicleClashes(vehiclesIn(ym(date))).has(v.id); toast(hit ? '저장했습니다 — 다른 신청과 겹칩니다. 표를 확인하세요.' : '저장했습니다', hit ? 4000 : 2200); }
    catch (e) { toast('저장 실패: ' + (e.code || e.message) + ' — 보안 규칙을 게시했는지 확인하세요', 5000); }
  };
  const vc = $('#vh-cancel'); if (vc) vc.onclick = () => { delete S.sub.vehEdit; render(); };
  const vs = $('#vh-vehicle'); if (vs) vs.onchange = () => { $('#vh-vehicle-etc').hidden = vs.value !== '__etc'; };
};


/* ───────────── 회의록 (청년부 임원회의 · 다른 부서 교사회의) ─────────────
   depts/{부서}/meetings/{id}: 일시·작성자·장소·참석자·미참석자·주요안건·안건(본문)·차후 회의 안건·비고
   역대 회의록 파일(HWP·HWPX·PDF·DOCX)을 여러 개 한꺼번에 올리면 칸을 자동으로 읽어 미리보기 → 저장한다.
   원본 파일은 650KB 이하면 depts/{부서}/meetingFiles/{id}에 같이 보관한다. */
const meetLabel = d => d === 'young' ? '임원회의' : '교사회의';
async function loadMeetings(d) { S.meetings = S.meetings || {}; if (!S.meetings[d]) { try { S.meetings[d] = (await backend.list(`depts/${d}/meetings`)).map(x => ({ ...x, id: x.id || x._id })); } catch (e) { S.meetings[d] = []; S.meetingsErr = e.code || e.message; } } return S.meetings[d]; }
const MEET_FIELDS = [['date', '일시'], ['writer', '작성자'], ['place', '장소'], ['attendees', '참석자'], ['absentees', '미참석자'], ['topic', '주요안건'], ['body', '안건'], ['next', '차후 회의 안건'], ['note', '비고']];
// 회의록 글에서 칸 읽기: 줄 맨 앞의 "일시·작성자·장소·참석자·미참석자·주요안건·안건·차후 회의 안건·비고"를 칸 이름으로 본다
function parseMeetingText(text, fileName = '') {
  const t = String(text || '').replace(/\r/g, '').replace(/ /g, ' ');
  const LAB = [['absentees', '미\\s*참\\s*석\\s*자'], ['attendees', '참\\s*석\\s*자'], ['next', '(?:차\\s*후|다\\s*음)\\s*회\\s*의\\s*안\\s*건'], ['topic', '주\\s*요\\s*안\\s*건'], ['body', '(?:안\\s*건|회\\s*의\\s*내\\s*용)'], ['date', '일\\s*시'], ['writer', '작\\s*성\\s*자'], ['place', '장\\s*소'], ['note', '비\\s*고']];
  const keyOf = lab => (LAB.find(([, r]) => new RegExp('^' + r + '$').test(lab)) || [])[0];
  const hits = []; const add = (key, start, end) => { if (key && !hits.some(h => h.key === key)) hits.push({ key, start, end }); };
  // ① 줄 맨 앞의 칸 이름 (뒤에 한 칸 띄고 바로 내용이 와도 됨: "일시 2026. 1. 4.")
  const reLine = new RegExp(`^[ \\t]*(${LAB.map(([, r]) => r).join('|')})[ \\t]*[:：]?(?=[ \\t]|\\n|$)`, 'gm'); let m;
  while ((m = reLine.exec(t))) add(keyOf(m[1]), m.index, m.index + m[0].length);
  // ② 표가 한 줄로 읽힌 PDF: "참석자 가, 나 미참석자 다", "일시 … 작성자 …" — 줄 가운데의 미참석자·작성자
  const reIn = /[ \t,](미\s*참\s*석\s*자|작\s*성\s*자)[ \t]*[:：]?(?=[ \t]|$)/gm;
  while ((m = reIn.exec(t))) add(keyOf(m[1]), m.index + 1, m.index + m[0].length);
  const out = {}; hits.sort((a, b) => a.start - b.start).forEach((h, i) => { const nx = hits[i + 1]; out[h.key] = t.slice(h.end, nx ? nx.start : t.length).replace(/^\s*#.*$/gm, '').replace(/^\s*회\s*의\s*록\s*$/gm, '').trim(); });
  const none = v => /^[-–—·\s]*$/.test(v || '');
  const names = v => none(v) ? [] : String(v || '').split(/[,，、\/\n]+/).map(x => x.trim()).filter(x => x && !none(x) && x.length <= 12);
  const one = v => none(v) ? '' : String(v || '').split('\n').map(x => x.trim()).filter(Boolean).join(' ');
  const dre = /(20\d\d)\D{1,3}(\d{1,2})\D{1,3}(\d{1,2})/;
  const iso = mm => mm ? `${mm[1]}-${pad2(+mm[2])}-${pad2(+mm[3])}` : '';
  const dIn = iso((out.date || '').match(dre)), dFile = iso(String(fileName).replace(/\.[a-z]+$/i, '').match(/(20\d\d)\D{0,3}(\d{1,2})\D{1,3}(\d{1,2})\D*$/) || String(fileName).match(dre));
  const date = dFile || dIn || iso(t.match(dre));
  const flags = dIn && dFile && dIn !== dFile ? [`본문 일시(${dIn})와 파일 이름 날짜(${dFile})가 달라 파일 이름 날짜로 넣음`] : [];
  // PDF는 줄마다 빈 줄이 끼어 읽히므로, 빈 줄이 절반 넘게 끼어 있으면 빈 줄을 걷어 낸다
  const tidy = v => { const L = String(v || '').split('\n'); const blank = L.filter(x => !x.trim()).length; return (blank * 2 >= L.length - 1 ? L.filter(x => x.trim()) : L).join('\n').replace(/\n{3,}/g, '\n\n').trim(); };
  ['topic', 'body', 'next', 'note'].forEach(k => { out[k] = tidy(out[k]); });
  return { date, dateText: one(out.date), writer: one(out.writer), place: one(out.place), attendees: names(out.attendees), absentees: names(out.absentees), topic: one(out.topic) ? (out.topic || '').trim() : '', body: (out.body || '').trim(), next: none(out.next) ? '' : (out.next || '').trim(), note: none(out.note) ? '' : (out.note || '').trim(), flags, found: hits.map(h => h.key) };
}
function meetingPaper(dd, mt) {
  const row = (k, v, h) => `<tr><th>${k}</th><td colspan="3"${h ? ` style="height:${h}px;vertical-align:top;white-space:pre-wrap"` : ''}>${esc(v || '')}</td></tr>`;
  return `<section class="paper outform"><h1 class="ttl">회 의 록</h1><div class="ttl-sub">${esc(dd.doc.name || DEPTS[dd.id] || '')} ${esc(mt.kind || meetLabel(dd.id))}</div>
    <table class="kv ok"><tbody><tr><th>일 시</th><td>${esc(mt.dateText || (mt.date ? fmtK(mt.date) : ''))}</td><th>작성자</th><td>${esc(mt.writer || '')}</td></tr>
      ${row('장 소', mt.place)}${row('참석자', (mt.attendees || []).join(', '))}${row('미참석자', (mt.absentees || []).join(', '))}${row('주요안건', mt.topic)}${row('안 건', mt.body, 260)}${row('차후<br>회의 안건', mt.next, 50).replace('&lt;br&gt;', '<br>')}${row('비 고', mt.note, 40)}</tbody></table>
    <div class="ft"><b>중앙성서교회 ${esc(dd.doc.name || '')}</b><span>CBCS에서 생성 · 회의록 ${esc(mt.date || '')}${mt.fileName ? ' · 원본 ' + esc(mt.fileName) : ''}</span></div></section>`;
}
VIEWS.meetings = async () => {
  const depts = isCommittee() ? Object.keys(DEPTS) : [S.dept]; for (const d of depts) { await loadMeetings(d); await loadDept(d); }
  const all = depts.flatMap(d => S.meetings[d].map(x => ({ ...x, dept: x.dept || d }))).sort((a, b) => (b.date || '') < (a.date || '') ? -1 : 1);
  const yrs = [...new Set(all.map(x => (x.date || '').slice(0, 4)).filter(Boolean))].sort().reverse(); const yr = S.sub.myr || yrs[0] || String(YEAR);
  const label = isCommittee() ? '회의록' : meetLabel(S.dept);
  const view = S.sub.meet && all.find(x => x.id === S.sub.meet);
  if (view) return `<div class="topbar no-print"><div><h1>${esc(label)} 회의록</h1><div class="sub">${esc(DEPTS[view.dept] || '')} · ${esc(view.date || '')}</div></div><div class="row"><button class="btn" id="mt-back">목록으로</button>${!isCommittee() && canEdit() ? '<button class="btn" id="mt-edit">수정</button>' : ''}${view.hasFile ? '<button class="btn" id="mt-file">원본 내려받기</button>' : ''}<button class="btn p" id="mt-pr">인쇄 / PDF로 저장</button></div></div>${(view.flags || []).length ? `<div class="hint no-print" style="margin-bottom:10px">${view.flags.map(esc).join('<br>')}</div>` : ''}${meetingPaper(S.data[view.dept], view)}`;
  const ed = S.sub.meetEdit ? (S.sub.meetEdit === 'new' ? { id: '', date: today(), kind: meetLabel(S.dept), attendees: [], absentees: [] } : all.find(x => x.id === S.sub.meetEdit)) : null;
  const list = all.filter(x => (x.date || '').startsWith(yr));
  return `<div class="topbar"><div><h1>${esc(label)}</h1><div class="sub">${isCommittee() ? '전 부서 임원회의·교사회의 회의록' : `${esc(label)} 회의록을 쓰고 보관합니다. 지난 회의록 파일(HWP·PDF·Word)을 여러 개 한꺼번에 올리면 칸을 자동으로 읽어 넣습니다.`}</div></div>
    <div class="row">${yrs.length ? `<select id="mt-yr" style="width:auto">${[...new Set([yr, ...yrs])].map(y => `<option ${y === yr ? 'selected' : ''}>${y}</option>`).join('')}</select>` : ''}${!isCommittee() && canEdit() && !ed ? '<button class="btn" id="mt-up">파일로 올리기 (여러 개)</button><button class="btn p" id="mt-new">새 회의록</button>' : ''}</div></div>
  <div class="stack">
    ${S.meetingsErr ? `<div class="hint">불러오기 실패: ${esc(S.meetingsErr)}</div>` : ''}
    ${ed ? `<div class="card" id="mt-form"><h2>${ed.id ? '회의록 수정' : '새 회의록'}</h2><div class="fields">
      <label class="f"><span>날짜</span><input type="date" id="mf-date" value="${esc(ed.date || '')}"></label><label class="f"><span>일시 (적힌 그대로)</span><input type="text" id="mf-dtext" value="${esc(ed.dateText || '')}" placeholder="예: 2026. 10. 04(주일) 오후 1시"></label>
      <label class="f"><span>작성자</span><input type="text" id="mf-writer" value="${esc(ed.writer || '')}"></label><label class="f"><span>장소</span><input type="text" id="mf-place" value="${esc(ed.place || '')}"></label>
      <label class="f" style="grid-column:span 2"><span>참석자 (쉼표로 구분)</span><input type="text" id="mf-att" value="${esc((ed.attendees || []).join(', '))}"></label><label class="f" style="grid-column:span 2"><span>미참석자</span><input type="text" id="mf-abs" value="${esc((ed.absentees || []).join(', '))}"></label>
      <label class="f" style="grid-column:1/-1"><span>주요안건</span><input type="text" id="mf-topic" value="${esc(ed.topic || '')}"></label></div>
      <label class="f" style="margin-top:8px"><span>안건 (회의 내용)</span><textarea id="mf-body" rows="10">${esc(ed.body || '')}</textarea></label>
      <label class="f"><span>차후 회의 안건</span><textarea id="mf-next" rows="2">${esc(ed.next || '')}</textarea></label><label class="f"><span>비고</span><input type="text" id="mf-note" value="${esc(ed.note || '')}"></label>
      <div class="row" style="margin-top:10px"><button class="btn p" id="mn-save">저장</button><button class="btn" id="mf-cancel">닫기</button>${ed.id ? '<button class="btn d" id="mf-del">삭제</button>' : ''}</div></div>` : ''}
    <div class="card" id="mt-upbox" hidden><h2>지난 회의록 파일 올리기 <span class="r">HWP · HWPX · PDF · DOCX · 여러 개 한꺼번에</span></h2><input type="file" id="mt-files" multiple accept=".hwp,.hwpx,.pdf,.docx,.odt,.txt"><div id="mt-prev" style="margin-top:10px"></div></div>
    <div class="card"><h2>${esc(yr)}년 ${esc(label)} <span class="r">${list.length}건</span></h2>${list.length ? `<div class="tw"><table class="mt-list"><thead><tr><th>날짜</th>${isCommittee() ? '<th>부서</th>' : ''}<th>주요안건</th><th>작성자</th><th class="n">참석</th><th>차후 회의 안건</th></tr></thead><tbody>
      ${list.map(x => `<tr data-meet="${esc(x.id)}" style="cursor:pointer"><td>${esc(x.date || '')}</td>${isCommittee() ? `<td>${esc(DEPTS[x.dept] || '')}</td>` : ''}<td class="wrap"><b>${esc(x.topic || '(안건 없음)')}</b></td><td>${esc(x.writer || '')}</td><td class="n">${(x.attendees || []).length}${(x.absentees || []).length ? '/' + ((x.attendees || []).length + x.absentees.length) : ''}</td><td class="wrap note">${esc((x.next || '').split('\n')[0])}</td></tr>`).join('')}</tbody></table></div>` : '<div class="note">이 해의 회의록이 없습니다.</div>'}</div>
  </div>`;
};
BIND.meetings = () => {
  const back = $('#mt-back'); if (back) { back.onclick = () => { delete S.sub.meet; render(); }; $('#mt-pr').onclick = () => printAsPDF(`회의록-${S.sub.meet}.pdf`);
    const me = $('#mt-edit'); if (me) me.onclick = () => { S.sub.meetEdit = S.sub.meet; delete S.sub.meet; render(); };
    const mf = $('#mt-file'); if (mf) mf.onclick = async () => { const d = S.dept || Object.keys(DEPTS).find(k => (S.meetings[k] || []).some(x => x.id === S.sub.meet)); const f = await backend.get(`depts/${d}/meetingFiles/${S.sub.meet}`); if (!f || !f.data) { toast('원본 파일을 찾지 못했습니다'); return; } const bin = atob(f.data); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); saveBlob(new Blob([u8], { type: f.type || 'application/octet-stream' }), f.name || 'meeting'); };
    return; }
  const y = $('#mt-yr'); if (y) y.onchange = () => { S.sub.myr = y.value; renderHere(); };
  document.querySelectorAll('[data-meet]').forEach(r => r.onclick = () => { S.sub.meet = r.dataset.meet; render(); });
  const nw = $('#mt-new'); if (nw) nw.onclick = () => { S.sub.meetEdit = 'new'; render(); };
  const cc = $('#mf-cancel'); if (cc) cc.onclick = () => { delete S.sub.meetEdit; render(); };
  const sv = $('#mn-save'); if (sv) sv.onclick = async () => { const L = S.meetings[S.dept]; const old = S.sub.meetEdit === 'new' ? null : L.find(x => x.id === S.sub.meetEdit); const sp = v => v.split(/[,，、]+/).map(x => x.trim()).filter(Boolean);
    const o = Object.assign(old || { id: 'mt_' + uid(), dept: S.dept, kind: meetLabel(S.dept), created: today() }, { date: $('#mf-date').value, dateText: $('#mf-dtext').value.trim(), writer: $('#mf-writer').value.trim(), place: $('#mf-place').value.trim(), attendees: sp($('#mf-att').value), absentees: sp($('#mf-abs').value), topic: $('#mf-topic').value.trim(), body: $('#mf-body').value.trim(), next: $('#mf-next').value.trim(), note: $('#mf-note').value.trim() });
    if (!o.date) { toast('날짜를 넣어 주세요'); return; } const { _id, ...data } = o; await backend.set(`depts/${S.dept}/meetings/${o.id}`, data); if (!old) L.push(o); delete S.sub.meetEdit; S.sub.meet = o.id; render(); toast('저장했습니다'); };
  const dl = $('#mf-del'); if (dl) dl.onclick = () => { const L = S.meetings[S.dept]; const o = L.find(x => x.id === S.sub.meetEdit); openModal(`<h2>회의록 삭제<button class="btn s" id="modal-close">닫기</button></h2><p>${esc(o.date)} 회의록을 지울까요? 되돌릴 수 없습니다.</p><div class="row"><button class="btn d" id="md-yes">삭제</button><button class="btn" id="md-no">취소</button></div>`); $('#modal-close').onclick = closeModal; $('#md-no').onclick = closeModal; $('#md-yes').onclick = async () => { await backend.del(`depts/${S.dept}/meetings/${o.id}`); if (o.hasFile) await backend.del(`depts/${S.dept}/meetingFiles/${o.id}`).catch(() => {}); S.meetings[S.dept] = L.filter(x => x.id !== o.id); delete S.sub.meetEdit; closeModal(); render(); toast('삭제했습니다'); }; };
  const up = $('#mt-up'); if (up) up.onclick = () => { $('#mt-upbox').hidden = false; $('#mt-upbox').scrollIntoView({ block: 'start' }); };
  const fi = $('#mt-files'); if (fi) fi.onchange = async () => { const box = $('#mt-prev'); const files = [...fi.files]; if (!files.length) return; box.innerHTML = `<div class="note">${files.length}개 파일을 읽는 중…</div>`;
    const L = S.meetings[S.dept]; const items = [];
    for (const f of files) { try { const buf = await f.arrayBuffer(); const raw = cleanBylawText(await fileToRuleText(f, buf)); const p = parseMeetingText(raw, f.name); const dup = L.find(x => x.date === p.date && (x.topic || '') === (p.topic || '')) || items.find(y => y.p && y.p.date === p.date && (y.p.topic || '') === (p.topic || '')); items.push({ f, buf, p, raw, dup, ok: !!p.date }); } catch (e) { items.push({ f, err: e.message || '읽기 실패' }); } }
    const good = items.filter(x => !x.err && x.ok && !x.dup);
    box.innerHTML = `<div class="tw"><table><thead><tr><th>파일</th><th>날짜</th><th>주요안건</th><th>작성자</th><th class="n">참석</th><th>읽은 칸</th><th>처리</th></tr></thead><tbody>${items.map(x => x.err ? `<tr><td>${esc(x.f.name)}</td><td colspan="5" class="note">${esc(x.err)}</td><td><span class="pill bad">못 읽음</span></td></tr>` : `<tr><td class="wrap">${esc(x.f.name)}</td><td>${esc(x.p.date || '?')}</td><td class="wrap">${esc(x.p.topic)}</td><td>${esc(x.p.writer)}</td><td class="n">${x.p.attendees.length}</td><td class="note">${x.p.found.length}/9</td><td>${!x.ok ? '<span class="pill warn">날짜 없음 — 건너뜀</span>' : x.dup ? '<span class="pill mute">이미 있음 — 건너뜀</span>' : '<span class="pill ok">새로 넣음</span>'}</td></tr>`).join('')}</tbody></table></div>
      <div class="row" style="margin-top:8px"><button class="btn p" id="mt-import" ${good.length ? '' : 'disabled'}>${good.length}건 저장</button><span class="note">날짜를 못 찾은 파일은 "새 회의록"으로 직접 넣어 주세요. 저장한 뒤에도 각 회의록에서 고칠 수 있습니다.</span></div><pre class="progress" id="mt-prog"></pre>`;
    const go = $('#mt-import'); if (go) go.onclick = async () => { go.disabled = true; let n = 0; const fails = []; const prog = $('#mt-prog');
      const res = []; // 파일마다: 내용 저장 / 원본 보관·제외·실패
      for (const x of good) { prog.textContent = `저장 중 ${res.length + 1}/${good.length} · ${x.f.name}`;
        const r = { name: x.f.name, content: '', orig: '' };
        try { const id = 'mt_' + uid(); const o = { id, dept: S.dept, kind: meetLabel(S.dept), created: today(), ...x.p, fileName: x.f.name, imported: true, hasFile: false }; delete o.found;
          // 원본 파일 먼저(650KB 이하만) — 원본이 안 되어도 회의록 내용은 저장한다(결과에 따로 표시)
          if (x.f.size >= 650 * 1024) r.orig = `제외 (${Math.round(x.f.size / 1024)}KB — 650KB 넘는 원본은 앱에 보관하지 않음, 시놀로지에 보관)`;
          else { try { const u8 = new Uint8Array(await x.f.arrayBuffer()); let bin = ''; for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); await backend.set(`depts/${S.dept}/meetingFiles/${id}`, { name: x.f.name, type: x.f.type || '', size: x.f.size, data: btoa(bin) }); o.hasFile = true; r.orig = '보관'; } catch (e) { r.orig = '실패 — ' + (e.code || e.message); } }
          await backend.set(`depts/${S.dept}/meetings/${id}`, o); L.push(o); r.content = '저장';
        } catch (e) { r.content = '실패 — ' + (e.code || e.message); if (r.orig === '보관') r.orig += ' (내용 저장 실패로 쓰이지 않음)'; }
        res.push(r); }
      const okN = res.filter(r => r.content === '저장').length, origN = res.filter(r => r.orig === '보관').length;
      box.innerHTML = `<div class="tw"><table><thead><tr><th>파일</th><th>회의록 내용</th><th>원본 파일</th></tr></thead><tbody>${res.map(r => `<tr><td class="wrap">${esc(r.name)}</td><td>${r.content === '저장' ? '<span class="pill ok">저장</span>' : `<span class="pill bad">${esc(r.content)}</span>`}</td><td>${r.orig === '보관' ? '<span class="pill ok">보관</span>' : `<span class="pill warn">${esc(r.orig || '—')}</span>`}</td></tr>`).join('')}</tbody></table></div>
        <div class="row" style="margin-top:8px"><b>내용 ${okN}/${res.length}건 저장 · 원본 ${origN}/${res.length}개 보관</b><button class="btn" id="mt-done">목록 보기</button></div>`;
      $('#mt-done').onclick = () => render();
      toast(origN === okN && okN === res.length ? `회의록 ${okN}건과 원본을 모두 넣었습니다` : `내용 ${okN}건 저장 · 원본 ${origN}개 보관 — 결과표를 확인하세요`, 4500); }; };
};

/* ───────────── 주말학습 (교회 양식 "주말학습계획서" + 첨부 1 차량신청서 + 첨부 2 결과보고서) ─────────────
   depts/{부서}/outings/{id} — 부서가 계획서를 쓰고 출력해 결재(부장·교육디렉터·교육위원장·교장)를 받는다.
   상태: 작성 중 → 제출 → 승인 → 완료(결과보고). 차량이 필요하면 계획서에서 바로 차량 신청을 만든다. */
const OUT_STATUS = ['작성 중', '제출', '승인', '완료'];
const OUT_RULES = ['모든 주말학습 및 외부활동은 사전에 계획서를 제출하고 승인받은 후 진행합니다.', '늦어도 행사 1주 전까지 계획서를 제출해야 합니다.', '차량이 필요한 경우 차량신청서를 함께 제출해 주세요(첨부 1).', '주말학습 진행 후 반드시 1주일 이내 결과 보고서를 작성하여 제출하시기 바랍니다(첨부 2).', '승인 없이 진행한 행사에 대해서는 예산 집행이 제한될 수 있습니다.'];
S.outings = {};
async function loadOutings(d) { if (!S.outings[d]) { try { S.outings[d] = (await backend.list(`depts/${d}/outings`)).map(x => ({ ...x, id: x.id || x._id })); } catch (e) { S.outings[d] = []; S.outingsErr = e.code || e.message; } } return S.outings[d]; }
const outDays = o => { const a = (o.start || '').slice(0, 10), b = (o.end || '').slice(0, 10); return a ? fmtK(a) + (b && b !== a ? ' ~ ' + fmtK(b) : '') : '날짜 미정'; };
const outDT = x => x ? `${x.slice(0, 4)}년 ${+x.slice(5, 7)}월 ${+x.slice(8, 10)}일 ${x.length > 10 ? +x.slice(11, 13) + '시' + (+x.slice(14, 16) ? ' ' + +x.slice(14, 16) + '분' : '') : ''}`.trim() : '20&nbsp;&nbsp;&nbsp;년&nbsp;&nbsp;&nbsp;월&nbsp;&nbsp;&nbsp;일&nbsp;&nbsp;&nbsp;시';
const outSum = rows => (rows || []).reduce((t, r) => t + (Number(String(r.amount || '').replace(/[^\d-]/g, '')) || 0), 0);
function outSignBox(y) { y = y || YEAR; return `<table class="sign"><tr><th rowspan="3" style="width:22px">확<br>인</th><th>부장</th><th>교육디렉터</th><th>교육위원장</th><th>교장</th></tr><tr><td></td><td></td><td></td><td></td></tr><tr class="dt"><td>${y}.&nbsp;&nbsp;&nbsp;.&nbsp;&nbsp;&nbsp;.</td><td>${y}.&nbsp;&nbsp;&nbsp;.&nbsp;&nbsp;&nbsp;.</td><td>${y}.&nbsp;&nbsp;&nbsp;.&nbsp;&nbsp;&nbsp;.</td><td>${y}.&nbsp;&nbsp;&nbsp;.&nbsp;&nbsp;&nbsp;.</td></tr></table>`; }
function outHeadRows(o) {
  return `<tr><th>부 서 명</th><td colspan="3" class="split"><span>${esc(DEPTS[o.dept] || '')}</span><b>담 당 자</b><span>${esc(o.manager || '')}</span><span>${esc(o.minister || '')}${/(전도사|목사|강도사|간사)$/.test(String(o.minister || '').trim()) ? '' : ' 전도사'}</span><b>연 락 처</b><span>${esc(o.phone || '')}</span></td></tr>
    <tr><th>일 시</th><td colspan="3">${outDT(o.start)} ~ ${outDT(o.end)}</td></tr>
    <tr><th>장 소</th><td colspan="3">${esc(o.place || '')}</td></tr>
    <tr><th>목 적</th><td colspan="3">${esc(o.purpose || '')}</td></tr>`;
}
const outMoney = (rows, mid) => `<table class="inner"><thead><tr><th>항목</th><th>${mid}</th><th>금액</th></tr></thead><tbody>${[...(rows || []), ...Array(Math.max(0, 5 - (rows || []).length)).fill({})].map(r => `<tr><td>${esc(r.item || '')}</td><td>${esc(r.basis || r.desc || '')}</td><td class="n">${r.amount ? won(String(r.amount).replace(/[^\d-]/g, '')) : ''}</td></tr>`).join('')}${outSum(rows) ? `<tr><th colspan="2">합계</th><td class="n"><b>${won(outSum(rows))}</b></td></tr>` : ''}</tbody></table>`;
function outingPlanPaper(o) {
  return `<section class="paper outform">
    <div class="ohd"><div><div class="org">중앙성서교회 교육부</div><h1>주말학습계획서</h1><div class="rep">보 고 일 &nbsp; ${o.reportDate ? esc(fmtK(o.reportDate)) : `${String(o.start || '').slice(0, 4) || YEAR}년&nbsp;&nbsp;&nbsp;&nbsp;월&nbsp;&nbsp;&nbsp;&nbsp;일`}</div></div>${outSignBox(+String(o.start || '').slice(0, 4) || YEAR)}</div>
    <table class="kv ok"><tbody><tr><th>항 목</th><th colspan="3">내용</th></tr>${outHeadRows(o)}
      <tr><th>인 원</th><td colspan="3">${esc(o.people || '')}</td></tr>
      <tr><th>예 산</th><td colspan="3">${outMoney(o.budget, '산출 근거')}</td></tr>
      <tr><th>요청사항</th><td colspan="3" style="height:90px;vertical-align:top;white-space:pre-wrap">${esc(o.requests || '')}${o.vehicleId ? '\n※ 차량신청서 첨부' : ''}</td></tr></tbody></table>
    <ol class="orules">${OUT_RULES.map(r => `<li>${esc(r)}</li>`).join('')}</ol>
    <div class="ft"><b>중앙성서교회 교육부</b><span>CBCS에서 생성 · 주말학습계획서 ${esc((o.start || '').slice(0, 10))}</span></div></section>`;
}
function outingResultPaper(o) { const r = o.result || {};
  return `<section class="paper outform"><div class="att">첨부 2) 주말학습보고서</div><h1 class="ttl">주 말 학 습 결 과 보 고 서</h1>
    <table class="kv ok"><tbody><tr><th>항 목</th><th colspan="3">내용</th></tr>${outHeadRows(o)}
      <tr><th>참석인원</th><td colspan="3">${esc(r.attend || '')}</td></tr>
      <tr><th>진행내용</th><td colspan="3" style="height:200px;vertical-align:top;white-space:pre-wrap">${esc(r.content || '')}</td></tr>
      <tr><th>평 가</th><td colspan="3" style="height:90px;vertical-align:top;white-space:pre-wrap">${esc(r.eval || '')}</td></tr>
      <tr><th>예산사용<br>내 역</th><td colspan="3">${outMoney(r.spend, '내용')}</td></tr></tbody></table>
    <div class="ft"><b>중앙성서교회 교육부</b><span>CBCS에서 생성 · 주말학습결과보고서 ${esc((o.start || '').slice(0, 10))}</span></div></section>`;
}
const outRowsEditor = (id, rows, mid, key) => `<div class="out-rows" id="${esc(id)}">${[...(rows || []), {}].map(r => `<div class="row out-row"><input type="text" data-k="item" placeholder="항목" value="${esc(r.item || '')}"><input type="text" data-k="${esc(key)}" placeholder="${mid}" value="${esc(r[key] || '')}" style="flex:2"><input type="text" data-k="amount" placeholder="금액" inputmode="numeric" value="${esc(r.amount || '')}" style="max-width:120px"></div>`).join('')}</div><button class="btn s" data-addrow="${esc(id)}" data-mid="${esc(mid)}" data-key="${esc(key)}">줄 추가</button>`;
const readRows = id => [...document.querySelectorAll(`#${id} .out-row`)].map(r => Object.fromEntries([...r.querySelectorAll('input')].map(i => [i.dataset.k, i.value.trim()]))).filter(r => r.item || r.amount || r.basis || r.desc);
VIEWS.outings = async () => {
  const depts = isCommittee() ? Object.keys(DEPTS) : [S.dept]; for (const d of depts) await loadOutings(d);
  const all = depts.flatMap(d => S.outings[d].map(o => ({ ...o, dept: o.dept || d }))).sort((a, b) => (b.start || '') < (a.start || '') ? -1 : 1);
  const pr = S.sub.outPrint && all.find(o => o.id === S.sub.outPrint.id);
  if (pr) return `<div class="topbar no-print"><div><h1>${S.sub.outPrint.kind === 'result' ? '주말학습 결과보고서' : '주말학습계획서'}</h1></div><div class="row"><button class="btn" id="ot-back">돌아가기</button><button class="btn p" id="ot-pr">인쇄 / PDF로 저장</button></div></div>${S.sub.outPrint.kind === 'result' ? outingResultPaper(pr) : outingPlanPaper(pr)}${S.sub.outPrint.kind !== 'result' && pr.vehicleId && ((S.committee || {}).vehicles || []).find(v => v.id === pr.vehicleId) ? vehiclePaper(S.committee.vehicles.find(v => v.id === pr.vehicleId)) : ''}`;
  const ed = S.sub.outEdit ? (S.sub.outEdit === 'new' ? { id: '', dept: S.dept, status: '작성 중', budget: [], result: {} } : all.find(o => o.id === S.sub.outEdit)) : null;
  const dd = !isCommittee() ? D() : null; const staff = dd ? dd.doc.staff.filter(t => t.status !== 'left') : [];
  const defMgr = (staff.find(t => /부장/.test(t.role || '')) || {}).name || ''; const defMin = ((staff.find(t => /전도사|교역자|목사/.test(t.role || '')) || {}).name || '').replace(/\s*전도사$/, '');
  const mine = o => !isCommittee() && o.dept === S.dept;
  const pill = st => `<span class="pill ${st === '승인' ? 'ok' : st === '완료' ? 'info' : st === '제출' ? 'warn' : 'mute'}">${esc(st || '작성 중')}</span>`;
  return `<div class="topbar"><div><h1>주말학습</h1><div class="sub">교회 양식 "주말학습계획서"를 화면에서 쓰고 출력해 결재를 받습니다. 차량이 필요하면 계획서에서 바로 차량 신청(첨부 1)을 만들고, 다녀온 뒤 1주일 안에 결과보고서(첨부 2)를 씁니다.</div></div>${!isCommittee() && canEdit() && !ed ? '<div class="row"><button class="btn p" id="ot-new">새 계획서</button></div>' : ''}</div>
  <div class="stack">
    ${S.outingsErr ? `<div class="hint">불러오기 실패: ${esc(S.outingsErr)}</div>` : ''}
    ${ed ? `<div class="card" id="ot-form"><h2>${ed.id ? '계획서 수정' : '새 주말학습계획서'} <span class="r">${esc(DEPTS[ed.dept] || '')}</span></h2>
      <div class="fields">
        <label class="f" style="grid-column:span 2"><span>행사 이름</span><input type="text" id="ot-title" value="${esc(ed.title || '')}" placeholder="예: 가을 현장학습"></label>
        <label class="f"><span>보고일</span><input type="date" id="ot-rdate" value="${esc(ed.reportDate || today())}"></label>
        <label class="f"><span>상태</span><select id="ot-status">${OUT_STATUS.map(k => `<option ${(ed.status || '작성 중') === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
        <label class="f"><span>담당자</span><input type="text" id="ot-mgr" value="${esc(ed.manager ?? defMgr)}"></label>
        <label class="f"><span>전도사</span><input type="text" id="ot-min" value="${esc(ed.minister ?? defMin)}"></label>
        <label class="f"><span>연락처</span><input type="tel" id="ot-phone" value="${esc(ed.phone || '')}" placeholder="010-"></label>
        <label class="f"><span>인원</span><input type="text" id="ot-people" value="${esc(ed.people || '')}" placeholder="예: 학생 18명, 교사 4명"></label>
        <label class="f"><span>시작</span><input type="datetime-local" id="ot-start" value="${esc(ed.start || '')}"></label>
        <label class="f"><span>끝</span><input type="datetime-local" id="ot-end" value="${esc(ed.end || '')}"></label>
        <label class="f" style="grid-column:span 2"><span>장소</span><input type="text" id="ot-place" value="${esc(ed.place || '')}"></label>
        <label class="f" style="grid-column:1/-1"><span>목적</span><input type="text" id="ot-purpose" value="${esc(ed.purpose || '')}"></label>
      </div>
      <div class="note" style="margin:10px 0 4px">예산 (항목 · 산출 근거 · 금액)</div>${outRowsEditor('ot-budget', ed.budget, '산출 근거', 'basis')}
      <label class="f" style="margin-top:10px"><span>요청사항</span><textarea id="ot-req" rows="3">${esc(ed.requests || '')}</textarea></label>
      <details style="margin-top:12px" ${ed.status === '완료' || (ed.result && ed.result.content) ? 'open' : ''}><summary><b>결과보고서 (다녀온 뒤 1주일 안에)</b></summary>
        <div class="fields" style="margin-top:8px"><label class="f" style="grid-column:1/-1"><span>참석인원</span><input type="text" id="ot-r-att" value="${esc((ed.result || {}).attend || '')}"></label></div>
        <label class="f"><span>진행내용</span><textarea id="ot-r-content" rows="5">${esc((ed.result || {}).content || '')}</textarea></label>
        <label class="f"><span>평가</span><textarea id="ot-r-eval" rows="3">${esc((ed.result || {}).eval || '')}</textarea></label>
        <div class="note" style="margin:10px 0 4px">예산 사용 내역 (항목 · 내용 · 금액)</div>${outRowsEditor('ot-spend', (ed.result || {}).spend, '내용', 'desc')}
        ${ed.id && !isCommittee() ? `<div class="row" style="margin-top:10px"><button class="btn s" id="ot-to-rep">주일 보고서 활동에 넣기</button><button class="btn s" id="ot-to-exp">회계 지출 초안 만들기</button><span class="note">결과를 저장한 뒤 누르세요. 같은 행사는 두 번 들어가지 않습니다.</span></div>` : ''}</details>
      <div class="row" style="margin-top:12px"><button class="btn p" id="ot-save">저장</button><button class="btn" id="ot-cancel">닫기</button>${ed.id ? `<button class="btn" id="ot-car">${ed.vehicleId ? '연결된 차량 신청 열기' : '이 행사로 차량 신청 만들기'}</button><button class="btn d" id="ot-del">삭제</button>` : ''}</div></div>` : ''}
    <div class="card"><h2>${isCommittee() ? '전 부서 주말학습' : '우리 부서 주말학습'} <span class="r">${all.length}건</span></h2>${all.length ? `<div class="tw"><table><thead><tr><th>일시</th>${isCommittee() ? '<th>부서</th>' : ''}<th>행사</th><th>장소</th><th class="n">예산</th><th>차량</th><th>상태</th><th></th></tr></thead><tbody>
      ${all.map(o => `<tr><td>${esc(outDays(o))}</td>${isCommittee() ? `<td>${esc(DEPTS[o.dept] || '')}</td>` : ''}<td>${esc(o.title || o.purpose || '')}</td><td class="wrap">${esc(o.place || '')}</td><td class="n">${outSum(o.budget) ? won(outSum(o.budget)) : ''}</td><td>${o.vehicleId ? '신청함' : ''}</td><td>${isCommittee() && canEdit() ? `<select data-ot-st="${esc(o.dept)}|${o.id}">${OUT_STATUS.map(k => `<option ${(o.status || '작성 중') === k ? 'selected' : ''}>${k}</option>`).join('')}</select>` : pill(o.status)}</td>
        <td class="row" style="gap:4px;flex-wrap:nowrap">${mine(o) && canEdit() ? `<button class="btn s" data-ot-edit="${esc(o.id)}">수정</button>` : ''}<button class="btn s" data-ot-print="${esc(o.id)}|plan">계획서</button>${(o.result && (o.result.content || o.result.attend)) ? `<button class="btn s" data-ot-print="${esc(o.id)}|result">결과보고서</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : `<div class="note">아직 계획서가 없습니다.${!isCommittee() ? ' "새 계획서"로 시작하세요.' : ''}</div>`}</div>
    <div class="card"><h2>제출 규칙 <span class="r">교회 양식 안내문</span></h2><ol style="margin:0;padding-left:1.3em;line-height:1.8">${OUT_RULES.map(r => `<li>${esc(r)}</li>`).join('')}</ol></div>
  </div>`;
};
BIND.outings = () => {
  const bk = $('#ot-back'); if (bk) { bk.onclick = () => { delete S.sub.outPrint; render(); }; const p = S.sub.outPrint; $('#ot-pr').onclick = () => printAsPDF(`${p.kind === 'result' ? '주말학습결과보고서' : '주말학습계획서'}.pdf`); return; }
  const nw = $('#ot-new'); if (nw) nw.onclick = () => { S.sub.outEdit = 'new'; render(); };
  document.querySelectorAll('[data-ot-edit]').forEach(b => b.onclick = () => { S.sub.outEdit = b.dataset.otEdit; render().then(() => { const f = $('#ot-form'); if (f) f.scrollIntoView({ block: 'start' }); }); });
  document.querySelectorAll('[data-ot-print]').forEach(b => b.onclick = async () => { const [id, kind] = b.dataset.otPrint.split('|'); await loadShared(); S.sub.outPrint = { id, kind }; render(); });
  document.querySelectorAll('[data-addrow]').forEach(b => b.onclick = () => { const box = $('#' + b.dataset.addrow); const k = b.dataset.key; box.insertAdjacentHTML('beforeend', `<div class="row out-row"><input type="text" data-k="item" placeholder="항목"><input type="text" data-k="${esc(k)}" placeholder="${b.dataset.mid}" style="flex:2"><input type="text" data-k="amount" placeholder="금액" inputmode="numeric" style="max-width:120px"></div>`); });
  document.querySelectorAll('[data-ot-st]').forEach(sel => sel.onchange = async () => { const [d, id] = sel.dataset.otSt.split('|'); const o = S.outings[d].find(x => x.id === id); o.status = sel.value; try { await backend.set(`depts/${d}/outings/${id}`, (({ _id, ...x }) => x)(o)); toast('상태를 바꿨습니다'); } catch (e) { toast('저장 실패: ' + (e.code || e.message), 4000); } });
  const cc = $('#ot-cancel'); if (cc) cc.onclick = () => { delete S.sub.outEdit; render(); };
  const getEd = () => S.sub.outEdit === 'new' ? null : S.outings[S.dept].find(o => o.id === S.sub.outEdit);
  const collect = () => { const old = getEd(); const o = Object.assign(old || { id: 'ot_' + uid(), dept: S.dept, created: today() }, { title: $('#ot-title').value.trim(), reportDate: $('#ot-rdate').value, status: $('#ot-status').value, manager: $('#ot-mgr').value.trim(), minister: $('#ot-min').value.trim(), phone: $('#ot-phone').value.trim(), people: $('#ot-people').value.trim(), start: $('#ot-start').value, end: $('#ot-end').value, place: $('#ot-place').value.trim(), purpose: $('#ot-purpose').value.trim(), budget: readRows('ot-budget'), requests: $('#ot-req').value.trim(),
      result: { attend: $('#ot-r-att').value.trim(), content: $('#ot-r-content').value.trim(), eval: $('#ot-r-eval').value.trim(), spend: readRows('ot-spend') } }); return { o, isNew: !old }; };
  const save = async () => { const { o, isNew } = collect(); if (!o.start) { toast('시작 일시를 넣어 주세요'); return null; } const { _id, ...data } = o; await backend.set(`depts/${S.dept}/outings/${o.id}`, data); if (isNew) S.outings[S.dept].push(o); S.sub.outEdit = o.id; return o; };
  const sv = $('#ot-save'); if (sv) sv.onclick = async () => { try { if (await save()) { await renderHere(); toast('저장했습니다'); } } catch (e) { toast('저장 실패: ' + (e.code || e.message), 4000); } };
  const dl = $('#ot-del'); if (dl) dl.onclick = () => { const o = getEd(); if (!o) return; openModal(`<h2>계획서 삭제<button class="btn s" id="modal-close">닫기</button></h2><p>"${esc(o.title || o.purpose || '주말학습')}" 계획서를 지울까요? 되돌릴 수 없습니다. 연결된 차량 신청은 차량 신청 화면에 그대로 남습니다.</p><div class="row"><button class="btn d" id="od-yes">삭제</button><button class="btn" id="od-no">취소</button></div>`); $('#modal-close').onclick = closeModal; $('#od-no').onclick = closeModal; $('#od-yes').onclick = async () => { await backend.del(`depts/${S.dept}/outings/${o.id}`); S.outings[S.dept] = S.outings[S.dept].filter(x => x.id !== o.id); delete S.sub.outEdit; closeModal(); render(); toast('삭제했습니다'); }; };
  // 결과 → 주일 보고서: 행사 뒤 첫 주일(그날이 주일이면 그날) 보고서의 "예배 및 활동"에 한 줄 덧붙임. outingLinks로 두 번 들어가지 않게
  const tr = $('#ot-to-rep'); if (tr) tr.onclick = async () => { const o = await save(); if (!o) return; const dd = D(); const st = new Date(o.start.slice(0, 10) + 'T00:00:00'); st.setDate(st.getDate() + (7 - st.getDay()) % 7); const dt = iso(st);
    const r = dd.reports[dt] || blankReport(dd, dt); dd.reports[dt] = r; r.outingLinks = { ...(r.outingLinks || {}) };
    if (r.outingLinks[o.id]) { toast(`${fmtK(dt)} 보고서에 이미 넣었습니다`); return; }
    const res = o.result || {}; const line = `주말학습: ${o.title || o.purpose || ''}${o.place ? ' (' + o.place + ')' : ''}${res.attend ? ' — ' + res.attend : ''}${res.content ? '. ' + res.content.split('\n')[0] : ''}`;
    r.activity = [String(r.activity || '').replace(/\s+$/, ''), line].filter(Boolean).join('\n'); r.outingLinks[o.id] = today(); await saveReport(dd, r); toast(`${fmtK(dt)} 주일 보고서 활동에 넣었습니다`); };
  // 결과 → 회계 지출 초안: 사용 내역 줄마다 지출 1건. 아이디를 행사·줄 번호로 정해 다시 눌러도 겹치지 않음. "확인 필요" 표시를 달아 영수증·장부 확인 뒤 정리
  const te = $('#ot-to-exp'); if (te) te.onclick = async () => { const o = await save(); if (!o) return; const dd = D(); const rows = ((o.result || {}).spend || []).filter(x => +String(x.amount || '').replace(/[^0-9]/g, ''));
    if (!rows.length) { toast('결과보고서의 예산 사용 내역(금액)을 먼저 적어 주세요'); return; }
    const y = +o.start.slice(0, 4); const led = dd.doc.ledgers.find(l => l.kind === 'budget' && +(l.year || YEAR) === y) || dd.doc.ledgers.find(l => +(l.year || YEAR) === y) || dd.doc.ledgers[0];
    if (!led) { toast('회계 장부가 없습니다'); return; }
    const date = (o.end || o.start).slice(0, 10); const mk = (x, i) => ({ id: `e_out_${o.id}_${i}`, dept: dd.id, ledgerId: led.id, date, category: x.item || '주말학습', desc: `${o.title || '주말학습'} — ${x.desc || x.item || ''}`.trim(), amount: +String(x.amount).replace(/[^0-9]/g, ''), requester: o.manager || '', approver: '', receipt: false, settled: '', note: '', flags: ['주말학습 결과에서 만든 지출 초안 — 영수증·장부 확인'], source: '주말학습 결과', outingId: o.id });
    const list = rows.map(mk); const fresh = list.filter(e => !dd.expenses.some(x => x.id === e.id));
    openModal(`<h2>회계 지출 초안 만들기<button class="btn s" id="modal-close">닫기</button></h2><p>${esc(led.name || '장부')}에 아래 ${fresh.length}건을 지출로 넣습니다. 각 건에 "확인 필요"가 붙으니, 영수증과 맞춰 본 뒤 회계에서 정리하세요.${list.length > fresh.length ? ` (이미 넣은 ${list.length - fresh.length}건은 건너뜀)` : ''}</p>${fresh.length ? `<div class="tw"><table><thead><tr><th>날짜</th><th>항목</th><th>내역</th><th class="n">금액</th></tr></thead><tbody>${fresh.map(e => `<tr><td>${esc(e.date)}</td><td>${esc(e.category)}</td><td>${esc(e.desc)}</td><td class="n">${won(e.amount)}</td></tr>`).join('')}</tbody></table></div><div class="row" style="margin-top:10px"><button class="btn p" id="oe-go">넣기</button></div>` : '<p class="note">새로 넣을 것이 없습니다.</p>'}`);
    $('#modal-close').onclick = closeModal; const go = $('#oe-go'); if (go) go.onclick = async () => { for (const e of fresh) { await backend.set(`depts/${dd.id}/expenses/${e.id}`, e); dd.expenses.push(e); } closeModal(); toast(`지출 초안 ${fresh.length}건을 넣었습니다 — 회계에서 확인하세요`); }; };
  const car = $('#ot-car'); if (car) car.onclick = async () => { try { const o = await save(); if (!o) return; const c = await loadShared();
      if (!o.vehicleId || !c.vehicles.find(v => v.id === o.vehicleId)) { const v = { id: 'vh_' + uid(), dept: S.dept, created: today(), date: o.start.slice(0, 10), dateEnd: (o.end || '').slice(0, 10) > o.start.slice(0, 10) ? o.end.slice(0, 10) : '', start: o.start.slice(11, 16), end: (o.end || '').slice(11, 16), vehicle: '', people: (o.people.match(/\d+/g) || []).reduce((t, n) => t + +n, 0) || '', dest: o.place, purpose: o.title || o.purpose, requester: o.manager, requesterPhone: o.phone, status: '신청', outingId: o.id };
        const { id, ...data } = v; await backend.set(`vehicles/${v.id}`, { id, ...data }); c.vehicles.push(v); o.vehicleId = v.id; await backend.set(`depts/${S.dept}/outings/${o.id}`, (({ _id, ...x }) => x)(o)); }
      const v = c.vehicles.find(x => x.id === o.vehicleId); S.view = 'vehicles'; S.sub = { month: ym(v.date), vehEdit: v.id }; await render(); const f = $('#vh-form'); if (f) f.scrollIntoView({ block: 'start' }); toast('차량 신청서를 만들었습니다 — 차량·운전자를 채워 저장하세요', 4000); } catch (e) { toast('차량 신청 실패: ' + (e.code || e.message), 4000); } };
};
/* ───────────── 자료 내려받기 · 영수증 사진 정리 (교육위원회) ─────────────
   새 자료 종류(하위 묶음)를 만들면 아래 두 목록에 이름을 추가해야 내려받기에 포함된다. */
const BACKUP_DEPT_SUBS = ['monthlySnaps', 'bylawFiles', 'students', 'reports', 'expenses', 'incomes', 'events', 'notices', 'assets', 'plans', 'timeline', 'officers', 'retreats', 'receipts', 'receiptImgs', 'bylaws', 'assemblies', 'outings', 'meetings', 'meetingFiles']; // care(심방 카드)는 부서 관리자만 읽을 수 있어 넣지 못함
const BACKUP_TOP = ['scholarship', 'archive', 'promotions', 'vehicles', 'siblings', 'meta'];
async function collectAll(withImgs, say) {
  const raw = []; const miss = []; const put = (path, x) => { const { _id, ...data } = x; raw.push({ path, data }); };
  const grab = async path => { try { (await backend.list(path)).forEach(x => put(`${path}/${x._id}`, x)); } catch (e) { miss.push(path); } };
  for (const d of Object.keys(DEPTS)) {
    say(`${DEPTS[d]} 읽는 중…`);
    try { const doc = await backend.get(`depts/${d}`); if (doc) raw.push({ path: `depts/${d}`, data: doc }); } catch (e) { miss.push(`depts/${d}`); }
    for (const sub of BACKUP_DEPT_SUBS) { if (sub === 'receiptImgs' && !withImgs) continue; await grab(`depts/${d}/${sub}`); }
  }
  say('교육위원회 자료 읽는 중…');
  try { const doc = await backend.get('committee/main'); if (doc) raw.push({ path: 'committee/main', data: doc }); } catch (e) { miss.push('committee/main'); }
  await grab('committee/main/notices'); await grab('committee/main/events');
  for (const t of BACKUP_TOP) await grab(t);
  return { raw, miss };
}
function downloadText(name, text) { const a = document.createElement('a'); const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); }
VIEWS.backup = async () => {
  const c = await loadShared(); const last = (c.backupMeta || {}).at || '';
  const counts = []; for (const d of Object.keys(DEPTS)) { const dd = await loadDept(d); await loadReceipts(dd); counts.push({ d, n: dd.receipts.length, pend: pendingReceipts(dd).length, err: dd.receiptsErr }); }
  const total = counts.reduce((a, x) => a + x.n, 0);
  const bm = c.backupMeta || {};
  return `<div class="topbar"><div><h1>백업 · 복원</h1><div class="sub">교육위원회 전용 · 한 달에 한 번 전체 자료를 파일로 받아 시놀로지에 보관하고, 필요할 때 그 파일로 되돌립니다</div></div></div>
  <div class="stack">
    <div class="card"><h2>1. 전체 자료 백업 <span class="r">${bm.fullAt ? '마지막 정상 백업: ' + esc(bm.fullAt) + (bm.fullCount ? ` · ${bm.fullCount}건` : '') : last && !bm.partial ? '마지막: ' + esc(last) : '정상 백업 기록 없음'}${bm.partial ? ` · <span class="pill warn">${esc(bm.at)} 부분 백업(${(bm.miss || []).length}묶음 못 읽음)</span>` : ''}</span></h2>
      <p style="margin:0 0 10px">네 부서의 출석부·보고서·회계·물품대장·연간계획서·교회생활·주말학습과 교육위원회 공지·일정·장학·차량 신청을 파일 하나(JSON)로 받습니다. 한 묶음이라도 읽지 못하면 "부분 백업"으로 따로 표시하고, 정상 백업 날짜는 바꾸지 않습니다. 심방 카드는 부서 관리자 비밀번호로 잠겨 있어 교육위원회도 읽을 수 없으므로 이 파일에 들어가지 않습니다(각 부서 관리자 모드에서 따로 받습니다).</p>
      <div class="row"><button class="btn p" id="bk-go">전체 자료 내려받기</button><label class="row" style="font-size:12.5px"><input type="checkbox" id="bk-img"> 영수증 사진도 포함 (파일이 커집니다)</label></div>
      <pre class="progress" id="bk-log" style="margin-top:10px"></pre>
      <div class="hint" style="margin-top:10px">이 파일에는 학생 연락처·주소와 장학 계좌번호가 들어 있습니다. 시놀로지의 교육위원회 폴더에만 두고, 카톡이나 메일로 보내지 마세요. 받은 뒤에는 컴퓨터의 "다운로드" 폴더에서 지워 주세요.</div></div>
    <div class="card"><h2>2. 백업 파일로 되돌리기 (복원)</h2>
      <p style="margin:0 0 10px">백업 파일을 고르면 <b>먼저 무엇이 바뀌는지 보여 주고</b>, 확인을 누를 때만 올립니다. 파일에 있는 자료는 그 날의 내용으로 덮어쓰고, <b>파일에 없는 자료(백업 뒤에 새로 만든 것)는 지우지 않습니다</b>(병합 복원). 되돌리기 전에 지금 상태를 먼저 백업해 두세요.</p>
      <input type="file" id="rt-file" accept="application/json,.json"><div id="rt-preview" style="margin-top:10px"></div></div>
    <div class="card"><h2>3. 영수증 사진 정리 <span class="r">지금 ${total}장</span></h2>
      <p style="margin:0 0 10px">영수증 사진은 입력을 돕는 용도이고 증빙은 실물 영수증입니다. 연말 결산과 감사가 끝나면 그 해 사진을 한꺼번에 지웁니다. 회계 장부의 지출 기록은 그대로 남습니다.</p>
      <div class="tw"><table><thead><tr><th>부서</th><th class="n">보관 중인 사진</th><th class="n">결의서 없는 사진</th></tr></thead><tbody>${counts.map(x => `<tr><td>${DEPTS[x.d]}</td><td class="n">${x.err ? '읽기 실패' : x.n}</td><td class="n">${x.err ? '' : x.pend}</td></tr>`).join('')}</tbody></table></div>
      <div class="row" style="margin-top:10px"><select id="bk-year" style="width:auto">${[YEAR, YEAR - 1, YEAR - 2].map(y => `<option value="${esc(y)}" ${y === YEAR - 1 ? 'selected' : ''}>${y}년까지</option>`).join('')}</select><button class="btn d" id="bk-purge">결산 완료 — 영수증 사진 삭제</button><span class="note">고른 해의 12월 31일까지 올라온 사진을 지웁니다. 되돌릴 수 없습니다.</span></div></div>
    <details class="card"><summary><b>4. 처음 옮길 때 쓰던 도구 · 교인명부 넣기</b> <span class="note">해마다 한 번(교인명부) 또는 거의 쓰지 않음</span></summary><div style="margin-top:10px">${importCardsHTML()}</div></details>
  </div>`;
};
const BACKUP_PATH_OK = p => /^depts\/(kinder|elem|youth|young)(\/[A-Za-z]+\/[^/]+)?$/.test(p) && !/\/care\//.test(p) || /^committee\/main(\/(notices|events)\/[^/]+)?$/.test(p) || /^(scholarship|archive|promotions|vehicles|siblings|meta)\/[^/]+$/.test(p);
const backupColOf = p => { const a = p.split('/'); return a[0] === 'depts' ? (a.length > 2 ? `${DEPTS[a[1]] || a[1]} · ${a[2]}` : `${DEPTS[a[1]] || a[1]} · 부서 설정`) : a[0] === 'committee' ? (a.length > 2 ? `교육위원회 · ${a[2]}` : '교육위원회 · 설정') : a[0]; };
BIND.backup = () => {
  if (typeof BIND.import === 'function' && $('#im-file')) BIND.import();
  const rf = $('#rt-file'); if (rf) rf.onchange = async e => { const f = e.target.files[0]; const box = $('#rt-preview'); if (!f) return; box.innerHTML = '<div class="note">파일을 읽고, 지금 서버 자료와 비교하는 중…</div>';
    try { const pay = JSON.parse(await f.text()); if (!pay || pay.kind !== 'cbcs-backup' || !Array.isArray(pay.raw)) throw new Error('CBCS 백업 파일이 아닙니다');
      const ok = pay.raw.filter(x => x && typeof x.path === 'string' && x.data && typeof x.data === 'object' && BACKUP_PATH_OK(x.path)); const bad = pay.raw.length - ok.length;
      const groups = {}; ok.forEach(x => { const a = x.path.split('/'); const col = a.length % 2 === 0 ? a.slice(0, -1).join('/') : a.join('/'); (groups[col] = groups[col] || []).push(x); });
      // 지금 서버 자료와 비교 — 읽기에 실패한 묶음은 "0건"으로 치지 않고 "비교 못 함"으로 표시하고, 하나라도 있으면 되돌리기를 막는다
      const rows = []; for (const [col, items] of Object.entries(groups)) { let exist = new Set(), fail = ''; try { if (col.split('/').length % 2 === 1) exist = new Set((await backend.list(col)).map(d => `${col}/${d._id}`)); else { const d = await backend.get(col); if (d) exist.add(col); } } catch (er) { fail = er.code || er.message || '읽기 실패'; } const over = fail ? null : items.filter(x => exist.has(x.path)).length; rows.push({ col, n: items.length, over, add: fail ? null : items.length - over, fail }); }
      const failed = rows.filter(r => r.fail);
      const tot = rows.reduce((t, r) => ({ n: t.n + r.n, over: t.over + (r.over || 0), add: t.add + (r.add || 0) }), { n: 0, over: 0, add: 0 });
      box.innerHTML = `<div class="note">${esc(f.name)} · 만든 날 ${esc((pay.generated || '').slice(0, 10))}${pay.partial ? ' · <span class="pill warn">부분 백업 파일</span>' : ''}${bad ? ` · 형식이 맞지 않아 뺀 항목 ${bad}건` : ''}</div>
        <div class="tw" style="margin-top:6px"><table><thead><tr><th>묶음</th><th class="n">파일 속</th><th class="n">덮어씀</th><th class="n">새로 생김</th></tr></thead><tbody>${rows.sort((a, b) => a.col.localeCompare(b.col)).map(r => `<tr><td>${esc(backupColOf(r.col + '/x'))}</td><td class="n">${r.n}</td>${r.fail ? `<td colspan="2"><span class="pill bad">비교 못 함</span> <span class="note">${esc(r.fail)}</span></td>` : `<td class="n">${r.over || ''}</td><td class="n">${r.add || ''}</td>`}</tr>`).join('')}<tr><th>합계</th><td class="n"><b>${tot.n}</b></td><td class="n"><b>${failed.length ? '?' : tot.over}</b></td><td class="n"><b>${failed.length ? '?' : tot.add}</b></td></tr></tbody></table></div>
        ${failed.length ? `<div class="hint" style="margin-top:8px">지금 서버 자료 ${failed.length}묶음을 읽지 못해 무엇이 덮어써질지 알 수 없습니다. 인터넷 연결을 확인하고 파일을 다시 골라 비교해 주세요. 비교가 끝나기 전에는 되돌릴 수 없습니다.</div>` : `<div class="row" style="margin-top:8px"><button class="btn d" id="rt-go">${tot.n}건 되돌리기</button><span class="note">파일에 없는 자료는 그대로 둡니다(병합 복원 — 백업 날의 상태와 똑같이 만드는 것은 아님).</span></div>`}<pre class="progress" id="rt-log"></pre>`;
      if (failed.length) return;
      $('#rt-go').onclick = () => { openModal(`<h2>백업으로 되돌리기<button class="btn s" id="modal-close">닫기</button></h2><p>${esc((pay.generated || '').slice(0, 10))} 백업으로 <b>${tot.over}건을 덮어쓰고 ${tot.add}건을 새로 만듭니다.</b> 그 뒤에 고친 내용은 사라집니다. 계속할까요?</p><div class="row"><button class="btn d" id="rt-yes">되돌리기</button><button class="btn" id="rt-no">취소</button></div>`); $('#modal-close').onclick = closeModal; $('#rt-no').onclick = closeModal;
        $('#rt-yes').onclick = async () => { closeModal(); const lg = $('#rt-log'); try { await backend.batchSet(ok.map(x => ({ path: x.path, data: x.data })), (a, b) => { lg.textContent = `진행 ${a}/${b}`; }); lg.textContent = `완료 — ${ok.length}건을 되돌렸습니다. 새로고침하면 반영됩니다.`; S.data = {}; S.committee = null; } catch (er) { lg.textContent = '되돌리기 실패: ' + (er.code || er.message); } }; };
    } catch (er) { box.innerHTML = `<div class="hint">${esc(er.message || '파일을 읽지 못했습니다')}</div>`; } };
  const log = m => { const el = $('#bk-log'); if (el) el.textContent = m; };
  const go = $('#bk-go'); if (go) go.onclick = async () => {
    go.disabled = true;
    try { const { raw, miss } = await collectAll($('#bk-img').checked, log); const byCol = {}; raw.forEach(x => { const k = backupColOf(x.path); byCol[k] = (byCol[k] || 0) + 1; });
      const payload = { kind: 'cbcs-backup', schemaVersion: 1, generated: new Date().toISOString(), year: YEAR, count: raw.length, partial: miss.length > 0, missing: miss, collections: byCol, raw };
      downloadText(`CBCS-backup-${today()}.json`, JSON.stringify(payload));
      try { const prev = S.committee.backupMeta || {}; const meta = miss.length ? { ...prev, at: today(), count: raw.length, partial: true, miss } : { at: today(), count: raw.length, partial: false, miss: [], fullAt: today(), fullCount: raw.length }; await backend.set('meta/backup', meta); S.committee.backupMeta = meta; } catch (e) {}
      log(`${raw.length}건을 내려받았습니다.${miss.length ? `\n⚠ 부분 백업 — 읽지 못한 묶음 ${miss.length}개: ` + miss.join(', ') : '\n정상 백업(빠진 묶음 없음)'}\n파일을 시놀로지 교육위원회 폴더로 옮겨 주세요.`); renderHere(); }
    catch (e) { log('내려받기 실패: ' + (e.code || e.message)); }
    go.disabled = false;
  };
  const pg = $('#bk-purge'); if (pg) pg.onclick = () => { const y = +$('#bk-year').value; const lim = `${y}-12-31`;
    const targets = Object.keys(DEPTS).map(d => ({ dd: S.data[d], list: ((S.data[d] || {}).receipts || []).filter(r => (r.at || r.date || '') <= lim) })).filter(x => x.dd);
    const n = targets.reduce((a, x) => a + x.list.length, 0); if (!n) { toast(`${y}년까지 올라온 영수증 사진이 없습니다`); return; }
    openModal(`<h2>영수증 사진 삭제<button class="btn s" id="modal-close">닫기</button></h2><p>${y}년 12월 31일까지 올라온 영수증 사진 <b>${n}장</b>을 지웁니다. 결산과 감사가 끝났는지 확인해 주세요. 되돌릴 수 없습니다.</p><div class="row"><button class="btn d" id="bk-purge-yes">${n}장 삭제</button><button class="btn" id="bk-purge-no">취소</button></div>`);
    $('#bk-purge-no').onclick = closeModal; $('#bk-purge-yes').onclick = async () => { $('#bk-purge-yes').disabled = true; let done = 0; try { for (const { dd, list } of targets) for (const r of list) { await deleteReceipt(dd, r.id); done++; } closeModal(); render(); toast(`영수증 사진 ${done}장을 지웠습니다`, 3200); } catch (e) { closeModal(); render(); toast(`${done}장 삭제 후 멈췄습니다: ` + (e.code || e.message), 5000); } }; };
};


/* ───────────── 출석부 연도별 보기 · 라피끄 · 과거 출석부 가져오기 ───────────── */
// 청년부 구분(그해 기준): 라피끄가 있던 해에는 1청년·2청년·라피끄로 나눠 보여 준다. 2청년은 그해 팸 이름에 "2청"이 있을 때
function youngDiv(s, yr) { const h = (s.history || []).find(x => +x.year === +yr); const g = h && h.group ? h.group : (+yr === YEAR ? (s.group || '청년') : '청년'); if (g === '라피끄') return '라피끄'; return /2청/.test((h && h.classId) || '') ? '2청년' : '1청년'; }
// 팸장: 재적(회원)에 넣지 않고 따로 본다. 올해는 교사·임원 명단, 지난 해는 임원 이력에서
// 명단 상태 순서: 재적(새친구·장기결석 포함) → 팸장 등 교사·임원 → 제적
const YOUNG_GRAD_KINDS = ['결혼', '직분', '졸업', '상급 부서 진급'];
const isYoungStu = s => s.dept === 'young' || String(s.id || '').startsWith('young_');
// 청년부 졸업·자격 종료: 결혼·직분(회칙 4조) 또는 졸업 처리 — 출석부·출석 체크·통계에서 뺀다
const marriedYear = s => +String(s.marriedDate || '').slice(0, 4) || 0;
// 결혼한 해까지는 청년부에 소속(관례): 결혼한 다음 해부터 자격 종료. 결혼 연도를 모르면 바로 종료
const marriedOut = s => !!s.married && (!marriedYear(s) || marriedYear(s) < YEAR);
const isGrad = s => isYoungStu(s) && (marriedOut(s) || !!s.churchRole || (s.status === 'left' && YOUNG_GRAD_KINDS.includes(s.leftKind) && !(s.leftKind === '결혼' && s.married && !marriedOut(s))));
// 지금 교사·임원 명단에서 팸장·부팸장으로 임명된 사람 (결혼·직분으로 회원이 아니어도 팸장 탭에 둔다)
const isFamStaff = (dd, s) => !!dd && dd.doc.staff.some(t => t.status !== 'left' && /팸장/.test(t.role || '') && normName(t.name) === normName(s.name));
function rosterCats(dd) {
  const young = dd.id === 'young'; const c = { active: [], newcomer: [], away: [], paused: [], left: [], archived: [], grad: [] };
  for (const s of dd.students) {
    if (young && isFamStaff(dd, s) && (isGrad(s) || s.status === 'left' || s.group === '팸장')) continue; // 팸장 탭에서 본다
    if (young && isGrad(s)) { c.grad.push(s); continue; }
    if (young && s.group === '팸장') continue; // 팸장 탭에서 본다
    if (s.status === 'left') { if (s.archived) c.archived.push(s); else if (!(young && isStaffName(dd, s))) c.left.push(s); continue; }
    (s.status === 'newcomer' ? c.newcomer : PAUSE.includes(s.status) ? c.paused : AWAY.includes(s.status) ? c.away : c.active).push(s);
  }
  return c;
}
function gradReason(s) { return [s.married ? `결혼${s.marriedDate ? ' ' + s.marriedDate : ''}` : '', s.churchRole ? `직분: ${s.churchRole}` : '', s.status === 'left' && s.leftKind && s.leftKind !== '제적' && !(s.leftKind === '결혼' && s.married) && !(s.leftKind === '직분' && s.churchRole) ? s.leftKind : ''].filter(Boolean).join(' · '); }
function gradSection(dd, list) {
  const sorted = list.slice().sort((a, b) => (b.leftDate || b.marriedDate || '') < (a.leftDate || a.marriedDate || '') ? -1 : (b.leftDate || b.marriedDate || '') > (a.leftDate || a.marriedDate || '') ? 1 : a.name.localeCompare(b.name, 'ko'));
  return `<div class="stack"><div class="card"><h2>졸업·자격 종료 <span class="r">${list.length}명 · 결혼 ${list.filter(s => s.married).length} · 직분 ${list.filter(s => s.churchRole).length}</span></h2>
    <div class="tw"><table class="roster"><thead><tr><th class="n no">번호</th><th>이름</th><th>사유</th><th>처리일</th><th>성별</th><th>생년월일</th><th>마지막 출석</th><th>연락처</th><th>비고</th></tr></thead><tbody>
    ${sorted.map((s, i) => `<tr class="click" data-student="${esc(s.id)}"><td class="n no">${i + 1}</td><td>${esc(s.name)}</td><td><span class="pill info">${esc(gradReason(s) || '졸업')}</span></td><td>${esc(s.leftDate || '')}</td><td>${esc(s.sex || '')}</td><td>${esc(s.birth || '')}</td><td>${lastAttended(dd, s) || ''}</td><td>${esc(phoneLabel(s))}</td><td class="wrap note">${esc(s.note || '')}</td></tr>`).join('') || '<tr><td colspan="9" class="note">아직 없습니다.</td></tr>'}
    </tbody></table></div>
    <p class="note" style="margin-top:8px">학생 카드에서 <b>결혼</b>을 "기혼"으로 하거나 <b>직분</b>을 고르면 자동으로 여기로 옮겨집니다. 졸업은 상태를 "제적", 제적 구분을 "졸업"으로 하면 됩니다. 되돌리려면 학생 카드에서 그 값을 지우세요.</p></div></div>`;
}
const isStaffName = (dd, s) => dd.doc.staff.some(t => t.status !== 'left' && normName(t.name) === normName(s.name));
const statusRank = (dd, s) => s.status !== 'left' ? 0 : isStaffName(dd, s) ? 1 : 2;
function famLeaders(dd, yr) {
  const isFam = r => /팸장/.test(r || ''); const out = new Map();
  const hists = dd.students.flatMap(s => (s.history || []).filter(h => +h.year === +yr && (!h.dept || h.dept === dd.id))).map(h => h.classId || '');
  const famOfName = n => (+yr === YEAR ? (dd.doc.classes.find(c => String(c.teacher || '').split(/[,·\s]+/).includes(n)) || {}).name : '') || hists.find(c => c.includes(n)) || '';
  if (+yr === YEAR) dd.doc.staff.filter(t => t.status !== 'left' && isFam(t.role)).forEach(t => out.set(normName(t.name), { name: t.name, role: roleParts(t.role).filter(isFam).join(', ') || t.role, other: roleParts(t.role).filter(x => !isFam(x)).join(', '), phone: t.phone || '' }));
  if (+yr === YEAR) dd.students.filter(s => s.group === '팸장' && s.status !== 'left').forEach(s => { if (!out.has(normName(s.name))) out.set(normName(s.name), { name: s.name, role: '팸장', other: '', phone: s.phone || '' }); });
  (dd.officers || []).filter(o => +o.year === +yr && isFam(o.role)).forEach(o => { if (!out.has(normName(o.name))) out.set(normName(o.name), { name: o.name, role: o.role, other: '', phone: '' }); });
  return [...out.values()].map(x => { const stu = dd.students.find(s => normName(s.name) === normName(x.name)); return { ...x, fam: famOfName(x.name) || (+yr === YEAR && stu && stu.group === '팸장' ? ((classOf(dd, stu) || {}).name || '') : ''), stu }; }).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}
function famLeaderBody(dd, yr) {
  const list = famLeaders(dd, yr);
  const reps = Object.values(dd.reports).filter(r => r.date.startsWith(String(yr)) && (Object.keys(r.att || {}).length || (r.teachersPresent || []).length)).sort((a, b) => a.date < b.date ? -1 : 1);
  const yearsOf = n => [...new Set([...(dd.officers || []).filter(o => normName(o.name) === normName(n) && /팸장/.test(o.role || '')).map(o => +o.year), ...(dd.doc.staff.some(t => t.status !== 'left' && /팸장/.test(t.role || '') && normName(t.name) === normName(n)) ? [YEAR] : [])])].sort();
  return `  <div class="card"><div class="tw"><table class="roster"><thead><tr><th class="n no">번호</th><th>이름</th><th>직책</th><th>맡은 팸</th><th>다른 직책</th><th>연락처</th><th class="n">${yr} 예배 참석</th><th>참석 띠</th><th>팸장 맡은 해</th></tr></thead><tbody>
  ${list.map((x, i) => { const who = x.stu || { id: '', name: x.name }; const ev = reps.map(r => attEvidence(r, who).v); const n = ev.filter(Boolean).length;
    return `<tr${x.stu ? ` class="click" data-student="${esc(x.stu.id)}"` : ''}><td class="n no">${i + 1}</td><td>${esc(x.name)}</td><td><span class="pill info">${esc(x.role)}</span></td><td>${esc(x.fam)}</td><td class="note">${esc(x.other)}</td><td>${esc(x.phone || (x.stu ? phoneLabel(x.stu) : ''))}</td><td class="n">${reps.length ? `${n}/${reps.length}` : '—'}</td><td><div class="ystrip">${ev.map((v, k) => `<span class="yw ${v === 'P' || v === 'T' || v === 'U' ? 'p' : v === 'O' ? 'o' : 'x'}" title="${reps[k].date}"></span>`).join('')}</div></td><td class="note">${yearsOf(x.name).join(', ')}</td></tr>`; }).join('') || `<tr><td colspan="9" class="note">${yr}년 팸장 기록이 없습니다.</td></tr>`}
  </tbody></table></div><p class="note" style="margin-top:8px">예배 참석은 주일 보고서의 출석 체크와 "예배에 참석한 교사·임원" 칸에서 셉니다. 학생 카드가 있는 분은 줄을 누르면 카드가 열립니다.</p></div>`;
}
function yearRosterBody(dd, yr) {
  const reps = Object.values(dd.reports).filter(r => r.date.startsWith(String(yr)) && Object.keys(r.att || {}).length).sort((a, b) => a.date < b.date ? -1 : 1);
  const hist = s => (s.history || []).find(h => +h.year === yr && (!h.dept || h.dept === dd.id)); // 그해 다른 부서(고등부 등) 소속 기록은 이 부서 명단에서 뺀다
  const list = dd.students.filter(s => hist(s) || reps.some(r => (r.att || {})[s.id])).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const divOn = dd.id === 'young' && list.some(s => youngDiv(s, yr) !== '1청년'); const divs = divOn ? ['1청년', '2청년', '라피끄'].map(d => [d, list.filter(s => youngDiv(s, yr) === d).length]).filter(x => x[1]) : [];
  const famOf = s => { const h = hist(s); return h ? (h.classId || '') : ''; };
  const fams = [...new Set(list.map(famOf))].sort((a, b) => a.localeCompare(b, 'ko'));
  const sort = S.sub.sort || 'name';
  const sorted = sort === 'fam' ? list.slice().sort((a, b) => famOf(a).localeCompare(famOf(b), 'ko') || statusRank(dd, a) - statusRank(dd, b) || a.name.localeCompare(b.name, 'ko')) : list.slice().sort((a, b) => statusRank(dd, a) - statusRank(dd, b) || a.name.localeCompare(b.name, 'ko'));
  const isT = (r, name) => (r.teachersPresent || []).some(n => normName(n) === normName(name));
  const cnt = s => reps.filter(r => (r.att || {})[s.id] || isT(r, s.name)).length;
  // 팸장·교사(학생 명단에 없는 사람)의 그해 출석: 보고서의 "참석한 교사" 명단으로 — 파란색
  const tNames = [...new Set(reps.flatMap(r => r.teachersPresent || []))].filter(n => !list.some(s => normName(s.name) === normName(n))).sort((a, b) => a.localeCompare(b, 'ko'));
  const tRole = n => { const t = dd.doc.staff.find(x => x.status !== 'left' && normName(x.name) === normName(n)); const o = (dd.officers || []).find(o => +o.year === yr && normName(o.name) === normName(n)); return (o && o.role) || (t && t.role) || '교사'; };
  const teacherRows = tNames.map((n, i) => `<tr><td class="n no">${sorted.length + i + 1}</td><td>${esc(n)}</td>${divOn ? '<td></td>' : ''}<td></td><td></td><td></td><td class="n">${reps.filter(r => isT(r, n)).length}/${reps.length}</td><td><div class="ystrip">${reps.map(r => `<span class="yw ${isT(r, n) ? 't' : 'x'}" title="${r.date}"></span>`).join('')}</div></td><td class="wrap note"></td><td><span class="pill info">${esc(tRole(n))}</span></td></tr>`).join('');
  const leftIn = s => (s.statusLog || []).find(l => l.to === 'left' && String(l.date || '').startsWith(String(yr)));
  return `<div class="stack">
    <div class="card"><h2><span class="row" style="display:inline-flex;gap:4px">${[['name', '이름순'], ['fam', dd.doc.classLabel + '별']].map(([k, v]) => `<button class="btn s ${sort === k ? 'p' : ''}" data-sort="${esc(k)}">${v}</button>`).join('')}</span> ${divs.length ? `<span class="note" style="margin-left:6px">${divs.map(([d, n]) => `${d} ${n}`).join(' · ')}</span>` : ''} <span class="r">${fams.filter(Boolean).length ? fams.filter(Boolean).map(f => `${esc(f)} ${list.filter(s => famOf(s) === f).length}`).join(' · ') : '팸 구성 기록 없음'}</span></h2>
      <div class="tw"><table class="roster"><thead><tr><th class="n no">번호</th><th>이름</th>${divOn ? '<th>구분</th>' : ''}<th>${esc(dd.doc.classLabel)} (${yr})</th><th>성별</th><th>생년월일</th><th class="n">${yr} 출석</th><th>출석 띠</th><th>그해 비고</th><th>지금 상태</th></tr></thead><tbody>
      ${sorted.map((s, i) => { const h = hist(s) || {}; const l = leftIn(s); return `<tr class="click" data-student="${esc(s.id)}"><td class="n no">${i + 1}</td><td>${esc(s.name)}</td>${divOn ? `<td><span class="pill ${youngDiv(s, yr) === '라피끄' ? 'info' : 'mute'}">${youngDiv(s, yr)}</span></td>` : ''}<td>${esc(h.classId || '')}</td><td>${esc(s.sex)}</td><td>${esc(s.birth || '')}</td><td class="n">${cnt(s)}/${reps.length}</td><td><div class="ystrip">${reps.map(r => { const v = (r.att || {})[s.id] || (isT(r, s.name) ? 'T' : ''); return `<span class="yw ${v === 'P' ? 'p' : v === 'O' ? 'o' : v === 'T' ? 't' : 'x'}" title="${r.date}${v === 'T' ? ' 팸장·교사 출석' : ''}"></span>`; }).join('')}</div></td><td class="wrap note">${esc(h.note || '')}${l ? `${h.note ? ' · ' : ''}${esc(l.kind || '제적')}${l.reason ? '(' + esc(l.reason) + ')' : ''}` : ''}</td><td>${(() => { const t = s.status === 'left' && dd.doc.staff.find(x => x.status !== 'left' && normName(x.name) === normName(s.name)); return t ? `<span class="pill info">${esc(t.role)}</span>` : statusPill(s); })()}</td></tr>`; }).join('') || '<tr><td colspan="8" class="note">그해 기록이 없습니다. "과거 출석부 가져오기"로 엑셀을 넣으세요.</td></tr>'}
      ${teacherRows}
      </tbody></table></div><div class="note" style="margin-top:6px">● 출석 · ◐ 온라인 · <span class="yw t" style="display:inline-block;width:10px;height:10px;vertical-align:middle;border-radius:2px"></span> 팸장·교사 출석(보고서의 참석 교사 명단) · 회원이면서 팸장이면 본인 출석으로 셉니다</div></div>
    ${reps.length ? `<div class="card"><h2>${yr}년 주별 출석 <span class="r">출석부·주일보고서 엑셀 기준</span></h2>${svgTrend(reps.map(r => ({ date: r.date, s: reportStats(dd, r) })))}</div>` : ''}
  </div>`;
}

// 과거 출석부 엑셀 변환 파일(young_attendance.json) 가져오기 — 기존 학생과 이름·생일로 합치고, 주일 보고서에 출석을 채운다
/* 같은 사람 찾기 (명부·과거 출석부 등 모든 가져오기 공통)
   - 이름 + 생년월일(연도까지) 일치 → 같은 사람
   - 이름이 하나뿐이고 한쪽에 생일이 없으면 → 같은 사람으로 보되 "확인" 표시
   - 생년월일이 다르거나(연도만 달라도), 같은 이름이 여럿이면 → 합치지 않음 */
function matchPerson(list, x) {
  const same = list.filter(s => normName(s.name) === normName(x.name)); if (!same.length) return { status: 'none' };
  const exact = same.filter(s => x.birth && s.birth && s.birth === x.birth); if (exact.length === 1) return { s: exact[0], status: 'exact' };
  if (exact.length > 1) return { status: 'ambiguous', reason: `같은 이름·생일이 ${exact.length}명` };
  if (same.length === 1 && (!x.birth || !same[0].birth)) return { s: same[0], status: 'loose', reason: '한쪽에 생일이 없어 이름으로만 맞춤' };
  if (same.length === 1) return { status: 'conflict', other: same[0], reason: `생일이 다름 (앱 ${same[0].birth} / 가져올 자료 ${x.birth})${same[0].birth.slice(5) === String(x.birth).slice(5) ? ' — 연도만 다름' : ''}` };
  return { status: 'ambiguous', reason: `같은 이름이 ${same.length}명` };
}
function importYoungAttendance(dd) {
  openModal(`<h2>과거 출석부 가져오기<button class="btn s" id="modal-close">닫기</button></h2><p class="note">young_attendance.py로 만든 <b>young_attendance.json</b>(2021~2024 출석부·주일보고서 엑셀)을 올립니다. 같은 이름·생일의 학생은 소속 이력만 보태고, 없는 학생은 "제적" 상태로 새로 넣습니다. 그 날 보고서가 이미 있으면 출석 칸만 채웁니다.</p><div class="row" style="margin-top:6px"><input type="file" id="ya-file" accept=".json,application/json"><button class="btn p" id="ya-go" disabled>가져오기 시작</button></div><pre class="progress" id="ya-log" style="margin-top:10px"></pre>`);
  let picked = null; const go = $('#ya-go');
  $('#ya-file').onchange = e => { picked = e.target.files[0] || null; go.disabled = !picked; $('#ya-log').textContent = picked ? `${picked.name} (${Math.round(picked.size / 1024).toLocaleString()}KB) — "가져오기 시작"을 누르면 올립니다.\n` : ''; };
  go.onclick = async () => {
    const f = picked; if (!f) return; go.disabled = true; go.textContent = '가져오는 중…'; const log = m => { $('#ya-log').textContent += m + '\n'; };
    try {
      const d = JSON.parse(await f.text()); const items = []; let newS = 0, mergedS = 0, newR = 0, mergedR = 0;
      const md = b => (b || '').slice(5); const byKey = {};
      const review = []; const matchStudent = x => { const m = matchPerson(dd.students, x); if (m.status === 'conflict' || m.status === 'ambiguous') { review.push(`${x.name}: ${m.reason} — 합치지 않고 따로 둠`); return undefined; } if (m.status === 'loose') review.push(`${x.name}: ${m.reason} — 맞는지 확인`); return m.s; }; // 공통 규칙(matchPerson) — 생년월일이 다르면 합치지 않는다
      for (const x of d.students || []) {
        let s = matchStudent(x);
        const yrs = Object.keys(x.years || {}).map(Number).sort(); const lastY = yrs[yrs.length - 1]; const lastG = lastY ? (x.years[lastY].group || '청년') : '청년';
        if (!s) { s = { id: `young_${x.name}_${x.birth || uid()}`, name: x.name, nameRaw: x.name, sex: x.sex || '', birth: x.birth || '', dept: 'young', classId: '', status: 'left', group: lastG === '라피끄' ? '라피끄' : '', faith: '', faithYear: '', faithHalf: '', phone: x.phone || '', school: '', father: '', mother: '', siblings: [], address: '', evangelist: '', guardianPhone: '', guardianRel: '', scholarship: [], note: '', history: [], statusLog: [], flags: [`과거 출석부(${yrs.join('·')})에서 추가 — ${YEAR}년 출석부에 없음`], source: x.source || [] }; dd.students.push(s); newS++; }
        else { mergedS++; if (s.birth && x.birth && md(s.birth) !== md(x.birth)) { s.flags = [...(s.flags || []), `생일이 다름: 앱 ${s.birth} / 과거 출석부 ${x.birth}`]; } if (!s.birth && x.birth) s.birth = x.birth; if (!s.phone && x.phone) s.phone = x.phone; if (!s.sex && x.sex) s.sex = x.sex; if (!s.group && lastG === '라피끄' && lastY >= YEAR - 2) s.group = '라피끄'; }
        s.history = s.history || [];
        for (const y of yrs) { const v = x.years[y]; if (v.otherRole && y >= YEAR - 1 && !s.otherRole) s.otherRole = v.otherRole; if (y === YEAR && v.note && !s.note) s.note = v.note; if (y === YEAR && v.fam && !s.classId) s.classId = v.fam; let h = s.history.find(h => +h.year === y); if (!h) { h = { year: y, dept: 'young', origDept: '청년부', classId: v.fam || '', note: v.note || '', group: v.group || '청년' }; s.history.push(h); } else { if (!h.classId && v.fam) h.classId = v.fam; if (!h.note && v.note) h.note = v.note; if (!h.group) h.group = v.group || '청년'; } if (v.newcomer && !s.joinDate && !s.newcomerDone) s.joinDate = s.joinDate || `${y}-01-01`; }
        s.history.sort((a, b) => a.year - b.year);
        s.statusLog = s.statusLog || [];
        if (x.rejoin && !s.statusLog.some(q => q.from === 'left' && q.date === x.rejoin)) { s.statusLog.push({ date: x.rejoin, from: 'left', to: 'active', reason: '복적', source: '과거 출석부 변환(사용자 확인)' }); }
        for (const l of x.left || []) { if (!s.statusLog.some(q => q.to === 'left' && String(q.date || '').startsWith(String(l.year)))) s.statusLog.push({ date: `${l.year}-12-31`, from: 'active', to: 'left', kind: l.kind || '제적', reason: l.reason || '', source: l.source });
          if (['결혼', '직분'].includes(l.kind) && s.status !== 'left' && !(s.statusLog || []).some(q => q.from === 'left' && q.date > `${l.year}-12-31`)) { s.status = 'left'; s.leftDate = `${l.year}-12-31`; s.leftKind = l.kind; s.leftReason = l.reason || ''; } /* 회칙 4조 자격 종료(사용자 확인)는 재적이어도 적용 */ if (s.status === 'left' && l.year === Math.max(...(x.left || []).map(q => q.year)) && (!s.leftDate || s.leftDate < `${l.year}-12-31`)) { s.leftDate = `${l.year}-12-31`; s.leftKind = l.kind || s.leftKind || '제적'; s.leftReason = l.reason || s.leftReason || ''; } }
        byKey[x.name + '|' + (x.birth || '')] = s;
        items.push({ path: `depts/young/students/${s.id}`, data: s });
      }
      const idOf = x => (byKey[x.name + '|' + (x.birth || '')] || (matchPerson(dd.students, x).status === 'exact' ? matchPerson(dd.students, x).s : null) || {}).id;
      const attByDate = {};
      for (const x of d.students || []) { const sid = idOf(x); if (!sid) continue; for (const v of Object.values(x.years || {})) for (const [dt, a] of Object.entries(v.att || {})) (attByDate[dt] = attByDate[dt] || {})[sid] = a; }
      for (const r of d.reports || []) {
        const att = attByDate[r.date] || {}; let doc = dd.reports[r.date];
        if (!doc) { doc = blankReport(dd, r.date); doc.imported = true; doc.status = 'done'; doc.source = r.source || '과거 출석부 엑셀'; dd.reports[r.date] = doc; newR++; } else mergedR++;
        doc.att = doc.att || {}; for (const [sid, a] of Object.entries(att)) if (!doc.att[sid]) doc.att[sid] = a;
        const c = r.counts || {}; if (c.att && (!doc.counts || !doc.counts.att)) doc.counts = { ...c };
        for (const k of ['prayer', 'text', 'title', 'preacher', 'writer']) if (!doc[k] && r[k]) doc[k] = r[k];
        if (r.offering && !(doc.offering && (doc.offering.sunday || doc.offering.tithe))) doc.offering = { ...(doc.offering || {}), sunday: r.offering, tithe: 0, thanks: 0, other: 0, raw: r.offeringRaw || '' };
        if (r.meeting && !doc.meeting) doc.meeting = r.meeting;
        if (r.teachersExact) { doc.teachersPresent = (r.teachersPresent || []).slice(); doc.teachersUnsure = []; doc.teachersExact = r.teachersExact; for (const n of r.teachersRoster || []) for (const s of dd.students.filter(s => normName(s.name) === normName(n))) delete doc.att[s.id]; } // 교사 줄 사람의 학생 출석 표시는 지워 교사 출석(파란색)으로만 // 출석부 교사 줄(결석 체크됨)이 정확하므로 덮어쓴다
        else if ((r.teachersPresent || []).length) { if (r.teachersAssumed) { doc.teachersPresent = [...new Set([...(doc.teachersPresent || []), ...r.teachersPresent])]; doc.teachersAssumed = r.teachersAssumed; } else if (!(doc.teachersPresent || []).length) doc.teachersPresent = r.teachersPresent.slice(); } // 유권해석(교사 전원 출석)은 기존 보고서에도 더한다
        if (r.teachersUnsure) doc.teachersUnsure = r.teachersUnsure.slice(); if (r.teacherCount) doc.teacherCount = r.teacherCount;
        items.push({ path: `depts/young/reports/${r.date}`, data: doc });
      }
      (d.officers || []).forEach(o => { items.push({ path: `depts/young/officers/${o.id}`, data: o }); if (!(dd.officers || []).some(q => q.id === o.id || q._id === o.id)) (dd.officers = dd.officers || []).push({ _id: o.id, ...o }); });
      // 교사인데 예전 가져오기로 학생이 돼 버린 기록은 지운다 (이 가져오기가 만든 기록만: flags에 '과거 출석부(' 표시가 있는 것)
      const rmS = []; for (const r of d.removeStudents || []) for (const s of dd.students.filter(s => normName(s.name) === normName(r.name) && (s.flags || []).some(f => String(f).startsWith('과거 출석부(')))) rmS.push(s);
      for (const s of rmS) { await backend.del(`depts/young/students/${s.id}`); dd.students.splice(dd.students.indexOf(s), 1); const i = items.findIndex(it => it.path === `depts/young/students/${s.id}`); if (i >= 0) items.splice(i, 1); }
      if (rmS.length) { for (const it of items) if (it.path.startsWith('depts/young/reports/') && it.data.att) for (const s of rmS) delete it.data.att[s.id]; log(`교사인데 학생으로 들어가 있던 기록 삭제: ${rmS.map(s => s.name).join(', ')}`); }
      log(`학생: 기존과 합침 ${mergedS}명 · 새로 추가 ${newS}명 (제적 상태) · 보고서: 새로 ${newR}장 · 출석만 채움 ${mergedR}장 · 임원 이력 ${(d.officers || []).length}건 → 문서 ${items.length}개 올립니다…`);
      review.forEach(r => log('※ 확인 필요 · ' + r));
      await backend.batchSet(items, (a, b) => { $('#ya-log').textContent = $('#ya-log').textContent.replace(/\n진행.*$/, '') + `\n진행 ${a}/${b}`; });
      log('완료. 출석부의 연도 버튼(2021~2024)과 총회 자료의 직전 1년 띠에 반영됩니다.'); (d._review || []).forEach(x => log('※ ' + x)); S.data = {};
    } catch (err) { console.error(err); log('실패: ' + (err.code || err.message)); go.disabled = false; }
    go.textContent = '가져오기 시작';
  };
}

/* ───────────── 시작 ───────────── */
window.CBCS_APP = { S, render, backend, matchPerson, saveReport, blankReport }; // matchPerson·saveReport는 회귀 시험용
backend.onSession(async d => {
  if (d) { S.user = d; S.dept = d === 'committee' ? null : d; }
  else { S.user = null; S.dept = null; }
  if (DEMO) { try { localStorage.setItem('cbcs-tutorial-elem', '1'); localStorage.setItem('cbcs-tutorial-committee', '1'); } catch (e) {} }
  if (DEMO && QS.has('tour')) { history.replaceState(null, '', location.pathname + '?demo=1'); startTour(); return; }
  await render();
});
// "!" 표시: 마우스를 올리거나 누르면 확인할 내용을 바로 보여 준다(브라우저 기본 말풍선은 늦게 뜨고 잘림)
(() => {
  let tip = null, pinned = null;
  const show = el => { if (el.title) { el.dataset.tip = el.title; el.removeAttribute('title'); } const t = el.dataset.tip || '확인 필요'; if (!tip) { tip = document.createElement('div'); tip.className = 'flag-tip'; document.body.appendChild(tip); }
    tip.innerHTML = `<b>확인할 점</b>${t.split(/\s*\/\s*/).filter(Boolean).map(x => `<div>• ${esc(x)}</div>`).join('')}`; tip.hidden = false;
    const r = el.getBoundingClientRect(); const w = Math.min(360, innerWidth - 16); tip.style.maxWidth = w + 'px'; const left = Math.max(8, Math.min(r.left, innerWidth - w - 8)); tip.style.left = left + 'px';
    const below = r.bottom + 6; tip.style.top = (below + tip.offsetHeight > innerHeight ? r.top - tip.offsetHeight - 6 : below) + 'px'; };
  const hide = () => { if (tip && !pinned) tip.hidden = true; };
  document.addEventListener('mouseover', e => { const el = e.target.closest && e.target.closest('.tag.flag'); if (el) show(el); else if (!pinned) hide(); });
  document.addEventListener('click', e => { const el = e.target.closest && e.target.closest('.tag.flag'); if (el) { e.stopPropagation(); e.preventDefault(); if (pinned === el) { pinned = null; hide(); } else { pinned = el; show(el); } } else if (pinned) { pinned = null; hide(); } }, true);
  addEventListener('scroll', () => { pinned = null; hide(); }, true);
})();
window.addEventListener('error', e => { const t = $('#toast'); if (t) toast('오류: ' + e.message, 4000); });
