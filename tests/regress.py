"""CBCS 회귀 시험 — 체험 모드(가상 자료·브라우저 안 저장소)만 쓴다. 운영 자료에 쓰지 않는다.
쓰는 법: 사이트 폴더를 http로 띄운 뒤  python3 tests/regress.py http://localhost:8765
각 시험은 "고치기 전 실패했던 상황"을 그대로 재현하고, 지금 코드에서 통과하는지 본다.
"""
import sys, json, os, tempfile
from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765').rstrip('/')
CHROME = os.environ.get('CHROME', '/opt/pw-browsers/chromium')
results = []

def rec(name, ok, detail=''):
    results.append({'test': name, 'pass': bool(ok), 'detail': detail})

def login(b, dept, w=1440):
    pg = b.new_page(viewport={'width': w, 'height': 1000})
    pg.errs = []; pg.on('pageerror', lambda e: pg.errs.append(str(e)))
    pg.goto(BASE + '/?demo=1'); pg.wait_for_timeout(1200)
    pg.evaluate("()=>{try{localStorage.clear()}catch(e){}}"); pg.goto(BASE + '/?demo=1'); pg.wait_for_timeout(1200)
    pg.select_option('#lg-dept', dept); pg.fill('#lg-pw', 'x'); pg.click('#lg-go'); pg.wait_for_timeout(2500)
    return pg

def go(pg, view, sub='{}'):
    pg.evaluate(f"()=>{{const A=window.CBCS_APP; A.S.view='{view}'; A.S.sub={sub}; return A.render();}}"); pg.wait_for_timeout(1200)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME) if os.path.exists(CHROME) else p.chromium.launch()

    # R01 보고서 숫자 칸(classRows)에 HTML이 들어 있어도 실행되지 않아야 함
    pg = login(b, 'elem')
    pg.evaluate("""async()=>{const A=window.CBCS_APP; const p='depts/elem/reports/2026-09-27'; const r=(await A.backend.get(p))||{date:'2026-09-27'};
      r.att={}; r.classRows=[{classId:'가상반', teacher:'', present:[], reg:'<img src=x onerror="window.__xss=1">', att:'<b id=xssb>1</b>'}];
      await A.backend.set(p, r); A.S.data.elem.reports['2026-09-27']=r;}""")
    go(pg, 'weekly', "{preview:'2026-09-27'}"); pg.wait_for_timeout(800)
    ran = pg.evaluate("()=>!!window.__xss"); el = pg.evaluate("()=>!!document.querySelector('.paper img, #xssb')")
    rec('R01 보고서 재적·출석 칸 HTML 실행 막기', not ran and not el, f'실행={ran}, 요소생성={el}')
    pg.close()

    # R02 아직 없는 주일 보고서를 두 사람이 각각 처음 저장해도 둘 다 남아야 함
    pg = login(b, 'elem'); D = '2026-12-20'
    go(pg, 'weekly', f"{{date:'{D}'}}")
    ids = pg.evaluate("()=>[...document.querySelectorAll('[data-att]')].map(b=>b.dataset.att)")
    A_, B_ = ids[0], ids[1]
    # 두 번째 사람(B)도 "보고서가 아직 없을 때" 화면을 열어 둔 상태를 만든다
    pg.evaluate(f"()=>{{window.__staleB = JSON.parse(JSON.stringify(window.CBCS_APP.S.data.elem.reports['{D}'] || {{date:'{D}',att:{{}},absent:{{}}}}));}}")
    pg.click(f'[data-att="{A_}"]'); pg.wait_for_timeout(1000)   # A가 먼저 저장(문서 생성)
    pg.evaluate(f"""async()=>{{const A=window.CBCS_APP, dd=A.S.data.elem; const r=window.__staleB; r.att=r.att||{{}}; r.att['{B_}']='P';
      if (A.saveReport) {{ delete dd.reportBase['{D}']; await A.saveReport(dd, r); }} else {{ await A.backend.set('depts/elem/reports/{D}', r); }}}}""")
    pg.wait_for_timeout(600)
    att = pg.evaluate(f"async()=>((await window.CBCS_APP.backend.get('depts/elem/reports/{D}'))||{{}}).att||{{}}")
    rec('R02 새 주일 보고서 두 사람 출석 보존', A_ in att and B_ in att, f'남은 출석 {list(att.keys())}')
    pg.close()

    # R03-A 쓰던 글이 있을 때 화면 폭이 바뀌어도 사라지지 않아야 함
    pg = login(b, 'elem'); go(pg, 'weekly', "{date:'2026-10-11'}")
    sel = pg.evaluate("()=>{const i=document.querySelector('.main input[type=text]'); i.id=i.id||'t_inp'; return '#'+i.id}")
    pg.fill(sel, '시험-저장안함-제목'); pg.wait_for_timeout(200)
    pg.set_viewport_size({'width': 390, 'height': 900}); pg.wait_for_timeout(1200)
    pg.set_viewport_size({'width': 1440, 'height': 1000}); pg.wait_for_timeout(1200)
    v = pg.evaluate(f"()=>document.querySelector('{sel}')?.value")
    rec('R03-A 화면 폭 바뀌어도 초안 유지', v == '시험-저장안함-제목', f'남은 값={v!r}')
    pg.close()

    # R03-B 저장이 실패하면 "저장 안 됨" 표시가 남아야 함
    pg = login(b, 'elem'); go(pg, 'weekly', "{date:'2026-10-11'}")
    pg.fill('.main input[type=text]', '시험-저장실패'); pg.wait_for_timeout(200)
    pg.evaluate("""()=>{const B=window.CBCS_APP.backend; const boom=async()=>{throw new Error('시험용 네트워크 실패')};
      if (B._raw) { B._raw.set=boom; B._raw.setMerge=boom; B._raw.update=boom; } else { B.set=boom; B.update=boom; B.setMerge=boom; }}""")
    pg.click('#w-save'); pg.wait_for_timeout(1500)
    d = pg.evaluate("()=>window.CBCS_APP.S.dirty")
    pg.click('[data-nav="home"]'); pg.wait_for_timeout(500)
    warned = pg.is_visible('#lv-stay')
    rec('R03-B 저장 실패 뒤에도 미저장 경고 유지', bool(d) and warned, f'dirty={d}, 이동 경고={warned}')
    pg.close()

    # R04 과거 출석부 가져오기: 이름 같고 출생연도 다르면 합치지 않아야 함
    pg = login(b, 'young')
    pg.evaluate("""async()=>{const A=window.CBCS_APP, dd=A.S.data.young; const s={id:'young_가상동명_1998-05-01',name:'가상동명',birth:'1998-05-01',sex:'남',dept:'young',status:'active',history:[],statusLog:[],flags:[]};
      dd.students.push(s); await A.backend.set('depts/young/students/'+s.id, s);}""")
    go(pg, 'roster')
    payload = {'students': [{'name': '가상동명', 'birth': '2003-05-01', 'years': {'2024': {'group': '청년', 'fam': '가상팸'}}}], 'reports': [], 'officers': []}
    f = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False); json.dump(payload, f, ensure_ascii=False); f.close()
    if pg.query_selector('#ya-import'):
        pg.click('#ya-import'); pg.wait_for_timeout(400); pg.set_input_files('#ya-file', f.name); pg.click('#ya-go'); pg.wait_for_timeout(2500)
        h = pg.evaluate("async()=>((await window.CBCS_APP.backend.get('depts/young/students/young_가상동명_1998-05-01'))||{}).history||[]")
        log = pg.evaluate("()=>document.querySelector('#ya-log')?.textContent||''")
        rec('R04 출생연도 다른 동명이인 합치지 않기', not any(str(x.get('year')) == '2024' for x in h), f'1998년생 이력={h} / 로그 확인필요 표시={"확인 필요" in log}')
    else:
        rec('R04 출생연도 다른 동명이인 합치지 않기', False, '가져오기 단추를 찾지 못함')
    pg.close()

    # R05 복원 미리보기: 지금 자료를 못 읽으면 "비교 못 함"이고 되돌리기 단추가 없어야 함
    pg = login(b, 'committee'); go(pg, 'backup')
    bk = {'kind': 'cbcs-backup', 'generated': '2026-10-01T00:00:00Z', 'raw': [{'path': 'depts/young/students/young_가상_2000-01-01', 'data': {'name': '가상'}}]}
    f2 = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False); json.dump(bk, f2, ensure_ascii=False); f2.close()
    pg.evaluate("""()=>{const B=window.CBCS_APP.backend; const boom=async()=>{throw new Error('시험용 읽기 실패')}; if (B._raw) B._raw.list=boom; else B.list=boom;}""")
    pg.set_input_files('#rt-file', f2.name); pg.wait_for_timeout(2000)
    txt = pg.inner_text('#rt-preview'); btn = bool(pg.query_selector('#rt-go'))
    rec('R05 읽기 실패 시 비교 못 함·되돌리기 막기', ('비교 못 함' in txt) and not btn, f'되돌리기 단추={btn}')
    pg.close()

    # R06 회의록: 650KB 넘는 원본은 "원본 제외"로 알려야 함
    pg = login(b, 'young'); go(pg, 'meetings')
    big = tempfile.NamedTemporaryFile('w', suffix='.txt', delete=False, prefix='가상회의록_2026.10.04_')
    big.write('회 의 록\n일시\n2026. 10. 04(주일)\n작성자\n가상작성자\n참석자\n가, 나\n주요안건\n원본크기시험\n안건\n' + ('내용 ' * 150000)); big.close()
    pg.click('#mt-up'); pg.set_input_files('#mt-files', big.name); pg.wait_for_timeout(2500)
    if pg.query_selector('#mt-import'):
        pg.click('#mt-import'); pg.wait_for_timeout(3000)
    txt = pg.inner_text('#mt-prev') if pg.query_selector('#mt-prev') else ''
    rec('R06 큰 원본은 "제외"로 따로 표시', '제외' in txt and '원본' in txt, txt.replace('\n', ' ')[:160])
    pg.close()

    # R07 회칙 옛 판 올리기: 본문 끝 개정 기록에서 차수·개정일을 채우고 "이전 판"으로, 목록은 날짜순
    pg = login(b, 'young'); go(pg, 'bylaws')
    old = tempfile.NamedTemporaryFile('w', suffix='.txt', delete=False, prefix='가상회칙_13년총회수정본_')
    old.write('가상 청년부 회칙\n제1조 : 가상 조문이다.\n제2조 : 가상 조문 둘.\n11차 수정 : 2011년 9월 26일\n12차 수정 : 2012년 10월 21일\n'); old.close()
    pg.click('#bl-upload'); pg.set_input_files('#bu-file', old.name); pg.wait_for_timeout(1500)
    f = pg.evaluate("()=>({to:$('#bu-to').value, rev:$('#bu-rev').value, date:$('#bu-date').value, st:$('#bu-status').value})".replace('$(', 'document.querySelector('))
    pg.click('#bu-save'); pg.wait_for_timeout(1500)
    lst = pg.evaluate("()=>[...document.querySelectorAll('.vlist .item .t')].map(x=>x.textContent)")
    pos = lst.index('12차 수정') if '12차 수정' in lst else -1
    ok = f == {'to': 'new', 'rev': '12차 수정', 'date': '2012-10-21', 'st': 'old'} and pos > 0
    rec('R07 옛 판 차수·개정일 자동, 이전 판, 날짜순 정렬', ok, f'{f} / 목록={lst}')
    pg.close()

print(json.dumps(results, ensure_ascii=False, indent=1))
sys.exit(0 if all(r['pass'] for r in results) else 1)
