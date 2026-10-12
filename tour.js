/* CBCS 튜토리얼 — 체험 모드(?demo=1)에서 가상 자료로 화면을 차례로 보여 줍니다. 실제 자료에는 손대지 않습니다. */
const STEPS = [
  { as: 'elem', view: 'home', sel: '.tiles', title: '부서 메인', body: '로그인하면 우리 부서 메인이 열립니다. 지난 주일 출석·헌금, 공지, 이달 일정, 생일이 한 화면에 모입니다. 왼쪽 메뉴를 누르면 하위 메뉴가 아래로 펼쳐집니다.' },
  { as: 'elem', view: 'weekly', sub: { date: '2026-10-11' }, sel: '.cls', title: '주일 보고서 쓰기', body: '이번 주 보고서입니다. 학생 이름을 누르면 출석, 한 번 더 누르면 온라인 출석입니다. 남·여·합계·출석률은 앱이 셉니다. 직접 눌러 보세요.' },
  { as: 'elem', view: 'weekly', sub: { preview: '2026-10-04' }, sel: '.paper', title: '보고서 출력', body: '작성한 보고서는 통일 양식 그대로 PDF로 저장하거나 인쇄합니다. 출력물에는 학생 이름과 출석만 들어가고 연락처·주소는 나가지 않습니다.' },
  { as: 'elem', view: 'monthly', sub: { month: '2026-09' }, sel: '.paper', title: '월간 보고서는 자동', body: '그 달 주일 보고서 4~5장과 회계가 모여 월간 보고서가 이미 만들어져 있습니다. 부장은 다음 달 계획만 적고 출력해 월례회에 냅니다.' },
  { as: 'elem', view: 'plan', sel: 'main .card', title: '연간계획서', body: '표어·말씀·목표·행사·예산을 적고 확정하면 메인에 알려지고, 예산 합계가 그해 회계 장부의 예산이 됩니다.' },
  { as: 'elem', view: 'ledger', sel: '.tiles', title: '회계', body: '지출을 한 건씩 적으면 월 합계·누계·잔액·집행률이 바로 계산됩니다. 지출결의서도 여기서 출력하고, 기자재·교재는 물품대장에 자동으로 올라갑니다.' },
  { as: 'elem', view: 'roster', sel: 'table.roster', title: '출석부', body: '학생 카드에는 반·생년월일·신급·연락처·소속 이력과 올해 출석이 모입니다. 이 정보는 우리 부서와 교육위원회만 볼 수 있습니다.' },
  { as: 'elem', view: 'stats', sel: '[data-range]', title: '출석 통계', body: '전체·6개월·3개월·1달을 골라 주별 추이와 학생별 출석률을 봅니다. 4주 연속 결석한 학생은 따로 표시되어 심방에 씁니다.' },
  { as: 'elem', view: 'dropouts', sel: 'main .card', title: '제적 관리', body: '오래 결석한 학생이 자동으로 후보에 오릅니다. 제적은 날짜·구분·사유를 남기고, 언제든 복적할 수 있습니다.' },
  { as: 'committee', view: 'home', sel: 'main table', title: '교육위원회 화면', body: '교육위원회 계정으로 들어가면 전 부서의 이번 주 제출 현황이 한 표로 보이고, 공지와 공통 일정을 올리면 모든 부서 화면에 나타납니다.' },
  { as: 'committee', view: 'assembly', sel: '.quorum', title: '청년부 총회 자료', body: '청년부는 회칙에 따라 총회 정족수, 결의권자, 회장·부회장 후보 자격자를 자동으로 계산합니다. 회칙과 총회 회의록도 같은 메뉴에 있습니다.' },
  { as: 'elem', view: 'home', sel: null, title: '이제 직접 눌러 보세요', body: '튜토리얼은 여기까지입니다. 모든 이름과 숫자는 가상이고, 바꾼 내용은 이 브라우저에만 저장됩니다. 왼쪽 아래 "체험 자료 초기화"로 처음 상태로 돌릴 수 있습니다.' }
];
let i = -1;
const app = () => window.CBCS_APP;
async function show(n) {
  const A = app(); if (!A) return;
  i = Math.max(0, Math.min(STEPS.length - 1, n)); const st = STEPS[i];
  if (A.S.user !== st.as) { await A.backend.login(st.as); A.S.user = st.as; A.S.dept = st.as === 'committee' ? null : st.as; A.S.data = {}; A.S.committee = null; }
  A.S.view = st.view; A.S.sub = { ...(st.sub || {}) }; A.S.navOpen = {};
  await A.render();
}
function card() {
  const st = STEPS[i]; let el = document.getElementById('tour'); if (!el) { el = document.createElement('div'); el.id = 'tour'; el.className = 'tour no-print'; document.body.appendChild(el); }
  el.innerHTML = `<div class="tour-n">튜토리얼 ${i + 1} / ${STEPS.length} · 가상 자료</div><h3>${st.title}</h3><p>${st.body}</p><div class="tour-b"><button class="btn s" data-t="end">끝내기</button><span style="flex:1"></span>${i ? '<button class="btn s" data-t="prev">이전</button>' : ''}${i < STEPS.length - 1 ? '<button class="btn s p" data-t="next">다음</button>' : '<button class="btn s p" data-t="end">직접 해 보기</button>'}</div>`;
  el.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { const t = b.dataset.t; if (t === 'end') end(); else show(i + (t === 'next' ? 1 : -1)); });
}
function highlight() {
  document.querySelectorAll('.tour-hl').forEach(x => x.classList.remove('tour-hl'));
  const st = STEPS[i]; if (!st.sel) return; const t = document.querySelector(st.sel); if (!t) return;
  const box = st.sel === '[data-range]' ? t.parentElement : t; box.classList.add('tour-hl');
  const r = box.getBoundingClientRect(); if (r.top > innerHeight * .6 || r.top < 0) window.scrollTo({ top: Math.max(0, scrollY + r.top - 90), behavior: 'smooth' });
}
function end() { i = -1; const el = document.getElementById('tour'); if (el) el.remove(); document.querySelectorAll('.tour-hl').forEach(x => x.classList.remove('tour-hl')); }
window.CBCS_TOUR = { start: () => show(0), afterRender: () => { if (i < 0) return; card(); setTimeout(highlight, 60); }, active: () => i >= 0 };
