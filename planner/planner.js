/* 교육부 수첩 — 교육부 관리자용 개인 다이어리 + 요람 (CBCS 자료를 읽고, 개인 기록은 planner/{uid}에 따로 저장)
   화면: 오늘 · 달력 · 요람 · 일지 · 할 일. 모든 화면 위에 "한 줄 입력"(말하듯 적으면 날짜·시간·부서를 알아서 나눔). */

/* ───────────── 공통 ───────────── */
const DEPTS = window.CBCS_DEPT_NAMES || { kinder: '영유치부', elem: '초등부', youth: '중고등부', young: '청년부' };
const ACCOUNTS = window.CBCS_ACCOUNTS || { kinder: 'kid', elem: 'youth', youth: 'teen', young: 'flame', committee: 'minist' };
const DOMAIN = window.CBCS_EMAIL_DOMAIN || 'cbcs.app';
const YEAR = window.CBCS_YEAR || new Date().getFullYear();
const QS = new URLSearchParams(location.search);
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const pad2 = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const today = () => iso(new Date());
const dateOf = s => new Date(s + 'T00:00:00');
const shiftDay = (s, n) => { const d = dateOf(s); d.setDate(d.getDate() + n); return iso(d); };
const dow = s => dateOf(s).getDay();
const fmtK = d => d ? `${+d.slice(5, 7)}월 ${+d.slice(8)}일 ${DAYS[dow(d)]}` : '';
const fmtLong = d => d ? `${d.slice(0, 4)}년 ${+d.slice(5, 7)}월 ${+d.slice(8)}일 ${DAYS[dow(d)]}요일` : '';
const fmtTime = t => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}시${m ? ` ${m}분` : ''}`; };
const deptName = d => d === 'committee' ? '교육위원회' : DEPTS[d] || '';
const deptClass = d => d === 'committee' ? 'edu' : 'dept';
const nowTime = () => { const d = new Date(); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
let toastT; function toast(m, ms = 2200) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms); }
const isMobile = () => matchMedia('(max-width:900px)').matches;
function openModal(html) { $('#modal-box').innerHTML = html; $('#modal').hidden = false; $('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); }; const c = $('#modal-close'); if (c) c.onclick = closeModal; }
function closeModal() { $('#modal').hidden = true; $('#modal-box').innerHTML = ''; }
function nthSunday(y, m, n) { const d = new Date(y, m - 1, 1); const off = (7 - d.getDay()) % 7; return iso(new Date(y, m - 1, 1 + off + (n - 1) * 7)); }
function easterOf(y) { const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1; return new Date(y, mo - 1, da); }
// 교회 고정 절기(CBCS 연간계획서의 교회력과 같은 규칙)
function churchCalendar(y) {
  const E = iso(easterOf(y)); const x25 = new Date(y, 11, 25); const xmas = x25.getDay() === 0 ? iso(x25) : shiftDay(iso(x25), -x25.getDay());
  const rows = [
    [nthSunday(y, 1, 1), '신년감사주일 · 성찬식 · 청지기 임명 · 헌신예배', 'church'], [nthSunday(y, 1, 3), '세계선교주일', 'church'],
    [nthSunday(y, 2, 1), '세대통합예배', 'church'], [nthSunday(y, 2, 1), '장학위원 모임', 'edu'], [nthSunday(y, 2, 4), '장학수여식', 'edu'],
    [nthSunday(y, 3, 1), `교회설립기념주일 (${y - 1956}주년) · 밀알찬양제`, 'church'],
    [shiftDay(E, -7), '종려주일', 'church'], [E, '부활주일', 'church'], [nthSunday(y, 4, 4), '한국성서대학교주일', 'church'],
    [nthSunday(y, 5, 1), '어린이주일 · 세대통합예배 · 성례식', 'church'], [nthSunday(y, 5, 2), '어버이주일', 'church'], [nthSunday(y, 5, 3), '교사주일 · 교사헌신예배', 'church'],
    [nthSunday(y, 7, 1), '맥추감사주일', 'church'], [nthSunday(y, 8, 1), '세대통합예배', 'church'], [nthSunday(y, 9, 1), '한국성서선교회주일', 'church'],
    [nthSunday(y, 11, 1), '일본단기선교 · 성례식', 'church'], [nthSunday(y, 11, 3), '추수감사주일', 'church'],
    [xmas, '성탄주일', 'church'], [`${y}-12-31`, '송구영신예배', 'church'],
    ...Array.from({ length: 12 }, (_, i) => [nthSunday(y, i + 1, 1), '교육위원회 모임', 'edu', '13:00']),
  ];
  return rows.map(([date, title, kind, time]) => ({ id: `cc_${date}_${title}`, date, title, kind, time: time || '', src: kind === 'edu' ? '교육위원회' : '교회 절기', ro: true }));
}

/* ───────────── Firebase (또는 ?demo=1 체험 모드: 가상 자료 + 이 브라우저에만 저장) ───────────── */
const DEMO = QS.has('demo');
let auth, api, signOut, signInWithEmailAndPassword, onAuthStateChanged;
if (DEMO) {
  const demo = (await import('../demo-data.js')).default; const KEY = 'planner-demo-store'; let store = {}; try { store = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} };
  const fixed = {}; fixed['committee/main'] = { staff: demo.committee.staff }; (demo.committee.events || []).forEach(e => { fixed[`committee/main/events/${e.id}`] = e; });
  Object.entries(demo.depts).forEach(([d, dd]) => { fixed[`depts/${d}`] = dd.doc; ['students', 'reports', 'events'].forEach(k => (dd[k] || []).forEach(x => { fixed[`depts/${d}/${k}/${x.id || x.date}`] = x; })); });
  const all = () => ({ ...fixed, ...store });
  api = { async get(p) { return all()[p] ? JSON.parse(JSON.stringify(all()[p])) : null; }, async list(p) { const pre = p + '/'; const a = all(); return Object.keys(a).filter(k => k.startsWith(pre) && !k.slice(pre.length).includes('/')).map(k => ({ _id: k.slice(pre.length), ...JSON.parse(JSON.stringify(a[k])) })); }, async set(p, data) { store[p] = JSON.parse(JSON.stringify(data)); save(); }, async del(p) { delete store[p]; save(); } };
  let cb = null; const user = { uid: 'demo', email: `${ACCOUNTS.committee}@${DOMAIN}` }; let cur = sessionStorage.getItem('planner-demo-in') ? user : null;
  auth = {}; onAuthStateChanged = (a, f) => { cb = f; setTimeout(() => f(cur), 0); return () => {}; };
  signInWithEmailAndPassword = async () => { cur = user; sessionStorage.setItem('planner-demo-in', '1'); cb && cb(cur); };
  signOut = async () => { cur = null; sessionStorage.removeItem('planner-demo-in'); cb && cb(null); };
} else {
  const FB = 'https://www.gstatic.com/firebasejs/10.14.1/';
  const [{ initializeApp }, A, { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, setDoc, deleteDoc, collection, getDocs }] =
    await Promise.all([import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-firestore.js')]);
  ({ signInWithEmailAndPassword, signOut, onAuthStateChanged } = A);
  const app = initializeApp(window.CBCS_FIREBASE);
  auth = A.getAuth(app);
  let db; try { db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); } catch (e) { db = initializeFirestore(app, {}); }
  const ref = p => doc(db, ...p.split('/'));
  api = {
    async get(p) { const s = await getDoc(ref(p)); return s.exists() ? s.data() : null; },
    async list(p) { const s = await getDocs(collection(db, ...p.split('/'))); return s.docs.map(x => ({ _id: x.id, ...x.data() })); },
    async set(p, data) { await setDoc(ref(p), data); },
    async del(p) { await deleteDoc(ref(p)); },
  };
}

/* ───────────── 상태 ───────────── */
const S = { user: null, view: 'today', sub: {}, me: null, cbcs: {}, mine: null, loading: false };
window.PLANNER = S;
const me = () => `planner/${S.user.uid}`;
const acctOf = u => Object.keys(ACCOUNTS).find(k => `${ACCOUNTS[k]}@${DOMAIN}` === (u && u.email)) || null;
const canReadDept = d => S.me === 'committee' || S.me === d;

/* CBCS 자료 읽기(읽기만) — 부서별 교적부·교사·행사·보고서 출석, 교육위원회 임원·행사 */
async function loadCBCS(force) {
  if (S.cbcs.ready && !force) return S.cbcs;
  const depts = Object.keys(DEPTS).filter(canReadDept);
  const c = { depts: {}, committee: { staff: [], events: [] }, ready: true, at: Date.now() };
  const [cdoc, cev] = await Promise.all([api.get('committee/main').catch(() => null), api.list('committee/main/events').catch(() => [])]);
  c.committee = { staff: (cdoc && cdoc.staff) || [], events: cev };
  await Promise.all(depts.map(async d => {
    const [docu, students, events, reports, timeline, officers] = await Promise.all([
      api.get(`depts/${d}`).catch(() => null), api.list(`depts/${d}/students`).catch(() => []), api.list(`depts/${d}/events`).catch(() => []),
      api.list(`depts/${d}/reports`).catch(() => []), api.list(`depts/${d}/timeline`).catch(() => []), d === 'young' ? api.list(`depts/${d}/officers`).catch(() => []) : []]);
    const dd = { id: d, doc: docu || { staff: [], classes: [] }, students, events, reports: reports.filter(r => r.att && Object.keys(r.att).length).sort((a, b) => a.date < b.date ? -1 : 1), timeline, officers };
    dd.doc.staff = dd.doc.staff || []; dd.doc.classes = dd.doc.classes || [];
    dd.last = {}; dd.reports.forEach(r => Object.keys(r.att).forEach(id => { dd.last[id] = r.date; }));
    c.depts[d] = dd;
  }));
  S.cbcs = c; return c;
}
/* 내 기록(일정·할 일·일지) */
async function loadMine(force) {
  if (S.mine && !force) return S.mine;
  const [events, tasks, notes, prefs] = await Promise.all([api.list(`${me()}/events`), api.list(`${me()}/tasks`), api.list(`${me()}/notes`), api.get(me()).catch(() => null)]);
  S.mine = { events, tasks, notes, prefs: prefs || {} }; return S.mine;
}
const M = () => S.mine; const C = () => S.cbcs;
async function saveEvent(ev) { ev.updated = today(); await api.set(`${me()}/events/${ev.id}`, ev); const i = M().events.findIndex(x => x.id === ev.id); if (i >= 0) M().events[i] = { _id: ev.id, ...ev }; else M().events.push({ _id: ev.id, ...ev }); }
async function saveTask(t) { t.updated = today(); await api.set(`${me()}/tasks/${t.id}`, t); const i = M().tasks.findIndex(x => x.id === t.id); if (i >= 0) M().tasks[i] = { _id: t.id, ...t }; else M().tasks.push({ _id: t.id, ...t }); }
async function saveNote(n) { n.updated = today(); await api.set(`${me()}/notes/${n.id}`, n); const i = M().notes.findIndex(x => x.id === n.id); if (i >= 0) M().notes[i] = { _id: n.id, ...n }; else M().notes.push({ _id: n.id, ...n }); }

/* ───────────── 사람 찾기(요람) ───────────── */
function allPeople() {
  if (S.cbcs._people) return S.cbcs._people;
  const out = [];
  C().committee.staff.forEach(t => out.push({ id: `c_${t.name}`, name: t.name, dept: 'committee', role: t.role || '', cls: '', phone: t.phone || '', birth: t.birth || '', kind: 'staff' }));
  Object.values(C().depts).forEach(dd => {
    dd.doc.staff.forEach(t => out.push({ id: `${dd.id}_s_${t.name}`, name: t.name, dept: dd.id, role: t.role || '', cls: t.classId || '', phone: t.phone || '', birth: t.birth || '', kind: 'staff' }));
    dd.students.forEach(s => out.push({ id: s.id || s._id, name: s.name, dept: dd.id, role: '', cls: s.classId || '', phone: s.phone || '', guardianPhone: s.guardianPhone || '', birth: s.birth || '', status: s.status || '', kind: 'student', _s: s }));
  });
  S.cbcs._people = out; return out;
}
const findPeople = q => { q = String(q || '').replace(/\s/g, ''); if (!q) return []; return allPeople().filter(p => (p.name || '').replace(/\s/g, '').includes(q) || (p.phone || '').replace(/-/g, '').includes(q) || (p.cls || '').includes(q)).slice(0, 12); };
const personLabel = p => `${deptName(p.dept)}${p.role ? ' · ' + p.role : p.cls ? ' · ' + p.cls : ''}`;
const telLink = p => { const t = (p.phone || '').replace(/[^\d+]/g, ''); return t ? `<a class="call" href="tel:${esc(t)}" aria-label="${esc(p.name)} 전화" title="${esc(p.phone)}">${ICON.phone}</a>` : ''; };

/* ───────────── 한 줄 입력 해석 (한국어 날짜·시간·부서) ───────────── */
const DEPT_WORDS = [['영유치부', 'kinder'], ['유치부', 'kinder'], ['초등부', 'elem'], ['중고등부', 'youth'], ['청년부', 'young'], ['교육위원회', 'committee'], ['위원회', 'committee']];
const nextDow = (from, d, includeToday) => { let s = from; if (!includeToday || dow(s) !== d) { do { s = shiftDay(s, 1); } while (dow(s) !== d); } return s; };
function parseQuick(text, base) {
  base = base || today(); let t = ' ' + text.trim() + ' '; let date = '', time = '', dept = '', kind = ''; const tags = [];
  const take = (re, fn) => { const m = t.match(re); if (m) { const r = fn(m); if (r !== false) { t = t.replace(m[0], ' '); return true; } } return false; };
  const y = +base.slice(0, 4);
  const fix = (m, d, yy) => { let s = `${yy || y}-${pad2(m)}-${pad2(d)}`; if (!yy && s < shiftDay(base, -120)) s = `${y + 1}-${pad2(m)}-${pad2(d)}`; return s; };
  take(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/, m => { date = fix(+m[2], +m[3], +m[1]); });
  if (!date) take(/\s(\d{1,2})[\/.](\d{1,2})(?=[\s일]|$)/, m => { date = fix(+m[1], +m[2]); });
  if (!date) take(/(\d{1,2})월\s*(\d{1,2})일/, m => { date = fix(+m[1], +m[2]); });
  if (!date) take(/(오늘|내일|모레|글피)/, m => { date = shiftDay(base, { 오늘: 0, 내일: 1, 모레: 2, 글피: 3 }[m[1]]); });
  if (!date) take(/(이번|다음|다다음)\s*주\s*(일요일|월요일|화요일|수요일|목요일|금요일|토요일|주일|[일월화수목금토](?![가-힣]))/, m => { const d = m[2] === '주일' ? 0 : DAYS.indexOf(m[2][0]); const sun = shiftDay(base, -dow(base)); const wk = { 이번: 0, 다음: 7, 다다음: 14 }[m[1]]; date = shiftDay(sun, wk + d); if (date < base && m[1] === '이번') date = shiftDay(date, 7); });
  if (!date) take(/(\d{1,2})월\s*(첫째|둘째|셋째|넷째|다섯째)\s*주(?:일)?/, m => { date = nthSunday(y, +m[1], ['첫째', '둘째', '셋째', '넷째', '다섯째'].indexOf(m[2]) + 1); if (date < shiftDay(base, -120)) date = nthSunday(y + 1, +m[1], ['첫째', '둘째', '셋째', '넷째', '다섯째'].indexOf(m[2]) + 1); });
  if (!date) take(/(첫째|둘째|셋째|넷째|다섯째)\s*주(?:일)?/, m => { const n = ['첫째', '둘째', '셋째', '넷째', '다섯째'].indexOf(m[1]) + 1; let d = nthSunday(y, +base.slice(5, 7), n); if (d < base) { const nm = new Date(y, +base.slice(5, 7), 1); d = nthSunday(nm.getFullYear(), nm.getMonth() + 1, n); } date = d; });
  if (!date) take(/(일요일|월요일|화요일|수요일|목요일|금요일|토요일|주일)/, m => { date = nextDow(base, m[1] === '주일' ? 0 : DAYS.indexOf(m[1][0]), true); });
  take(/(오전|오후|아침|저녁|밤|새벽)?\s*(\d{1,2})\s*시(?!간)\s*(반|(\d{1,2})\s*분)?/, m => { let h = +m[2]; if (h > 24) return false; const ap = m[1] || ''; if (/오후|저녁|밤/.test(ap) && h < 12) h += 12; else if (!ap && h >= 1 && h <= 8) h += 12; /* 시간대 말이 없는 1~8시는 오후로 본다(교회 모임은 저녁이 많음) */ else if (/새벽|아침|오전/.test(ap) && h === 12) h = 0; const mm = m[3] === '반' ? 30 : m[4] ? +m[4] : 0; time = `${pad2(h % 24)}:${pad2(mm)}`; });
  if (!time) take(/\s(\d{1,2}):(\d{2})(?=\s|$)/, m => { time = `${pad2(+m[1])}:${m[2]}`; });
  for (const [w, k] of DEPT_WORDS) { if (t.includes(w)) { dept = k; break; } }
  if (take(/까지/, () => {})) kind = 'task';
  if (take(/\s(할\s*일|투두|todo)\s/i, () => {})) kind = 'task';
  if (take(/\s(메모|기록)\s*$/, () => {})) kind = 'note';
  if (!kind) kind = date || time ? 'event' : 'task';
  const title = t.replace(/\s+/g, ' ').replace(/^[\s,·]+|[\s,·]+$/g, '').replace(/^(에|에서)\s/, '');
  return { title: title || text.trim(), date, time, dept, kind, tags };
}
const quickHelp = '예: "주일 1시 교육위원회 회의" · "11/12 7시 중고등부 월례회" · "청년부 회칙 올리기 금요일까지"(할 일) · "…메모"(기록)';
function quickBar() {
  return `<div class="quick" id="quick"><div class="in"><span class="k" aria-hidden="true">${ICON.plus}</span><input type="text" id="q-in" placeholder="한 줄로 적으면 일정·할 일로 나눕니다 (${isMobile() ? '마이크로 말해도 됩니다' : 'Ctrl+K'})" autocomplete="off" enterkeyhint="done"><button class="go" id="q-go" disabled>추가</button></div><div class="parsed" id="q-parsed" hidden></div></div>`;
}
function bindQuick() {
  const inp = $('#q-in'), go = $('#q-go'), box = $('#q-parsed'); if (!inp) return;
  let p = null, kindPick = '';
  const show = () => { const v = inp.value.trim(); if (!v) { box.hidden = true; go.disabled = true; p = null; return; } p = parseQuick(v); if (kindPick) p.kind = kindPick; go.disabled = false; box.hidden = false;
    box.innerHTML = `<span class="kind">${[['event', '일정'], ['task', '할 일'], ['note', '기록']].map(([k, l]) => `<button type="button" data-k="${k}" class="${p.kind === k ? 'on' : ''}">${l}</button>`).join('')}</span>${p.date ? `<span class="tag">${fmtK(p.date)}${p.time ? ' ' + fmtTime(p.time) : ''}</span>` : p.kind === 'event' ? '<span class="tag warn">날짜 없음 → 오늘</span>' : p.kind === 'task' ? '<span class="tag">기한 없음</span>' : `<span class="tag">${fmtK(today())}</span>`}${p.dept ? `<span class="tag">${deptName(p.dept)}</span>` : ''}<span class="tag" style="background:transparent;padding:0">${esc(p.title)}</span>`;
    box.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { kindPick = b.dataset.k; show(); inp.focus(); }); };
  inp.oninput = () => { kindPick = ''; show(); };
  inp.onfocus = () => { if (!inp.value) { box.hidden = false; box.innerHTML = `<span class="help">${quickHelp}</span>`; } };
  inp.onblur = () => { if (!inp.value) box.hidden = true; };
  const submit = async () => { if (!p) return; await quickSave(p); inp.value = ''; kindPick = ''; box.hidden = true; go.disabled = true; };
  inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } if (e.key === 'Escape') { inp.value = ''; show(); inp.blur(); } };
  go.onclick = submit;
  if (QS.get('quick') === '1' || S.focusQuick) { S.focusQuick = false; setTimeout(() => inp.focus(), 50); }
}
async function quickSave(p) {
  if (p.kind === 'event') { const ev = { id: 'ev_' + uid(), date: p.date || today(), time: p.time || '', end: '', title: p.title, dept: p.dept || '', note: '', created: today() }; await saveEvent(ev); toast(`일정 추가 — ${fmtK(ev.date)}${ev.time ? ' ' + fmtTime(ev.time) : ''}`); }
  else if (p.kind === 'task') { const t = { id: 'tk_' + uid(), title: p.title, due: p.date || '', dept: p.dept || '', done: false, created: today() }; await saveTask(t); toast(`할 일 추가${t.due ? ' — ' + fmtK(t.due) + '까지' : ''}`); }
  else { const n = { id: 'nt_' + uid(), date: p.date || today(), time: p.time || nowTime(), title: p.title.slice(0, 40), kind: '메모', dept: p.dept || '', people: [], body: p.title, created: today() }; await saveNote(n); toast('기록으로 저장했습니다'); }
  render();
}

/* ───────────── 모아 보기: 날짜별 일정·할 일 ───────────── */
function eventsOf(y) { // 그해의 모든 일정(교회 절기·교육위원회·부서 행사·내 일정)
  // 교육위원회가 CBCS 일정에 이미 넣은 절기·모임은 계산한 것과 겹치지 않게 뺀다
  const cev = C().committee.events;
  const out = churchCalendar(y).filter(c => !cev.some(e => e.date === c.date && (c.kind === 'edu' ? /교육위원회/.test(e.title || '') : (e.title || '').slice(0, 3) === c.title.slice(0, 3))));
  cev.forEach(e => { if ((e.date || '').startsWith(String(y))) out.push({ id: 'ce_' + (e._id || e.id), date: e.date, end: e.end || '', title: e.title, kind: 'edu', time: e.time || '', src: '교육위원회', ro: true }); });
  Object.values(C().depts).forEach(dd => dd.events.forEach(e => { if ((e.date || '').startsWith(String(y))) out.push({ id: `de_${dd.id}_${e._id || e.id}`, date: e.date, end: e.end || '', title: e.title, kind: 'dept', dept: dd.id, time: e.time || '', src: deptName(dd.id) + ' 행사', ro: true }); }));
  M().events.forEach(e => { if ((e.date || '').startsWith(String(y))) out.push({ ...e, kind: 'mine', src: '내 일정' }); });
  return out;
}
const byDate = (list, d) => list.filter(e => e.date === d || (e.end && e.date <= d && d <= e.end)).sort((a, b) => (a.time || '99') < (b.time || '99') ? -1 : 1);
const onDay = (d, cache) => { const y = d.slice(0, 4); cache[y] = cache[y] || eventsOf(+y); return byDate(cache[y], d); };
const kindOrder = { church: 0, edu: 1, dept: 2, mine: 3 };

/* 챙길 사람: 생일(7일 안) · 장기결석(마지막 출석 뒤 3주 초과) · 새친구 */
function careList() {
  const t = today(); const out = [];
  const wk = Array.from({ length: 7 }, (_, i) => shiftDay(t, i));
  allPeople().forEach(p => { if (!p.birth || p.status === 'left' || p.status === 'archived') return; const md = p.birth.slice(5); const hit = wk.find(d => d.slice(5) === md); if (hit) out.push({ tag: '생일', cls: 'birth', p, line: `${fmtK(hit)}${hit === t ? ' · 오늘' : ''}`, sort: '0' + hit }); });
  // 장기결석: 그 부서의 가장 최근 보고서 날짜를 기준으로, 마지막 출석 뒤 결석 주 수가 3주를 넘는 재적 학생 (출석 기록이 한 번도 없는 학생은 자료가 없는 것으로 보고 뺀다)
  Object.values(C().depts).forEach(dd => { if (!dd.reports.length) return; const latest = dd.reports[dd.reports.length - 1].date; dd.students.filter(s => s.status === 'active').forEach(s => { const id = s.id || s._id; const last = dd.last[id] || ''; if (!last) return; let n = 0; let d = latest; while (d > last && n < 60) { n++; d = shiftDay(d, -7); } if (n > 3) out.push({ tag: '결석', cls: '', p: allPeople().find(x => x.id === id) || { name: s.name, dept: dd.id, cls: s.classId }, line: `마지막 출석 ${fmtK(last)} · ${n}주 결석`, sort: '1' + pad2(99 - Math.min(n, 99)) }); }); });
  Object.values(C().depts).forEach(dd => dd.students.filter(s => s.status === 'newcomer').forEach(s => { const id = s.id || s._id; out.push({ tag: '새친구', cls: 'new', p: allPeople().find(x => x.id === id) || { name: s.name, dept: dd.id, cls: s.classId }, line: dd.last[id] ? `마지막 출석 ${fmtK(dd.last[id])}` : '새친구', sort: '2' + s.name }); }));
  return out.sort((a, b) => a.sort < b.sort ? -1 : 1);
}
const careRow = c => `<div class="item click" data-person="${esc(c.p.id || '')}"><div class="av ${c.cls}">${c.tag === '새친구' ? '새친' : c.tag}</div><div class="body"><div class="t">${esc(c.p.name)} <small class="note">${esc(personLabel(c.p))}</small></div><div class="d">${esc(c.line)}</div></div></div>`;
const evRow = (e, opt = {}) => `<div class="item ${e.ro ? '' : 'click'}" ${e.ro ? '' : `data-ev="${esc(e.id)}"`}><span class="bar ${e.kind}"></span>${opt.when ? `<div class="when ${dow(e.date) === 0 ? 'acc' : ''}">${esc(opt.when)}</div>` : ''}<div class="body"><div class="t">${esc(e.title)}</div><div class="d">${esc(e.src)}${e.dept && e.kind === 'mine' ? ' · ' + deptName(e.dept) : ''}${e.time ? ' · ' + fmtTime(e.time) : ''}${e.end && e.end !== e.date ? ' · ~' + fmtK(e.end) : ''}${e.note ? ' · ' + esc(e.note) : ''}</div></div></div>`;
function taskRow(t) { const td = today(); const dueCls = !t.due ? '' : t.due < td ? 'over' : t.due === td ? 'today' : ''; return `<label class="item ${t.done ? 'done' : ''}"><input type="checkbox" data-task="${esc(t.id)}" ${t.done ? 'checked' : ''}><div class="body"><div class="t">${esc(t.title)}</div>${t.dept ? `<div class="d">${esc(deptName(t.dept))}</div>` : ''}</div><button class="btn s" data-task-edit="${esc(t.id)}" aria-label="고치기">…</button><div class="due ${dueCls}">${t.due ? (t.due.slice(0, 4) === td.slice(0, 4) ? `${+t.due.slice(5, 7)}/${+t.due.slice(8)}` : t.due) : '—'}</div></label>`; }

/* ───────────── 화면 ───────────── */
const ICON = {
  home: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 11l8-7 8 7v9H4z"/></svg>',
  cal: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  book: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 4h12a3 3 0 013 3v13H7a3 3 0 00-3 3z"/><path d="M4 4v16"/></svg>',
  diary: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 3h14v18H5z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
  check: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12l4 4L19 6"/></svg>',
  plus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  phone: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2"/></svg>',
  search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
};
const NAV = [['today', '오늘', ICON.home], ['cal', '달력', ICON.cal], ['book', '요람', ICON.book], ['diary', '일지', ICON.diary], ['tasks', '할 일', ICON.check]];
const VIEWS = {}, BIND = {};

/* 오늘 */
VIEWS.today = () => {
  const t = today(); const cache = {}; const week = Array.from({ length: 7 }, (_, i) => shiftDay(t, i));
  const todayEv = onDay(t, cache); const upcoming = week.slice(1).flatMap(d => onDay(d, cache).map(e => ({ ...e, _d: d }))).slice(0, 8);
  const open = M().tasks.filter(x => !x.done).sort((a, b) => (a.due || '9') < (b.due || '9') ? -1 : 1); const over = open.filter(x => x.due && x.due < t).length;
  const care = careList(); const notes = M().notes.filter(n => n.date === t).sort((a, b) => (a.time || '') < (b.time || '') ? 1 : -1);
  const recent = [...M().notes].sort((a, b) => (a.date + (a.time || '')) < (b.date + (b.time || '')) ? 1 : -1).slice(0, 5);
  const weekEv = week.flatMap(d => onDay(d, cache));
  return `<div class="topbar"><div><div class="sub">${fmtLong(t)}</div><h1>오늘</h1></div><div class="row"><button class="btn" data-go="diary" data-new="1">+ 새 기록</button></div></div>
  <div class="grid3">
    <div class="card kpi"><span class="l">이번 주 일정</span><span class="v">${weekEv.length}</span><span class="s">절기 ${weekEv.filter(e => e.kind === 'church').length} · 교육부 ${weekEv.filter(e => e.kind === 'edu' || e.kind === 'dept').length} · 내 일정 ${weekEv.filter(e => e.kind === 'mine').length}</span></div>
    <div class="card kpi"><span class="l">남은 할 일</span><span class="v ${over ? 'acc' : ''}">${open.length}</span><span class="s">${over ? `기한 지난 것 ${over}` : '기한 지난 것 없음'}</span></div>
    <div class="card kpi"><span class="l">챙길 사람</span><span class="v">${care.length}</span><span class="s">생일 ${care.filter(c => c.tag === '생일').length} · 장기결석 ${care.filter(c => c.tag === '결석').length} · 새친구 ${care.filter(c => c.tag === '새친구').length}</span></div>
  </div>
  <div class="cols" style="margin-top:14px"><div class="c1">
    <div class="card"><h2>일정 <button class="btn link" data-go="cal">달력 보기</button></h2><div class="list">
      ${todayEv.map(e => evRow(e, { when: '오늘' })).join('')}${upcoming.map(e => evRow(e, { when: `${DAYS[dow(e._d)]} ${+e._d.slice(8)}` })).join('')}${!todayEv.length && !upcoming.length ? '<div class="note">이번 주 일정이 없습니다. 위 칸에 한 줄로 적어 보세요.</div>' : ''}</div></div>
    <div class="card"><h2>할 일 <span class="r">${open.length}개 남음 · <button class="btn link" data-go="tasks">전체</button></span></h2><div class="list">${open.slice(0, 6).map(taskRow).join('') || '<div class="note">남은 할 일이 없습니다.</div>'}</div></div>
  </div><div class="c2">
    <div class="card"><h2>이번 주 챙길 사람</h2><div class="list">${care.slice(0, 8).map(careRow).join('') || '<div class="note">이번 주 생일·장기결석·새친구가 없습니다.</div>'}</div>${care.length > 8 ? `<div class="note" style="margin-top:6px">외 ${care.length - 8}명 — 요람에서 확인</div>` : ''}</div>
    <div class="card"><h2>오늘 기록 <button class="btn link" data-go="diary" data-new="1">+ 쓰기</button></h2><div class="list">${notes.map(n => `<div class="item click" data-go="diary" data-note="${esc(n.id)}"><div class="body"><div class="t">${esc(n.title || n.kind)} <span class="pill ${n.kind === '심방' || n.kind === '통화' ? 'acc' : ''}">${esc(n.kind)}</span></div><div class="d">${esc((n.body || '').slice(0, 80))}</div></div></div>`).join('') || '<div class="note">오늘 적은 기록이 없습니다. 한 줄 입력 끝에 "메모"를 붙이면 기록으로 저장됩니다.</div>'}</div></div>
    <div class="card"><h2>최근 일지 <button class="btn link" data-go="diary">전체</button></h2><div class="list">${recent.map(n => `<div class="item click" data-go="diary" data-note="${esc(n.id)}"><div class="body"><div class="t">${esc(n.title || n.kind)}</div><div class="d">${fmtK(n.date)} · ${esc(n.kind)}${n.people && n.people.length ? ' · ' + esc(n.people.map(p => p.name).join(', ')) : ''}</div></div></div>`).join('') || '<div class="note">아직 기록이 없습니다.</div>'}</div></div>
  </div></div>`;
};

/* 달력 */
VIEWS.cal = () => {
  const t = today(); const mode = S.sub.mode || 'month'; const sel = S.sub.date || t; const m = S.sub.month || sel.slice(0, 7); const cache = {};
  const [y, mm] = m.split('-').map(Number); const first = `${m}-01`; const start = shiftDay(first, -dow(first)); const cells = Array.from({ length: 42 }, (_, i) => shiftDay(start, i));
  const wkStart = shiftDay(sel, -dow(sel)); const wk = Array.from({ length: 7 }, (_, i) => shiftDay(wkStart, i));
  const head = `<div class="cal-head"><div class="row"><button class="btn s" data-cal-step="-1" aria-label="이전">◀</button><h1>${mode === 'month' ? `${y}년 ${mm}월` : `${fmtK(wk[0])} ~ ${fmtK(wk[6])}`}</h1><button class="btn s" data-cal-step="1" aria-label="다음">▶</button><button class="btn s" data-cal-today>오늘</button></div><div class="chips"><button class="chip ${mode === 'month' ? 'on' : ''}" data-cal-mode="month">월</button><button class="chip ${mode === 'week' ? 'on' : ''}" data-cal-mode="week">주</button></div></div>
  <div class="legend"><span><i style="background:var(--accent)"></i>교회 절기</span><span><i style="background:var(--edu)"></i>교육위원회·부서 행사</span><span><i style="background:var(--mine)"></i>내 일정</span><span><i style="border:1px dashed var(--line);background:transparent"></i>할 일 기한</span></div>`;
  const tasksOn = d => M().tasks.filter(x => x.due === d && !x.done);
  let body = '';
  if (mode === 'month') {
    body = `<div class="month">${DAYS.map((d, i) => `<div class="dow ${i === 0 ? 'sun' : ''}">${d}</div>`).join('')}${cells.map(d => { const evs = onDay(d, cache).sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind]); const tk = tasksOn(d); const dim = d.slice(0, 7) !== m; return `<button type="button" class="day ${dim ? 'dim' : ''} ${d === t ? 'today' : ''} ${d === sel ? 'sel' : ''} ${dow(d) === 0 ? 'sun' : ''}" data-cal-day="${d}"><span class="n">${+d.slice(8)}</span><span class="dots">${evs.slice(0, 6).map(e => `<i class="${e.kind}"></i>`).join('')}${tk.length ? '<i style="background:transparent;border:1px dashed var(--muted)"></i>' : ''}</span>${evs.slice(0, 3).map(e => `<span class="ev ${e.kind}">${esc(e.title)}</span>`).join('')}${tk.slice(0, 1).map(x => `<span class="ev task">☐ ${esc(x.title)}</span>`).join('')}${evs.length + tk.length > 4 ? `<span class="more">+${evs.length + tk.length - 4}</span>` : ''}</button>`; }).join('')}</div>`;
  } else {
    body = `<div class="week">${wk.map(d => { const evs = onDay(d, cache).sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind]); const tk = tasksOn(d); return `<div class="day ${d === t ? 'today' : ''} ${dow(d) === 0 ? 'sun' : ''}"><div class="n">${DAYS[dow(d)]} ${+d.slice(8)}${d === t ? ' · 오늘' : ''}</div>${evs.map(e => `<div class="ev ${e.kind}" ${e.ro ? '' : `data-ev="${esc(e.id)}"`}>${e.time ? `<b>${esc(e.time)}</b> ` : ''}${esc(e.title)}</div>`).join('')}${tk.map(x => `<div class="ev task">☐ ${esc(x.title)}</div>`).join('')}<button class="btn s" data-cal-add="${d}" style="margin-top:auto;align-self:flex-start">+ 추가</button></div>`; }).join('')}</div>`;
  }
  const selEv = onDay(sel, cache).sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind]); const selTk = tasksOn(sel);
  const detail = mode === 'month' ? `<div class="card" style="margin-top:14px"><h2>${fmtLong(sel)} <button class="btn s" data-cal-add="${sel}">+ 이날 일정</button></h2><div class="list">${selEv.map(e => evRow(e)).join('')}${selTk.map(taskRow).join('')}${!selEv.length && !selTk.length ? '<div class="note">이날은 일정이 없습니다.</div>' : ''}</div></div>` : '';
  return head + body + detail;
};
BIND.cal = () => {
  const m = S.sub.month || (S.sub.date || today()).slice(0, 7);
  $$('[data-cal-step]').forEach(b => b.onclick = () => { const n = +b.dataset.calStep; if ((S.sub.mode || 'month') === 'month') { const [y, mm] = m.split('-').map(Number); const d = new Date(y, mm - 1 + n, 1); S.sub.month = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; S.sub.date = S.sub.month + '-01'; } else { S.sub.date = shiftDay(S.sub.date || today(), 7 * n); S.sub.month = S.sub.date.slice(0, 7); } render(); });
  const bt = $('[data-cal-today]'); if (bt) bt.onclick = () => { S.sub.date = today(); S.sub.month = today().slice(0, 7); render(); };
  $$('[data-cal-mode]').forEach(b => b.onclick = () => { S.sub.mode = b.dataset.calMode; render(); });
  $$('[data-cal-day]').forEach(b => b.onclick = () => { S.sub.date = b.dataset.calDay; if (isMobile()) { S.sub.month = S.sub.date.slice(0, 7); } S.keepScroll = window.scrollY; render(); });
  $$('[data-cal-add]').forEach(b => b.onclick = () => eventDialog({ date: b.dataset.calAdd }));
};
function eventDialog(init) {
  const ev = init.id ? M().events.find(x => x.id === init.id) : { id: 'ev_' + uid(), date: init.date || today(), time: '', end: '', title: '', dept: '', note: '', created: today() };
  if (!ev) return;
  openModal(`<h2>${init.id ? '일정 고치기' : '일정 추가'}<button class="btn s" id="modal-close">닫기</button></h2>
  <label class="f"><span>제목</span><input type="text" id="e-title" value="${esc(ev.title)}" autofocus></label>
  <div class="fields"><label class="f"><span>날짜</span><input type="date" id="e-date" value="${esc(ev.date)}"></label><label class="f"><span>시간</span><input type="time" id="e-time" value="${esc(ev.time)}"></label><label class="f"><span>끝나는 날(여러 날이면)</span><input type="date" id="e-end" value="${esc(ev.end)}"></label>
  <label class="f"><span>부서</span><select id="e-dept"><option value="">—</option>${['committee', ...Object.keys(DEPTS)].map(d => `<option value="${d}" ${ev.dept === d ? 'selected' : ''}>${deptName(d)}</option>`).join('')}</select></label></div>
  <label class="f"><span>메모</span><textarea id="e-note" style="min-height:70px">${esc(ev.note)}</textarea></label>
  <div class="row"><button class="btn p" id="e-save">저장</button>${init.id ? '<button class="btn d" id="e-del">지우기</button>' : ''}<span style="flex:1"></span>${init.id ? '<button class="btn s" id="e-note-link">이 일정으로 기록 쓰기</button>' : ''}</div>`);
  $('#e-save').onclick = async () => { ev.title = $('#e-title').value.trim(); if (!ev.title) { toast('제목을 적어 주세요'); return; } ev.date = $('#e-date').value || today(); ev.time = $('#e-time').value; ev.end = $('#e-end').value; ev.dept = $('#e-dept').value; ev.note = $('#e-note').value.trim(); await saveEvent(ev); closeModal(); render(); toast('저장했습니다'); };
  const del = $('#e-del'); if (del) del.onclick = async () => { if (!confirm('이 일정을 지울까요?')) return; await api.del(`${me()}/events/${ev.id}`); M().events = M().events.filter(x => x.id !== ev.id); closeModal(); render(); };
  const nl = $('#e-note-link'); if (nl) nl.onclick = () => { closeModal(); S.view = 'diary'; S.sub = { new: { title: ev.title, date: ev.date, kind: '회의', dept: ev.dept } }; render(); };
}

/* 요람 */
VIEWS.book = () => {
  const tab = S.sub.tab || 'org'; const q = S.sub.q || '';
  const tabs = [['org', '조직'], ['contacts', '연락처'], ['classes', '반·목장'], ['birth', '생일'], ['season', '절기']];
  let body = '';
  const head = `<div class="topbar"><div><h1>요람</h1><div class="sub">CBCS 교적부·조직에서 자동으로 가져옵니다 · ${YEAR}</div></div><div class="row"><label class="row" style="gap:6px;border:1px solid var(--line);border-radius:10px;padding:0 10px;background:var(--panel);min-width:240px">${ICON.search}<input type="search" id="bk-q" placeholder="이름 · 전화 · 반 검색" value="${esc(q)}" style="border:0;min-height:40px"></label></div></div>
  <div class="chips tabs">${tabs.map(([k, l]) => `<button class="chip ${tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>`;
  if (q) { const hits = findPeople(q); return head + `<div class="card"><h2>검색 결과 <span class="r">${hits.length}명</span></h2>${hits.map(p => personRow(p)).join('') || '<div class="note">찾는 사람이 없습니다.</div>'}</div>`; }
  if (tab === 'org') {
    const cs = C().committee.staff; const depts = Object.values(C().depts);
    body = `<div class="book-grid"><div class="card"><h2><span class="pill acc">교육위원회</span></h2>${cs.length ? cs.map(t => personRow({ name: t.name, role: t.role, phone: t.phone, dept: 'committee', id: 'c_' + t.name })).join('') : '<div class="note">CBCS 교육위원회 화면에서 임원을 넣으면 여기 보입니다.</div>'}<div class="kv" style="margin-top:10px"><span class="k">모임</span><span>매월 첫째 주일 오후 1시</span></div></div>
    ${depts.map(dd => { const st = dd.doc.staff; const lead = st.filter(t => /교역자|목사|전도사|부장|부감|총무|회계|서기/.test(t.role || '')); const rest = st.filter(t => !lead.includes(t)); return `<div class="card"><h2><span class="pill edu">${esc(deptName(dd.id))}</span><span class="r">교사 ${st.length} · ${dd.id === 'young' ? '팸' : '반'} ${dd.doc.classes.length} · 재적 ${dd.students.filter(s => s.status === 'active').length}</span></h2>${lead.map(t => personRow({ name: t.name, role: t.role, phone: t.phone, dept: dd.id, cls: t.classId, id: `${dd.id}_s_${t.name}` })).join('')}${rest.length ? `<details><summary class="note" style="cursor:pointer;padding:6px 0">교사·리더 ${rest.length}명 더 보기</summary>${rest.map(t => personRow({ name: t.name, role: t.role, phone: t.phone, dept: dd.id, cls: t.classId, id: `${dd.id}_s_${t.name}` })).join('')}</details>` : ''}${dd.id === 'young' && dd.officers.length ? `<div class="sec-t">청년부 임원 ${YEAR}</div>${dd.officers.filter(o => +o.year === YEAR).map(o => personRow({ name: o.name, role: o.role, dept: 'young', id: `young_o_${o.name}`, phone: (allPeople().find(p => p.dept === 'young' && p.name === o.name) || {}).phone })).join('') || '<div class="note">올해 임원 기록이 없습니다.</div>'}` : ''}</div>`; }).join('')}</div>`;
  } else if (tab === 'contacts') {
    const d = S.sub.dept || Object.keys(C().depts)[0] || 'committee';
    const list = allPeople().filter(p => p.dept === d && p.status !== 'left' && p.status !== 'archived').sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'staff' ? -1 : 1) || (a.cls || '').localeCompare(b.cls || '', 'ko') || a.name.localeCompare(b.name, 'ko'));
    body = `<div class="chips" style="margin-bottom:12px">${['committee', ...Object.keys(C().depts)].map(k => `<button class="chip ${d === k ? 'on' : ''}" data-dept="${k}">${deptName(k)}</button>`).join('')}</div><div class="card tw"><table><thead><tr><th>이름</th><th>구분</th><th>${d === 'young' ? '팸·직책' : '반·역할'}</th><th>전화</th><th>보호자</th><th>생일</th></tr></thead><tbody>${list.map(p => `<tr><td><button class="btn link" data-person="${esc(p.id)}">${esc(p.name)}</button></td><td>${p.kind === 'staff' ? '<span class="pill edu">교사·임원</span>' : `<span class="pill ${p.status === 'active' ? 'ok' : p.status === 'newcomer' ? 'info' : 'warn'}">${esc({ active: '재적', newcomer: '새친구', longabsent: '장기결석', military: '군입대', study: '학업', business: '사업' }[p.status] || p.status || '')}</span>`}</td><td>${esc(p.role || p.cls || '')}</td><td>${p.phone ? `<a href="tel:${esc(p.phone.replace(/[^\d+]/g, ''))}">${esc(p.phone)}</a>` : ''}</td><td>${p.guardianPhone ? `<a href="tel:${esc(p.guardianPhone.replace(/[^\d+]/g, ''))}">${esc(p.guardianPhone)}</a>` : ''}</td><td>${esc(p.birth || '')}</td></tr>`).join('')}</tbody></table>${!list.length ? '<div class="note">이 부서의 명단을 읽을 권한이 없거나 아직 자료가 없습니다.</div>' : ''}</div>`;
  } else if (tab === 'classes') {
    body = `<div class="book-grid">${Object.values(C().depts).flatMap(dd => { const cls = dd.doc.classes.length ? dd.doc.classes : [...new Set(dd.students.map(s => s.classId).filter(Boolean))].map(c => ({ id: c, name: c })); return cls.map(c => { const kids = dd.students.filter(s => (s.classId || '') === (c.id || c.name) && s.status !== 'left' && s.status !== 'archived'); const tea = c.teacher || (dd.doc.staff.find(t => t.classId === (c.id || c.name)) || {}).name || ''; return `<div class="card"><h2>${esc(c.name || c.id)} <span class="r">${esc(deptName(dd.id))}${tea ? ' · ' + esc(tea) : ''} · ${kids.length}명</span></h2><div class="chips">${kids.map(s => `<button class="chip" data-person="${esc(s.id || s._id)}">${esc(s.name)}${s.status === 'newcomer' ? '<small>새친구</small>' : ''}</button>`).join('')}</div></div>`; }); }).join('') || '<div class="hint">반 자료가 없습니다.</div>'}</div>`;
  } else if (tab === 'birth') {
    const mo = S.sub.bmonth || +today().slice(5, 7);
    const list = allPeople().filter(p => p.birth && +p.birth.slice(5, 7) === mo && p.status !== 'left' && p.status !== 'archived').sort((a, b) => a.birth.slice(5) < b.birth.slice(5) ? -1 : 1);
    body = `<div class="chips" style="margin-bottom:12px">${Array.from({ length: 12 }, (_, i) => `<button class="chip ${mo === i + 1 ? 'on' : ''}" data-bmonth="${i + 1}">${i + 1}월</button>`).join('')}</div><div class="card"><h2>${mo}월 생일 <span class="r">${list.length}명</span></h2>${list.map(p => `<div class="person"><div class="role">${+p.birth.slice(8)}일</div><div class="nm"><b>${esc(p.name)}</b><small>${esc(personLabel(p))}${p.birth.slice(0, 4) ? ` · ${YEAR - +p.birth.slice(0, 4) + 1}세` : ''}</small></div>${telLink(p)}</div>`).join('') || '<div class="note">이달 생일이 없습니다.</div>'}</div>`;
  } else {
    const y = S.sub.syear || YEAR; const rows = churchCalendar(y).filter(e => e.kind === 'church');
    body = `<div class="chips" style="margin-bottom:12px">${[y - 1, y, y + 1].map(yy => `<button class="chip ${yy === y ? 'on' : ''}" data-syear="${yy}">${yy}년</button>`).join('')}</div><div class="card"><h2>${y}년 교회 절기 <span class="r">교육위원회 모임은 매월 첫째 주일 오후 1시</span></h2><div class="list">${rows.map(e => evRow(e, { when: `${+e.date.slice(5, 7)}/${+e.date.slice(8)}` })).join('')}</div></div>`;
  }
  return head + body;
};
const personRow = p => `<div class="person"><div class="nm"><b><button class="btn link" data-person="${esc(p.id || '')}" style="text-decoration:none;color:inherit;font-weight:500">${esc(p.name)}</button></b><small>${esc([p.role, p.cls].filter(Boolean).join(' · ') || deptName(p.dept))}</small></div>${telLink(p)}</div>`;
BIND.book = () => {
  const q = $('#bk-q'); if (q) { let t; q.oninput = () => { clearTimeout(t); t = setTimeout(() => { S.sub.q = q.value.trim(); S.keepFocus = 'bk-q'; render(); }, 250); }; }
  $$('[data-tab]').forEach(b => b.onclick = () => { S.sub = { tab: b.dataset.tab }; render(); });
  $$('[data-dept]').forEach(b => b.onclick = () => { S.sub.dept = b.dataset.dept; render(); });
  $$('[data-bmonth]').forEach(b => b.onclick = () => { S.sub.bmonth = +b.dataset.bmonth; render(); });
  $$('[data-syear]').forEach(b => b.onclick = () => { S.sub.syear = +b.dataset.syear; render(); });
};
/* 사람 한 명: 요람 정보 + 이 사람에 대한 내 기록 + CBCS 교회생활 */
function personDialog(id) {
  const p = allPeople().find(x => x.id === id); if (!p) { toast('요람에서 찾지 못했습니다'); return; }
  const notes = M().notes.filter(n => (n.people || []).some(x => x.id === id)).sort((a, b) => a.date < b.date ? 1 : -1);
  const dd = C().depts[p.dept]; const tl = dd ? dd.timeline.filter(e => e.studentId === id || (e.name === p.name && (!e.birthYear || e.birthYear === (p.birth || '').slice(0, 4)))).sort((a, b) => (a.date || '') < (b.date || '') ? 1 : -1) : [];
  const s = p._s || {};
  openModal(`<h2>${esc(p.name)} <span class="pill ${p.kind === 'staff' ? 'edu' : ''}">${esc(personLabel(p))}</span><button class="btn s" id="modal-close">닫기</button></h2>
  <div class="kv">${p.phone ? `<span class="k">전화</span><span><a href="tel:${esc(p.phone.replace(/[^\d+]/g, ''))}">${esc(p.phone)}</a></span>` : ''}${p.guardianPhone ? `<span class="k">보호자</span><span><a href="tel:${esc(p.guardianPhone.replace(/[^\d+]/g, ''))}">${esc(p.guardianPhone)}</a></span>` : ''}${p.birth ? `<span class="k">생일</span><span>${esc(p.birth)}</span>` : ''}${s.school ? `<span class="k">학교</span><span>${esc(s.school)}</span>` : ''}${s.faith ? `<span class="k">신급</span><span>${esc(s.faith)}${s.faithYear ? ` (${esc(s.faithYear)})` : ''}</span>` : ''}${dd && dd.last[id] ? `<span class="k">마지막 출석</span><span>${fmtK(dd.last[id])}</span>` : ''}${s.address ? `<span class="k">주소</span><span>${esc(s.address)}</span>` : ''}</div>
  <div class="row"><button class="btn p" id="p-note">이 사람 기록 쓰기</button></div>
  <div class="sec-t">내 기록 ${notes.length}</div><div class="list">${notes.slice(0, 10).map(n => `<div class="item click" data-note="${esc(n.id)}"><div class="body"><div class="t">${esc(n.title || n.kind)} <span class="pill">${esc(n.kind)}</span></div><div class="d">${fmtK(n.date)} · ${esc((n.body || '').slice(0, 70))}</div></div></div>`).join('') || '<div class="note">아직 이 사람에 대한 기록이 없습니다.</div>'}</div>
  ${tl.length ? `<div class="sec-t">교회생활 (CBCS)</div><div class="list">${tl.slice(0, 8).map(e => `<div class="item"><div class="when">${esc((e.date || '').slice(0, 7) || e.year || '')}</div><div class="body"><div class="t">${esc(e.title || e.kind)}</div>${e.note ? `<div class="d">${esc(e.note)}</div>` : ''}</div></div>`).join('')}</div>` : ''}`);
  $('#p-note').onclick = () => { closeModal(); S.view = 'diary'; S.sub = { new: { title: `${p.name} `, kind: '심방', dept: p.dept === 'committee' ? '' : p.dept, people: [{ id: p.id, name: p.name, dept: p.dept, cls: p.cls || p.role || '' }] } }; render(); };
  $$('#modal-box [data-note]').forEach(b => b.onclick = () => { closeModal(); S.view = 'diary'; S.sub = { open: b.dataset.note }; render(); });
}

/* 일지 */
const NOTE_KINDS = ['메모', '심방', '회의', '통화'];
VIEWS.diary = () => {
  const group = S.sub.group || 'date'; const notes = [...M().notes].sort((a, b) => (a.date + (a.time || '')) < (b.date + (b.time || '')) ? 1 : -1);
  let cur = null;
  if (S.sub.new) { const n = S.sub.new; cur = { id: 'nt_' + uid(), date: n.date || today(), time: nowTime(), title: n.title || '', kind: n.kind || '메모', dept: n.dept || '', people: n.people || [], body: n.body || '', source: n.source || '', created: today(), _new: true }; S.sub.draft = S.sub.draft || cur; cur = S.sub.draft; }
  else if (S.sub.open) cur = notes.find(n => n.id === S.sub.open) || null;
  const card = n => `<button type="button" class="nt ${cur && cur.id === n.id ? 'on' : ''}" data-open="${esc(n.id)}"><div class="h"><b>${esc(n.title || n.kind)}</b><span class="pill ${n.kind === '심방' || n.kind === '통화' ? 'acc' : ''}">${esc(n.kind)}</span></div><div class="p">${group !== 'date' ? fmtK(n.date) + ' · ' : ''}${n.dept ? esc(deptName(n.dept)) + ' · ' : ''}${esc((n.body || '').replace(/\s+/g, ' ').slice(0, 60))}</div></button>`;
  let listHtml = '';
  if (group === 'date') { let last = ''; listHtml = notes.map(n => (n.date !== last ? (last = n.date, `<div class="dn">${fmtK(n.date)}${n.date === today() ? ' · 오늘' : ''}</div>`) : '') + card(n)).join(''); }
  else if (group === 'person') { const g = {}; notes.forEach(n => (n.people && n.people.length ? n.people : [{ name: '(사람 없음)' }]).forEach(p => { (g[p.name] = g[p.name] || []).push(n); })); listHtml = Object.keys(g).sort((a, b) => a.localeCompare(b, 'ko')).map(k => `<div class="dn">${esc(k)} <span class="note">${g[k].length}</span></div>` + g[k].map(card).join('')).join(''); }
  else { const g = {}; notes.forEach(n => { const k = n.dept ? deptName(n.dept) : '(부서 없음)'; (g[k] = g[k] || []).push(n); }); listHtml = Object.keys(g).map(k => `<div class="dn">${esc(k)} <span class="note">${g[k].length}</span></div>` + g[k].map(card).join('')).join(''); }
  const mob = isMobile(); const showList = !mob || !cur;
  const editor = cur ? `<div class="card editor">
    <div class="row"><span class="note">${esc(fmtLong(cur.date))}${cur.time ? ' · ' + fmtTime(cur.time) : ''}${cur.updated && !cur._new ? ` · 수정 ${esc(cur.updated)}` : ''}</span><span style="flex:1"></span>${mob ? '<button class="btn s" id="n-back">목록</button>' : ''}<button class="btn p" id="n-save">저장</button>${cur._new ? '' : '<button class="btn d s" id="n-del">지우기</button>'}</div>
    <input type="text" class="title" id="n-title" placeholder="제목" value="${esc(cur.title)}">
    <div class="row"><span class="chips" id="n-kind">${NOTE_KINDS.map(k => `<button type="button" class="chip ${cur.kind === k ? 'on' : ''}" data-kind="${k}">${k}</button>`).join('')}</span><select id="n-dept" style="width:auto"><option value="">부서 —</option>${['committee', ...Object.keys(DEPTS)].map(d => `<option value="${d}" ${cur.dept === d ? 'selected' : ''}>${deptName(d)}</option>`).join('')}</select><input type="date" id="n-date" value="${esc(cur.date)}" style="width:auto"><input type="time" id="n-time" value="${esc(cur.time || '')}" style="width:auto"></div>
    <div class="people"><span class="lab">관련 사람</span><span id="n-people" class="chips">${(cur.people || []).map(p => `<span class="chip">${esc(p.name)}<small>${esc(p.cls || deptName(p.dept))}</small><button type="button" data-rm="${esc(p.id)}" aria-label="빼기" style="border:0;background:none;padding:0 0 0 2px">×</button></span>`).join('')}</span><span class="sug" style="flex:1;min-width:140px"><input type="text" id="n-psearch" placeholder="+ 이름으로 찾기" style="border:0;min-height:34px;background:transparent"><div class="drop" id="n-drop" hidden></div></span></div>
    <textarea id="n-body" placeholder="내용. 통화 요약을 갤럭시에서 공유하면 여기 들어옵니다.">${esc(cur.body)}</textarea>
    ${cur.source ? `<div class="note">출처: ${esc(cur.source)}</div>` : ''}
    <div class="row"><button class="btn s" id="n-to-task">본문에서 할 일 뽑기</button><button class="btn s" id="n-to-event">일정으로</button><span class="note">본문의 "다음 주일 참석"처럼 날짜가 들어간 줄을 골라 할 일·일정으로 만듭니다.</span></div>
    ${(cur.people || []).length ? relatedHtml(cur) : ''}
  </div>` : `<div class="hint">왼쪽에서 기록을 고르거나 "+ 새 기록"을 누르세요. 휴대폰 공유 메뉴에서 "교육부 수첩"을 고르면 받은 글이 새 기록으로 열립니다.</div>`;
  return `<div class="topbar"><div><h1>일지</h1><div class="sub">날짜별 메모·심방·회의·통화 기록. 사람을 붙이면 그 사람의 기록으로도 모입니다.</div></div><div class="row"><span class="chips">${[['date', '날짜순'], ['person', '사람별'], ['dept', '부서별']].map(([k, l]) => `<button class="chip ${group === k ? 'on' : ''}" data-group="${k}">${l}</button>`).join('')}</span><button class="btn p" id="n-new">+ 새 기록</button></div></div>
  <div class="diary"><div class="lst ${showList ? '' : 'hide'}">${listHtml || '<div class="note">아직 기록이 없습니다.</div>'}</div><div>${editor}</div></div>`;
};
function relatedHtml(cur) {
  const items = [];
  (cur.people || []).forEach(p => { M().notes.filter(n => n.id !== cur.id && (n.people || []).some(x => x.id === p.id)).sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 3).forEach(n => items.push(`<button type="button" class="rc" data-open="${esc(n.id)}" style="text-align:left;cursor:pointer"><small>${fmtK(n.date)} · ${esc(n.kind)}</small>${esc(n.title || '')}${n.body ? `<small>${esc(n.body.replace(/\s+/g, ' ').slice(0, 50))}</small>` : ''}</button>`)); const dd = C().depts[p.dept]; if (dd) dd.timeline.filter(e => e.studentId === p.id).sort((a, b) => (a.date || '') < (b.date || '') ? 1 : -1).slice(0, 2).forEach(e => items.push(`<div class="rc"><small>${esc((e.date || '').slice(0, 7) || e.year || '')} · 교회생활</small>${esc(e.title || e.kind)}</div>`)); });
  return items.length ? `<div class="sec-t">이 사람들의 다른 기록</div><div class="rel">${items.join('')}</div>` : '';
}
BIND.diary = () => {
  $$('[data-group]').forEach(b => b.onclick = () => { S.sub.group = b.dataset.group; render(); });
  const nn = $('#n-new'); if (nn) nn.onclick = () => { S.sub = { group: S.sub.group, new: {} }; render(); };
  $$('[data-open]').forEach(b => b.onclick = () => { S.sub = { group: S.sub.group, open: b.dataset.open }; render(); });
  const back = $('#n-back'); if (back) back.onclick = () => { S.sub = { group: S.sub.group }; render(); };
  const cur = S.sub.draft || (S.sub.open ? M().notes.find(n => n.id === S.sub.open) : null); if (!cur) return;
  const read = () => { cur.title = $('#n-title').value.trim(); cur.dept = $('#n-dept').value; cur.date = $('#n-date').value || today(); cur.time = $('#n-time').value; cur.body = $('#n-body').value; };
  $$('#n-kind [data-kind]').forEach(b => b.onclick = () => { cur.kind = b.dataset.kind; $$('#n-kind [data-kind]').forEach(x => x.classList.toggle('on', x === b)); });
  $$('#n-people [data-rm]').forEach(b => b.onclick = () => { read(); cur.people = cur.people.filter(p => p.id !== b.dataset.rm); if (!cur._new) S.sub.draft = cur; render(); });
  const ps = $('#n-psearch'), drop = $('#n-drop');
  ps.oninput = () => { const hits = findPeople(ps.value).filter(h => !(cur.people || []).some(p => p.id === h.id)); drop.hidden = !hits.length; drop.innerHTML = hits.map(h => `<button type="button" data-pick="${esc(h.id)}">${esc(h.name)}<small>${esc(personLabel(h))}</small></button>`).join(''); drop.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { const h = allPeople().find(x => x.id === b.dataset.pick); read(); cur.people = [...(cur.people || []), { id: h.id, name: h.name, dept: h.dept, cls: h.cls || h.role || '' }]; if (!cur._new) S.sub.draft = cur; render(); setTimeout(() => { const el = $('#n-psearch'); if (el) el.focus(); }, 30); }); };
  ps.onblur = () => setTimeout(() => { if (drop) drop.hidden = true; }, 200);
  $('#n-save').onclick = async () => { read(); if (!cur.title && !cur.body.trim()) { toast('제목이나 내용을 적어 주세요'); return; } if (!cur.title) cur.title = cur.body.trim().split('\n')[0].slice(0, 40); const n = { ...cur }; delete n._new; delete n._id; await saveNote(n); S.sub = { group: S.sub.group, open: n.id }; render(); toast('저장했습니다'); };
  const del = $('#n-del'); if (del) del.onclick = async () => { if (!confirm('이 기록을 지울까요?')) return; await api.del(`${me()}/notes/${cur.id}`); M().notes = M().notes.filter(n => n.id !== cur.id); S.sub = { group: S.sub.group }; render(); };
  $('#n-to-task').onclick = () => { read(); pickLines(cur, 'task'); };
  $('#n-to-event').onclick = () => { read(); pickLines(cur, 'event'); };
  // 글을 고치면 그대로 두고 떠나지 않도록 초안으로 잡아 둔다
  ['n-title', 'n-body', 'n-date', 'n-time', 'n-dept'].forEach(id => { const el = $('#' + id); if (el) el.oninput = () => { read(); S.sub.draft = cur; }; });
  if (cur._new && !cur.body) setTimeout(() => { const el = $('#n-title'); if (el && !el.value) el.focus(); }, 30);
  $$('.rel [data-open]').forEach(b => b.onclick = () => { S.sub = { group: S.sub.group, open: b.dataset.open }; render(); });
};
/* 본문에서 줄을 골라 할 일·일정으로 — 날짜 말이 있는 줄을 먼저 추천 */
function pickLines(cur, kind) {
  const lines = (cur.body || '').split(/\n|[.。]\s/).map(s => s.trim()).filter(s => s.length > 1);
  if (!lines.length) { toast('본문이 비어 있습니다'); return; }
  const rows = lines.map((l, i) => { const p = parseQuick(l, cur.date); return { i, l, p, hint: p.date ? fmtK(p.date) + (p.time ? ' ' + fmtTime(p.time) : '') : '' }; }).sort((a, b) => (b.hint ? 1 : 0) - (a.hint ? 1 : 0));
  openModal(`<h2>${kind === 'task' ? '할 일로 만들 줄 고르기' : '일정으로 만들 줄 고르기'}<button class="btn s" id="modal-close">닫기</button></h2><div class="note">날짜가 보이는 줄은 그 날짜로, 없으면 ${kind === 'task' ? '기한 없음' : '기록 날짜'}으로 넣습니다. 넣은 뒤 할 일·달력에서 고칠 수 있습니다.</div>
  <div class="list">${rows.map(r => `<label class="item"><input type="checkbox" data-line="${r.i}" ${r.hint ? 'checked' : ''}><div class="body"><div class="t">${esc(r.l)}</div><div class="d">${r.hint ? '→ ' + esc(r.hint) : '날짜 없음'}${r.p.dept ? ' · ' + deptName(r.p.dept) : ''}</div></div></label>`).join('')}</div><div class="row"><button class="btn p" id="pl-go">만들기</button></div>`);
  $('#pl-go').onclick = async () => { const picked = $$('#modal-box [data-line]:checked').map(c => rows.find(r => r.i === +c.dataset.line)); if (!picked.length) { toast('줄을 골라 주세요'); return; } for (const r of picked) { const p = r.p; const dept = p.dept || cur.dept || ''; if (kind === 'task') await saveTask({ id: 'tk_' + uid(), title: p.title, due: p.date || '', dept, done: false, from: cur.id, created: today() }); else await saveEvent({ id: 'ev_' + uid(), date: p.date || cur.date, time: p.time || '', end: '', title: p.title, dept, note: `기록에서: ${cur.title || ''}`.trim(), from: cur.id, created: today() }); } closeModal(); toast(`${picked.length}건 만들었습니다`); render(); };
}

/* 할 일 */
VIEWS.tasks = () => {
  const t = today(); const f = S.sub.filter || 'open'; const dept = S.sub.dept || '';
  let list = M().tasks.filter(x => (f === 'done' ? x.done : f === 'all' ? true : !x.done) && (!dept || x.dept === dept)).sort((a, b) => (a.done !== b.done ? (a.done ? 1 : -1) : (a.due || '9') < (b.due || '9') ? -1 : 1));
  const wkEnd = shiftDay(t, 6 - dow(t));
  const groups = f === 'open' ? [['기한 지남', x => x.due && x.due < t], ['오늘', x => x.due === t], ['이번 주', x => x.due && x.due > t && x.due <= wkEnd], ['나중', x => x.due && x.due > wkEnd], ['기한 없음', x => !x.due]] : [['', () => true]];
  return `<div class="topbar"><div><h1>할 일</h1><div class="sub">남은 ${M().tasks.filter(x => !x.done).length} · 마친 ${M().tasks.filter(x => x.done).length}</div></div><div class="row"><span class="chips">${[['open', '남은 것'], ['done', '마친 것'], ['all', '모두']].map(([k, l]) => `<button class="chip ${f === k ? 'on' : ''}" data-filter="${k}">${l}</button>`).join('')}</span></div></div>
  <div class="chips" style="margin-bottom:12px"><button class="chip ${!dept ? 'on' : ''}" data-dept="">전체</button>${['committee', ...Object.keys(DEPTS)].map(k => `<button class="chip ${dept === k ? 'on' : ''}" data-dept="${k}">${deptName(k)}</button>`).join('')}</div>
  <div class="card"><div class="task-add"><input type="text" id="t-add" placeholder="+ 할 일 추가 — 예: 초등부 계획서 확인 11/8까지 (Enter)" enterkeyhint="done"><button class="btn p" id="t-go">추가</button></div></div>
  ${groups.map(([g, fn]) => { const rows = list.filter(fn); return rows.length ? `<div class="card" style="margin-top:12px">${g ? `<h2>${g} <span class="r">${rows.length}</span></h2>` : ''}<div class="list">${rows.map(taskRow).join('')}</div></div>` : ''; }).join('') || '<div class="hint" style="margin-top:12px">여기에 해당하는 할 일이 없습니다.</div>'}`;
};
BIND.tasks = () => {
  $$('[data-filter]').forEach(b => b.onclick = () => { S.sub.filter = b.dataset.filter; render(); });
  $$('[data-dept]').forEach(b => b.onclick = () => { S.sub.dept = b.dataset.dept; render(); });
  const add = async () => { const v = $('#t-add').value.trim(); if (!v) return; const p = parseQuick(v); await saveTask({ id: 'tk_' + uid(), title: p.title, due: p.date || '', dept: p.dept || S.sub.dept || '', done: false, created: today() }); $('#t-add').value = ''; render(); toast('할 일 추가'); };
  $('#t-go').onclick = add; $('#t-add').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
};
function taskDialog(id) {
  const t = M().tasks.find(x => x.id === id); if (!t) return;
  openModal(`<h2>할 일 고치기<button class="btn s" id="modal-close">닫기</button></h2><label class="f"><span>내용</span><input type="text" id="t-title" value="${esc(t.title)}"></label><div class="fields"><label class="f"><span>기한</span><input type="date" id="t-due" value="${esc(t.due || '')}"></label><label class="f"><span>부서</span><select id="t-dept"><option value="">—</option>${['committee', ...Object.keys(DEPTS)].map(d => `<option value="${d}" ${t.dept === d ? 'selected' : ''}>${deptName(d)}</option>`).join('')}</select></label></div><label class="f"><span>메모</span><textarea id="t-note" style="min-height:60px">${esc(t.note || '')}</textarea></label><div class="row"><button class="btn p" id="t-save">저장</button><button class="btn d" id="t-del">지우기</button></div>`);
  $('#t-save').onclick = async () => { t.title = $('#t-title').value.trim() || t.title; t.due = $('#t-due').value; t.dept = $('#t-dept').value; t.note = $('#t-note').value.trim(); await saveTask(t); closeModal(); render(); };
  $('#t-del').onclick = async () => { if (!confirm('이 할 일을 지울까요?')) return; await api.del(`${me()}/tasks/${t.id}`); M().tasks = M().tasks.filter(x => x.id !== t.id); closeModal(); render(); };
}

/* ───────────── 틀 그리기 ───────────── */
async function render() {
  const root = $('#root');
  if (!S.user) { root.innerHTML = loginView(); bindLogin(); return; }
  if (!S.mine || !S.cbcs.ready) { root.innerHTML = '<div class="boot">자료 읽는 중… (처음에는 조금 걸립니다)</div>'; try { await Promise.all([loadMine(), loadCBCS()]); } catch (e) { console.error(e); root.innerHTML = `<div class="hint" style="margin:40px auto;max-width:480px">자료를 읽지 못했습니다: ${esc(e.message)}<br><br>Firestore 규칙에 수첩(planner) 규칙이 들어 있는지 확인하세요. <button class="btn s" id="re-login">다시 로그인</button></div>`; $('#re-login').onclick = async () => { await signOut(auth); S.user = null; render(); }; return; } }
  const mob = isMobile(); let body = '';
  try { body = VIEWS[S.view] ? VIEWS[S.view]() : VIEWS.today(); } catch (e) { console.error(e); body = `<div class="hint">화면을 그리는 중 문제가 생겼습니다: ${esc(e.message)}</div>`; }
  root.innerHTML = `<div class="app">
    <aside class="side"><div class="brand"><div class="mark">수첩</div><div><b>교육부 수첩</b><small>개인용 · ${acctLabel()}</small></div></div>
      <nav class="nav">${NAV.map(([k, l, ic]) => `<button data-nav="${k}" class="${S.view === k ? 'on' : ''}"><span class="k">${ic}</span>${l}</button>`).join('')}</nav>
      <div class="bottom"><div>CBCS에서 가져옴 — 교적부 · 조직 · 행사 · 절기 · 출석 요약</div><div class="who"><span>${esc(S.user.email || '')}</span></div><div class="row"><a class="btn s" href="../" target="_blank" rel="noopener">CBCS 열기</a><button class="btn s" data-refresh>↻ 다시 읽기</button><button class="btn s" data-logout>나가기</button></div><div>제작자: 이삭 목사 · 중앙성서교회</div></div>
    </aside>
    <main class="main" id="main">${quickBar()}${body}</main>
    <nav class="mobile-nav">${NAV.map(([k, l, ic]) => `<button data-nav="${k}" class="${S.view === k ? 'on' : ''}"><span class="k">${ic}</span>${l}</button>`).join('')}</nav>
  </div>`;
  root.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => { S.view = b.dataset.nav; S.sub = {}; render(); });
  root.querySelectorAll('[data-go]').forEach(b => b.onclick = e => { e.stopPropagation(); S.view = b.dataset.go; S.sub = b.dataset.new ? { new: {} } : b.dataset.note ? { open: b.dataset.note } : {}; render(); });
  root.querySelectorAll('[data-refresh]').forEach(b => b.onclick = async () => { toast('다시 읽는 중…'); S.cbcs = {}; S.mine = null; await render(); toast('다시 읽었습니다'); });
  root.querySelectorAll('[data-logout]').forEach(b => b.onclick = async () => { await signOut(auth); S.user = null; S.mine = null; S.cbcs = {}; render(); });
  root.querySelectorAll('[data-person]').forEach(b => b.onclick = e => { e.stopPropagation(); if (b.dataset.person) personDialog(b.dataset.person); });
  root.querySelectorAll('[data-ev]').forEach(b => b.onclick = e => { e.stopPropagation(); eventDialog({ id: b.dataset.ev }); });
  root.querySelectorAll('[data-task]').forEach(c => c.onchange = async () => { const t = M().tasks.find(x => x.id === c.dataset.task); if (!t) return; t.done = c.checked; t.doneAt = c.checked ? today() : ''; await saveTask(t); S.keepScroll = window.scrollY; render(); toast(t.done ? '마쳤습니다' : '다시 열었습니다'); });
  root.querySelectorAll('[data-task-edit]').forEach(b => b.onclick = e => { e.preventDefault(); e.stopPropagation(); taskDialog(b.dataset.taskEdit); });
  bindQuick(); if (BIND[S.view]) { try { BIND[S.view](); } catch (e) { console.error(e); } }
  if (S.keepFocus) { const el = $('#' + S.keepFocus); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } S.keepFocus = null; }
  if (S.keepScroll != null) { window.scrollTo(0, S.keepScroll); S.keepScroll = null; } else if (!mob) window.scrollTo(0, 0);
}
const acctLabel = () => S.me === 'committee' ? '교육위원회 계정' : S.me ? `${deptName(S.me)} 계정` : '';
window.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { const q = $('#q-in'); if (q) { e.preventDefault(); q.focus(); } } });
matchMedia('(max-width:900px)').addEventListener('change', () => { if (S.user) render(); });

/* 로그인 — CBCS와 같은 계정(교육위원회 계정이면 네 부서 요람을 모두 봄) */
function loginView() {
  return `<div class="login"><div class="brand"><div class="mark">수첩</div><div><b>교육부 수첩</b><small>개인 다이어리 + 요람</small></div></div>
  <label class="f"><span>계정</span><select id="l-acct">${['committee', ...Object.keys(DEPTS)].map(d => `<option value="${d}" ${d === 'committee' ? 'selected' : ''}>${deptName(d)}</option>`).join('')}</select></label>
  <label class="f"><span>비밀번호 (CBCS 부서 비밀번호)</span><input type="password" id="l-pw" autocomplete="current-password"></label>
  <button class="btn p" id="l-go">열기</button><div class="note" id="l-msg"></div>
  <div class="foot">일정·할 일·일지는 이 계정의 개인 영역(planner)에만 저장되고, CBCS 자료는 읽기만 합니다. 교육위원회 계정이면 네 부서 요람을 모두 봅니다.</div></div>`;
}
function bindLogin() {
  const go = async () => { const d = $('#l-acct').value, pw = $('#l-pw').value; if (!pw) return; $('#l-msg').textContent = '여는 중…'; try { await signInWithEmailAndPassword(auth, `${ACCOUNTS[d]}@${DOMAIN}`, pw); } catch (e) { $('#l-msg').textContent = '비밀번호가 맞지 않거나 접속할 수 없습니다.'; } };
  $('#l-go').onclick = go; $('#l-pw').onkeydown = e => { if (e.key === 'Enter') go(); };
}
onAuthStateChanged(auth, u => { const acct = acctOf(u); if (u && !acct) { signOut(auth); return; } S.user = u || null; S.me = acct; if (u) applyEntry(); render(); });
/* 공유·바로가기로 들어온 주소 처리 (한 번만) */
let entered = false;
function applyEntry() {
  if (entered) return; entered = true;
  const text = QS.get('text') || '', title = QS.get('title') || '', url = QS.get('url') || '';
  if (text || title) { S.view = 'diary'; S.sub = { new: { title: (title || text.split('\n')[0]).slice(0, 40), kind: /통화|전화|call/i.test(title + text) ? '통화' : '메모', body: [text, url].filter(Boolean).join('\n'), source: '휴대폰 공유' } }; history.replaceState(null, '', location.pathname); }
  else if (QS.get('new') === 'note') { S.view = 'diary'; S.sub = { new: {} }; history.replaceState(null, '', location.pathname); }
  else if (QS.get('quick') === '1') { S.focusQuick = true; history.replaceState(null, '', location.pathname); }
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
