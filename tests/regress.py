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

    # ── 2026-10-14 사용성 재점검(af0ffea) 반영 ──
    def t_R08():
        # R08 연간계획서 출력 화면: 인쇄·돌아가기 단추가 연결되어야 함 (UX-01)
        pg = login(b, 'elem'); go(pg, 'plan')
        pg.evaluate("()=>{window.__pc=0; window.print=()=>{window.__pc++}}")
        pg.click('#pl-open-print'); pg.wait_for_timeout(1000)
        if pg.query_selector('#pl-print'): pg.click('#pl-print'); pg.wait_for_timeout(1200)
        pc = pg.evaluate("()=>window.__pc")
        if pg.query_selector('#pl-back'): pg.click('#pl-back'); pg.wait_for_timeout(1000)
        back = bool(pg.query_selector('#pl-year'))
        rec('R08 계획서 출력 인쇄·돌아가기', pc >= 1 and back, f'인쇄 호출={pc}, 돌아감={back}')
        pg.close()
    try: t_R08()
    except Exception as e:
        rec('R08 (실행 오류)', False, str(e)[:160])
        try: pg.close()
        except Exception: pass

    def t_R09():
        # R09 계획서 일정 추가 뒤에도 쓰던 표어가 저장되어야 함 (UX-02)
        pg = login(b, 'elem'); Y = pg.evaluate("()=>window.CBCS_YEAR||2026") + 1
        go(pg, 'plan', f"{{year:{Y}}}")
        pg.fill('#pl-slogan', '사라지면 안 되는 계획 초안')
        pg.fill('#ev-date', f'{Y}-01-10'); pg.fill('#ev-title', '시험 일정'); pg.click('#ev-add'); pg.wait_for_timeout(1500)
        saved = pg.evaluate(f"async()=>((await window.CBCS_APP.backend.get('depts/elem/plans/{Y}'))||{{}}).slogan||''")
        rec('R09 일정 추가 때 계획 초안 함께 저장', saved == '사라지면 안 되는 계획 초안', f'저장된 표어={saved!r}')
        pg.close()
    try: t_R09()
    except Exception as e:
        rec('R09 (실행 오류)', False, str(e)[:160])
        try: pg.close()
        except Exception: pass

    def t_R10():
        # R10 새 주일: 서기가 설교·헌금 저장 뒤, 먼저 열어 둔 다른 화면이 출석만 저장해도 설교·헌금이 남아야 함 (UX-03)
        pg = login(b, 'elem'); D = '2026-12-27'
        res = pg.evaluate(f"""async()=>{{const A=window.CBCS_APP, dd=A.S.data.elem; delete dd.reports['{D}']; const mk = A.blankReport || ((dd,d)=>({{dept:dd.id,date:d,title:'',preacher:'',att:{{}},absent:{{}},offering:{{sunday:0,tithe:0,thanks:0,other:0}},status:'draft'}})); if (dd.reportBase) delete dd.reportBase['{D}'];
          const stale = mk(dd,'{D}');                       // 팸장 화면: 보고서가 아직 없을 때 열어 둠
          const a = mk(dd,'{D}'); a.title='서기가 입력한 설교 제목'; a.preacher='시험교역자'; a.offering.sunday=50000;
          await A.saveReport(dd, a);
          const sid = dd.students.find(s=>s.status==='active').id; stale.att[sid]='P'; delete dd.reportBase['{D}'];
          await A.saveReport(dd, stale);
          const g = await A.backend.get('depts/elem/reports/{D}'); return {{title:g.title, preacher:g.preacher, sunday:(g.offering||{{}}).sunday, att:Object.keys(g.att||{{}}).length}};}}""")
        rec('R10 새 주일 서기·팸장 따로 저장해도 내용 보존', res['title'] == '서기가 입력한 설교 제목' and res['preacher'] == '시험교역자' and res['sunday'] == 50000 and res['att'] == 1, str(res))
        pg.close()
    try: t_R10()
    except Exception as e:
        rec('R10 (실행 오류)', False, str(e)[:160])
        try: pg.close()
        except Exception: pass

    def t_R11():
        # R11 휴대폰: 결석 사유를 쓰고 저장 단추 없이 홈으로 가도 사유가 남거나 경고가 떠야 함 (UX-04)
        pg = login(b, 'young', 390); go(pg, 'attend')
        pg.evaluate("()=>document.querySelectorAll('details').forEach(d=>d.open=true)"); pg.wait_for_timeout(300)
        inp = pg.query_selector('[data-abs]'); sid = inp.get_attribute('data-abs') if inp else None
        if inp:
            inp.fill('가상사유-R11'); pg.click('.mobile-nav [data-nav]:not(.on)'); pg.wait_for_timeout(1500)
            warned = pg.is_visible('#lv-stay')
            dt = pg.evaluate("()=>window.CBCS_APP.S.sub.date||''")
            stored = pg.evaluate(f"async()=>{{const dd=window.CBCS_APP.S.data.young; const ds=Object.keys(dd.reports).sort(); for (const d of ds.reverse()) {{ const g=await window.CBCS_APP.backend.get('depts/young/reports/'+d); if (g && g.absent && g.absent['{sid}']) return g.absent['{sid}']; }} return ''}}")
            rec('R11 결석 사유 저장 없이 이동해도 보존·경고', stored == '가상사유-R11' or warned, f'저장값={stored!r}, 경고={warned}')
        else:
            rec('R11 결석 사유 저장 없이 이동해도 보존·경고', False, '사유 칸 없음')
        pg.close()
    try: t_R11()
    except Exception as e:
        rec('R11 (실행 오류)', False, str(e)[:160])
        try: pg.close()
        except Exception: pass

    def t_R12():
        # R12 휴대폰: 아래쪽 회원 출석을 눌러도 화면 위치가 맨 위로 돌아가지 않아야 함 (UX-05)
        pg = login(b, 'young', 390); go(pg, 'attend')
        pg.evaluate("()=>document.querySelectorAll('details').forEach(d=>{d.open=true; d.dispatchEvent(new Event('toggle'))})"); pg.wait_for_timeout(300)
        btns = pg.query_selector_all('[data-att]'); last = btns[-1]
        last.scroll_into_view_if_needed(); pg.wait_for_timeout(300); y0 = pg.evaluate("()=>window.scrollY")
        last.click(); pg.wait_for_timeout(1500); y1 = pg.evaluate("()=>window.scrollY")
        rec('R12 출석 체크 뒤 화면 위치 유지', y0 > 300 and abs(y1 - y0) < 200, f'전={y0}, 후={y1}')
        pg.close()
    try: t_R12()
    except Exception as e:
        rec('R12 (실행 오류)', False, str(e)[:160])
        try: pg.close()
        except Exception: pass

    def t_R13():
        # R13 빈 주일 보고서는 "작성 완료" 전에 빠진 칸을 알려야 함 (UX-06)
        pg = login(b, 'elem'); go(pg, 'weekly', "{date:'2027-01-03'}")
        pg.click('#w-done'); pg.wait_for_timeout(800)
        asked = pg.is_visible('#wd-go'); st = pg.evaluate("()=>(window.CBCS_APP.S.data.elem.reports['2027-01-03']||{}).status")
        rec('R13 빈 보고서 완료 전 확인', asked and st != 'done', f'확인 창={asked}, 상태={st}')
        pg.close()
    try: t_R13()
    except Exception as e:
        rec('R13 (실행 오류)', False, str(e)[:160])
        try: pg.close()
        except Exception: pass

    def t_R14():
        # R14 새친구 등록: 성별을 고르게 하고, 학교를 학생 카드에도 저장 (UX-08)
        pg = login(b, 'elem'); go(pg, 'weekly', "{date:'2027-01-03'}")
        pg.fill('#nc-name', '가상새친구'); pg.fill('#nc-school', '가상초 3학년'); pg.click('#nc-add'); pg.wait_for_timeout(800)
        n0 = pg.evaluate("()=>window.CBCS_APP.S.data.elem.students.filter(s=>s.name==='가상새친구').length")
        pg.select_option('#nc-sex', '여'); pg.click('#nc-add'); pg.wait_for_timeout(1500)
        s1 = pg.evaluate("()=>{const s=window.CBCS_APP.S.data.elem.students.find(s=>s.name==='가상새친구')||{}; return {sex:s.sex, school:s.school}}")
        rec('R14 새친구 성별 선택·학교 저장', n0 == 0 and s1 == {'sex': '여', 'school': '가상초 3학년'}, f'성별 없이 등록={n0}, 저장={s1}')
        pg.close()
    try: t_R14()
    except Exception as e:
        rec('R14 (실행 오류)', False, str(e)[:160])
        try: pg.close()
        except Exception: pass


    # ── 업무 잇기 기능 (2026-10-14 사용자 승인) ──
    def t_R15():
        pg = login(b, 'elem')
        LS = '2026-10-11'  # 체험 모드의 '지난 주일'은 2026-10-11로 고정
        go(pg, 'weekly', f"{{date:'{LS}'}}")
        n = pg.evaluate("()=>document.querySelectorAll('[data-famdone]').length")
        pg.click('[data-famdone]'); pg.wait_for_timeout(1200)
        fd = pg.evaluate(f"async()=>Object.keys(((await window.CBCS_APP.backend.get('depts/elem/reports/{LS}'))||{{}}).famDone||{{}}).length")
        go(pg, 'home'); pg.wait_for_timeout(800); t = pg.inner_text('.main')
        ok = n > 0 and fd == 1 and ('출석 확인 1/' in t)
        rec('R15 반·팸별 출석 확인 완료와 홈 표시', ok, f'단추={n}, 저장={fd}, 홈 표시={"출석 확인 1/" in t}')
        pg.close()
    try: t_R15()
    except Exception as e: rec('R15 (실행 오류)', False, str(e)[:160])

    def t_R16():
        pg = login(b, 'elem')
        pg.evaluate("""async()=>{const A=window.CBCS_APP, dd=A.S.data.elem; const e={id:'ev_t16',date:'2026-10-25',end:'',title:'가상 가을소풍',note:''}; await A.backend.set('depts/elem/events/ev_t16', e); dd.events.push({_id:e.id,...e});}""")
        go(pg, 'monthly', "{month:'2026-09'}")
        pg.click('#m-ev'); pg.wait_for_timeout(500); pg.click('#mev-go'); pg.wait_for_timeout(500)
        v = pg.input_value('#m-plan')
        rec('R16 월간 계획에 연간 일정 불러오기', '10/25: 가상 가을소풍' in v, repr(v[-60:]))
        pg.close()
    try: t_R16()
    except Exception as e: rec('R16 (실행 오류)', False, str(e)[:160])

    def t_R17():
        pg = login(b, 'elem'); go(pg, 'monthly', "{month:'2026-09'}")
        pg.click('#m-snap'); pg.wait_for_timeout(600)
        if pg.query_selector('#ms-yes'): pg.click('#ms-yes')
        pg.wait_for_timeout(1200)
        saved = pg.evaluate("async()=>!!(await window.CBCS_APP.backend.get('depts/elem/monthlySnaps/2026-09'))")
        pg.evaluate("()=>{const A=window.CBCS_APP; const r=Object.values(A.S.data.elem.reports).find(x=>x.date.startsWith('2026-09')); r.offering.sunday=9876543; return A.render()}"); pg.wait_for_timeout(1200)
        fixed = '9,876,543' not in pg.inner_text('.main')
        pg.click('#m-live'); pg.wait_for_timeout(1000); live = '9,876,543' in pg.inner_text('.main')
        rec('R17 월간 제출본 고정', saved and fixed and live, f'저장={saved}, 제출본 그대로={fixed}, 지금 자료 반영={live}')
        pg.close()
    try: t_R17()
    except Exception as e: rec('R17 (실행 오류)', False, str(e)[:160])

    def t_R18():
        pg = login(b, 'elem'); Y = pg.evaluate("()=>window.CBCS_YEAR||2026")
        pg.evaluate(f"""async()=>{{const A=window.CBCS_APP, dd=A.S.data.elem; const p={{year:{Y},status:'confirmed',slogan:'가상표어',verse:'',verseRef:'',goals:['가상목표 하나'],methods:'가상 방법',ministry:'',worship:'',notes:'',budget:[{{category:'교육',item:'가상교재',amount:10000,note:''}}]}}; await A.backend.set('depts/elem/plans/{Y}', p); dd.plans=dd.plans||{{}}; dd.plans[{Y}]=p; delete dd.plans[{Y+1}];}}""")
        go(pg, 'plan', f"{{year:{Y + 1}}}")
        pg.click('#pl-copy'); pg.wait_for_timeout(800); pg.click('#pc-go'); pg.wait_for_timeout(1500)
        g = pg.evaluate(f"async()=>{{const p=await window.CBCS_APP.backend.get('depts/elem/plans/{Y + 1}')||{{}}; return {{goals:p.goals||[], budget:(p.budget||[]).map(x=>x.item), slogan:p.slogan||''}}}}")
        rec('R18 전년도 계획서에서 골라 가져오기', '가상목표 하나' in g['goals'] and '가상교재' in g['budget'] and g['slogan'] == '', str(g))
        pg.close()
    try: t_R18()
    except Exception as e: rec('R18 (실행 오류)', False, str(e)[:160])

    def t_R19():
        pg = login(b, 'elem')
        prev = pg.evaluate("()=>{const r=Object.values(window.CBCS_APP.S.data.elem.reports).filter(x=>x.date<'2027-01-10'&&x.preacher).sort((a,b)=>a.date<b.date?1:-1)[0]; return r?r.preacher:''}")
        go(pg, 'weekly', "{date:'2027-01-10'}")
        pg.click('#w-prev'); pg.wait_for_timeout(500); pg.click('#wp-go'); pg.wait_for_timeout(400)
        v = pg.input_value('#r-preacher'); off = pg.input_value('#o-sunday')
        rec('R19 지난주 보고서에서 고정 칸만 가져오기', bool(prev) and v == prev and off == '', f'지난 설교자={prev!r}, 채운 값={v!r}, 헌금칸={off!r}')
        pg.close()
    try: t_R19()
    except Exception as e: rec('R19 (실행 오류)', False, str(e)[:160])

    def t_R20():
        pg = login(b, 'elem'); go(pg, 'outings')
        pg.evaluate("""async()=>{const A=window.CBCS_APP; const o={id:'ot_t20',dept:'elem',title:'가상 야외모임',place:'가상 공원',start:'2026-11-07T10:00',end:'2026-11-07T15:00',status:'완료',manager:'가상담당',budget:[],result:{attend:'26명',content:'목장별 나눔',eval:'',spend:[{item:'식비',desc:'점심',amount:'260000'}]}};
          await A.backend.set('depts/elem/outings/ot_t20', o); A.S.outings.elem.push(o); A.S.sub={outEdit:'ot_t20'}; return A.render();}""")
        pg.wait_for_timeout(1200)
        pg.click('#ot-to-rep'); pg.wait_for_timeout(1500); pg.click('#ot-to-rep'); pg.wait_for_timeout(1500)
        act = pg.evaluate("async()=>((await window.CBCS_APP.backend.get('depts/elem/reports/2026-11-08'))||{}).activity||''")
        pg.click('#ot-to-exp'); pg.wait_for_timeout(800); pg.click('#oe-go'); pg.wait_for_timeout(1200)
        pg.click('#ot-to-exp'); pg.wait_for_timeout(800); again = pg.query_selector('#oe-go') is not None
        if pg.query_selector('#modal-close'): pg.click('#modal-close')
        ex = pg.evaluate("async()=>(await window.CBCS_APP.backend.list('depts/elem/expenses')).filter(e=>e.outingId==='ot_t20').map(e=>e.amount)")
        rec('R20 주말학습 결과 → 보고서 활동·지출 초안 (중복 없음)', act.count('가상 야외모임') == 1 and ex == [260000] and not again, f'활동 줄 수={act.count("가상 야외모임")}, 지출={ex}, 두 번째 넣기 가능={again}')
        pg.close()
    try: t_R20()
    except Exception as e: rec('R20 (실행 오류)', False, str(e)[:160])

    def t_R21():
        pg = login(b, 'young'); go(pg, 'assembly'); pg.wait_for_timeout(800)
        scr = pg.inner_text('.main')
        pg.evaluate("()=>{const A=window.CBCS_APP;A.S.sub.print=true;return A.render()}"); pg.wait_for_timeout(1500)
        t = pg.inner_text('.paper'); h = t[t.find('결의권자 ('):t.find('결의권자 (') + 60]
        ok = '교역자' in h and '\t교역자\t' in t and '(선거권자)' not in scr and '교역자 1' in scr
        rec('R21 총회 결의권자에 교역자 표기', ok, h.replace('\n', ' '))
        pg.close()
    try: t_R21()
    except Exception as e: rec('R21 (실행 오류)', False, str(e)[:160])

    def t_R22():
        pg = login(b, 'young'); go(pg, 'bylaws')
        f1 = tempfile.NamedTemporaryFile('w', suffix='.txt', delete=False, prefix='가상회칙2020_')
        f1.write('가상 회칙\n제1조 : 가상.\n< 전문 > 1 차 수정일 : 2013년 11월 23일 2 차 수정일 : 2014년 11월 **일 3 차 수정일 : 2015년 11월 21일\n'); f1.close()
        pg.click('#bl-upload'); pg.set_input_files('#bu-file', f1.name); pg.wait_for_timeout(1500)
        g1 = pg.evaluate("()=>[document.querySelector('#bu-rev').value, document.querySelector('#bu-date').value]")
        pg.click('#modal-close'); pg.wait_for_timeout(300)
        f2 = tempfile.NamedTemporaryFile('w', suffix='.txt', delete=False, prefix='가상 회칙 파일이름_')
        f2.write('가상 회칙\n제1조 : 가상 둘.\n'); f2.close()
        pg.click('#bl-upload'); pg.set_input_files('#bu-file', f2.name); pg.wait_for_timeout(1500)
        g2 = pg.evaluate("()=>document.querySelector('#bu-rev').value")
        pg.click('#bu-save'); pg.wait_for_timeout(800); blocked = pg.is_visible('#bu-save')
        pg.fill('#bu-rev', '5'); pg.click('#bu-save'); pg.wait_for_timeout(1500)
        names = pg.evaluate("()=>[...document.querySelectorAll('.vlist .item .t')].map(x=>x.textContent)")
        ok = g1 == ['3차 수정', '2015-11-21'] and g2 == '' and blocked and '5차 수정' in names and not any('파일이름' in n for n in names)
        rec('R22 판 이름은 파일 이름이 아니라 N차 수정', ok, f'한 줄 기록={g1}, 기록 없음={g2!r}, 차수 없이 저장 막힘={blocked}, 목록={names}')
        pg.close()
    try: t_R22()
    except Exception as e: rec('R22 (실행 오류)', False, str(e)[:160])

    def t_R23():
        pg = login(b, 'young'); go(pg, 'roster')
        sid = pg.evaluate("()=>document.querySelectorAll('td[data-ie=status]')[1].closest('tr').dataset.student")
        pg.locator('td[data-ie="status"]').nth(1).click(); pg.wait_for_timeout(400)
        pg.check('input[name=ie-st][value=left]'); pg.fill('#ie-ld', '2026-10-01'); pg.select_option('#ie-lk', '이사'); pg.click('#ie-save'); pg.wait_for_timeout(1200)
        a = pg.evaluate(f"async()=>{{const s=await window.CBCS_APP.backend.get('depts/young/students/{sid}'); return [s.status, s.leftDate, s.leftKind]}}")
        rec('R23 출석부 상태 칸 눌러 바로 바꾸기', a == ['left', '2026-10-01', '이사'], str(a))
        pg.close()
    try: t_R23()
    except Exception as e: rec('R23 (실행 오류)', False, str(e)[:160])

    def t_R24():
        pg = login(b, 'young')
        pg.evaluate("""()=>{const A=window.CBCS_APP; const st=A.S.data.young.students.filter(s=>s.status==='active'); st[0].status='military'; st[1].status='study'; st[2].status='longabsent'; A.S.view='roster'; A.S.sub={show:'paused'}; return A.render()}""")
        pg.wait_for_timeout(1200)
        tabs = pg.evaluate("()=>[...document.querySelectorAll('.ro-tabs button')].map(b=>b.textContent.trim())")
        rows = pg.evaluate("()=>document.querySelectorAll('table.roster tbody tr[data-student]').length")
        ok = any(t.startswith('정지') and t.endswith('2') for t in tabs) and any(t.startswith('장기결석') and t.endswith('1') for t in tabs) and rows == 2
        rec('R24 출석부 정지 칸(군입대·학업·사업)', ok, f'탭={tabs}, 정지 줄={rows}')
        pg.close()
    try: t_R24()
    except Exception as e: rec('R24 (실행 오류)', False, str(e)[:160])

    # ── 2026-10-27 연간계획서 양식(1~6부) ──
    def t_R25():
        # R25 예산안: 금액 칸에서 Enter로 추가되고, 추가 뒤 화면이 맨 위로 튀지 않아야 함
        pg = login(b, 'elem'); Y = pg.evaluate("()=>window.CBCS_YEAR||2026") + 1
        go(pg, 'plan', f"{{year:{Y}}}")
        pg.evaluate("()=>document.querySelector('#b-item').scrollIntoView()"); pg.wait_for_timeout(300)
        y0 = pg.evaluate("()=>window.scrollY")
        pg.fill('#b-item', '시험 교재'); pg.fill('#b-amt', '120000'); pg.press('#b-amt', 'Enter'); pg.wait_for_timeout(1500)
        y1 = pg.evaluate("()=>window.scrollY"); n = pg.evaluate("()=>document.querySelectorAll('[data-del-b]').length")
        rec('R25 예산 Enter 추가 · 화면 위치 유지', n == 1 and y0 > 0 and abs(y1 - y0) < 40, f'줄={n}, 스크롤 {y0}→{y1}')
        pg.close()
    try: t_R25()
    except Exception as e: rec('R25 (실행 오류)', False, str(e)[:160])

    def t_R26():
        # R26 교육위원회 배정 총액을 넘는 예산 항목은 넣지 않고, 교회력 자동 채우기는 부서 계획서 1부에 보여야 함
        pg = login(b, 'committee'); Y = pg.evaluate("()=>window.CBCS_YEAR||2026") + 1
        go(pg, 'plan', f"{{dept:'elem',year:{Y}}}")
        pg.click('#fx-auto'); pg.wait_for_timeout(1200); pg.fill('[data-alloc=elem]', '500000'); pg.click('#cp-save'); pg.wait_for_timeout(1200)
        fx = pg.evaluate("()=>document.querySelectorAll('[data-del-fx]').length")
        pg.evaluate("()=>window.CBCS_APP.backend.logout()"); pg.wait_for_timeout(500)
        pg.goto(BASE + '/?demo=1'); pg.wait_for_timeout(1000); pg.select_option('#lg-dept', 'elem'); pg.fill('#lg-pw', 'x'); pg.click('#lg-go'); pg.wait_for_timeout(2500)
        go(pg, 'plan', f"{{year:{Y}}}")
        seen = pg.evaluate("()=>[...document.querySelectorAll('.card')].find(c=>c.querySelector('h2').textContent.startsWith('1부')).querySelectorAll('tbody tr').length")
        pg.fill('#b-item', '한도 안'); pg.fill('#b-amt', '300000'); pg.click('#b-add'); pg.wait_for_timeout(1200)
        pg.fill('#b-item', '한도 밖'); pg.fill('#b-amt', '300000'); pg.click('#b-add'); pg.wait_for_timeout(1200)
        n = pg.evaluate("()=>document.querySelectorAll('[data-del-b]').length")
        rec('R26 고정 일정 공유 · 배정 총액 초과 막기', fx >= 17 and seen == fx and n == 1, f'고정 일정={fx}, 부서에 보임={seen}, 예산 줄={n}')
        pg.close()
    try: t_R26()
    except Exception as e: rec('R26 (실행 오류)', False, str(e)[:160])

    def t_R27():
        # R27 예산 줄을 누르면 편집 창이 열리고, 고친 값이 저장되어야 함
        pg = login(b, 'elem'); Y = pg.evaluate("()=>window.CBCS_YEAR||2026") + 1
        go(pg, 'plan', f"{{year:{Y}}}")
        pg.fill('#b-cat', '공통'); pg.fill('#b-item', '동계수련회'); pg.fill('#b-amt', '700000'); pg.press('#b-amt', 'Enter'); pg.wait_for_timeout(1200)
        pg.click('[data-edit-b="0"] td'); pg.wait_for_timeout(500); opened = bool(pg.query_selector('.ie-pop'))
        pg.fill('#be-cat', '행사비'); pg.fill('#be-amt', '650000'); pg.press('#be-amt', 'Enter'); pg.wait_for_timeout(1500)
        v = pg.evaluate(f"async()=>{{const p=await window.CBCS_APP.backend.get('depts/elem/plans/{Y}'); const b=(p.budget||[])[0]||{{}}; return [b.category,b.amount]}}")
        rec('R27 예산 줄 눌러서 고치기', opened and v == ['행사비', 650000], f'창 열림={opened}, 저장={v}')
        pg.close()
    try: t_R27()
    except Exception as e: rec('R27 (실행 오류)', False, str(e)[:160])

print(json.dumps(results, ensure_ascii=False, indent=1))
sys.exit(0 if all(r['pass'] for r in results) else 1)
