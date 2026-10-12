#!/usr/bin/env python3
"""체험(튜토리얼)용 가상 자료 만들기 → cbcs-repo/demo-data.js
모든 이름·연락처·숫자는 임의로 만든 가상 자료입니다. 실제 교인 자료를 쓰지 않습니다."""
import json, random, datetime as dt

R = random.Random(20261012)
YEAR = 2026
TODAY = dt.date(2026, 10, 12)
SUR = list('김이박최정강조윤장임한오서신권황안송류홍전고문양손배백허유남심노하곽성차주우구민진나지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용예봉경')
G1 = list('가나다라마바사아자차하서지수민예은하도윤시우주준현태성재승유채소다연건온율린')
G2 = list('나린윤우준아은원진호희영현서람별솔빈결담율온찬슬비규혁경')
used = set()
def name():
    while True:
        n = R.choice(SUR[:20] if R.random() < .7 else SUR) + R.choice(G1) + R.choice(G2)
        if n[1] != n[2] and n not in used:
            used.add(n); return n
def phone(): return f"010-0000-{R.randint(1000, 9999)}"
def bday(y): return f"{y}-{R.randint(1, 12):02d}-{R.randint(1, 28):02d}"
SRC = ['체험용 가상 자료']
sundays = []
d = dt.date(2026, 1, 4)
while d <= dt.date(2026, 10, 11):
    sundays.append(d); d += dt.timedelta(days=7)

VERSES = [('요한복음 3:16', '하나님이 세상을 이처럼 사랑하사'), ('시편 23:1', '여호와는 나의 목자시니'), ('마태복음 5:14', '너희는 세상의 빛이라'),
          ('빌립보서 4:13', '내게 능력 주시는 자 안에서'), ('잠언 3:5', '너는 마음을 다하여 여호와를 신뢰하고'), ('마가복음 10:45', '섬기러 왔다'),
          ('누가복음 15:4', '잃은 양 한 마리'), ('창세기 1:1', '태초에 하나님이'), ('요한복음 15:5', '나는 포도나무요'), ('로마서 12:2', '마음을 새롭게 함으로')]
ACT = ['예배 후 반 모임', '공과 공부와 간식', '찬양 연습', '생일 축하', '성경 암송 발표', '반별 나눔과 기도']

DEPTS = {
    'kinder': dict(name='영유치부', label='반', order=1, classes=['사랑반', '기쁨반', '평화반'], n=15, birth=(2020, 2023), budget=4000000,
                   slogan='예수님을 닮아 가는 어린이', verse='네 부모를 공경하라', ref='출애굽기 20:12'),
    'elem': dict(name='초등부', label='학년', order=2, classes=['1학년', '2학년', '3학년', '4학년', '5학년', '6학년'], n=26, birth=(2014, 2019), budget=6000000,
                 slogan='말씀으로 자라는 어린이', verse='주의 말씀은 내 발에 등이요 내 길에 빛이니이다', ref='시편 119:105'),
    'youth': dict(name='중고등부', label='반', order=3, classes=['중1반', '중2반', '중3반', '고1반', '고2·3반'], n=20, birth=(2008, 2013), budget=7000000,
                  slogan='빛으로 사는 다음 세대', verse='너희는 세상의 빛이라', ref='마태복음 5:14'),
    'young': dict(name='청년부', label='팸', order=4, classes=[], n=34, birth=(1990, 2007), budget=8000000,
                  slogan='함께 세워 가는 공동체', verse='서로 짐을 지라 그리하여 그리스도의 법을 성취하라', ref='갈라디아서 6:2'),
}

def school(dk, by):
    if dk == 'elem': return R.choice(['새봄초', '푸른숲초', '한빛초'])
    if dk == 'youth': return R.choice(['새봄중', '한빛중', '푸른숲고', '한빛고'])
    return ''

payload = {'version': 1, 'generated': '체험용 가상 자료 ' + TODAY.isoformat(), 'demo': True, 'depts': {}, 'committee': {}, 'scholarship': [], 'archiveIndex': []}

for dk, cfg in DEPTS.items():
    staff = []; classes = []
    pastor = name()
    staff.append(dict(id=f'{dk}_{pastor}', name=pastor, role='교역자', classId='', phone=phone(), birth='', faith='', status='active', since=2026, moveNote='', note=f'{pastor} 전도사', flags=[]))
    chief = name(); staff.append(dict(id=f'{dk}_{chief}', name=chief, role='부장', classId='', phone=phone(), birth='', faith='', status='active', since=2026, moveNote='', note='', flags=[]))
    sec = name(); staff.append(dict(id=f'{dk}_{sec}', name=sec, role='총무', classId='', phone=phone(), birth='', faith='', status='active', since=2026, moveNote='', note='', flags=[]))
    acc = name(); staff.append(dict(id=f'{dk}_{acc}', name=acc, role='회계', classId='', phone=phone(), birth='', faith='', status='active', since=2026, moveNote='', note='', flags=[]))
    if dk == 'young':
        cls_names = []
        for i in range(5):
            leader = name(); cls_names.append(f'{leader} 팸')
            staff.append(dict(id=f'{dk}_{leader}', name=leader, role='팸장', classId=f'{leader} 팸', phone=phone(), birth=bday(R.randint(1990, 2000)), faith='세례', status='active', since=2026, moveNote='', note='', flags=[]))
            classes.append(dict(id=f'{leader} 팸', name=f'{leader} 팸', teacher=leader, assistant='', order=i + 1, flags=[]))
    else:
        for i, c in enumerate(cfg['classes']):
            t = name(); staff.append(dict(id=f'{dk}_{t}', name=t, role='담임', classId=c, phone=phone(), birth='', faith='', status='active', since=2026, moveNote='', note='', flags=[]))
            classes.append(dict(id=c, name=c, teacher=t, assistant='', order=i + 1, flags=[]))
    teachers = [s['name'] for s in staff if s['role'] != '교역자']
    # 학생
    students = []
    for i in range(cfg['n']):
        by = R.randint(*cfg['birth']); nm = name(); sex = R.choice('남여')
        if dk == 'elem': cid = f'{min(6, max(1, YEAR - by - 6))}학년'
        elif dk == 'youth':
            g = YEAR - by - 12; cid = ['중1반', '중2반', '중3반', '고1반', '고2·3반'][min(4, max(0, g))]
        else: cid = R.choice([c['id'] for c in classes])
        st = dict(id=f'{dk}_{nm}_{by}', name=nm, sex=sex, birth=bday(by), dept=dk, classId=cid, status='active', faith='', faithYear='', faithHalf='',
                  phone=phone() if dk in ('youth', 'young') else '', school=school(dk, by), father=name() if R.random() < .5 else '', mother=name() + ' 집사' if R.random() < .6 else '',
                  siblings=[], address='가상시 새봄구 ' + R.choice(['한빛로', '푸른숲길', '새봄로']) + f' {R.randint(1, 99)}', evangelist='', guardianPhone=phone() if dk != 'young' else '',
                  guardianRel=R.choice(['모', '부']) if dk != 'young' else '', scholarship=[], note='', history=[], flags=[], source=SRC, _p=R.choice([.95, .9, .85, .8, .7, .6, .45]))
        if dk == 'young':
            st['faith'] = R.choice(['세례', '세례', '입교', '학습', '']); st['faithYear'] = R.randint(2008, 2024) if st['faith'] else ''
            if R.random() < .5:
                st['history'] = [dict(year=y, dept='youth', origDept='고등부', classId='', note='') for y in range(by + 16, min(by + 19, 2026))]
            else:
                st['joinDate'] = f'{R.randint(2017, 2025)}-{R.randint(1, 12):02d}-01'
            st['married'] = R.random() < .05
        elif dk == 'youth':
            st['faith'] = R.choice(['유아세례', '입교', '학습', '']); st['faithYear'] = R.randint(2008, 2025) if st['faith'] else ''
        elif dk == 'elem' and R.random() < .3:
            st['faith'] = '유아세례'; st['faithYear'] = by + 1; st['faithHalf'] = R.choice(['상', '하'])
        students.append(st)
    # 장기 결석 2명 + 제적 2명
    for s in students[-2:]: s['_p'] = 0.0
    for k in range(2):
        nm = name(); by = R.randint(*cfg['birth'])
        students.append(dict(id=f'{dk}_{nm}_{by}', name=nm, sex=R.choice('남여'), birth=bday(by), dept=dk, classId=classes[0]['id'], status='left', faith='', faithYear='', faithHalf='', phone='', school='', father='', mother='', siblings=[], address='', evangelist='', guardianPhone='', guardianRel='', scholarship=[], note='', history=[], flags=[], source=SRC,
                             leftDate='2026-01-04', leftKind=R.choice(['이사', '타 교회']), leftReason='가정 사정으로 이사(가상)', statusLog=[], _p=0))
    # 형제
    a, b = students[0], students[1]; a['siblings'] = [b['name']]; b['siblings'] = [a['name']]
    # 보고서
    reports = []
    for i, day in enumerate(sundays):
        if dk == 'elem' and day == dt.date(2026, 10, 11): continue  # 튜토리얼에서 직접 써 보는 이번 주 보고서
        ds = day.isoformat(); att = {}; absent = {}
        for s in students:
            if s['status'] != 'active': continue
            if R.random() < s['_p']: att[s['id']] = 'O' if (dk == 'young' and R.random() < .06) else 'P'
            elif R.random() < .5: absent[s['id']] = R.choice(['가족 여행', '아파서 쉼', '시험 기간', '집안 행사', '늦잠(보호자 확인)'])
        ref, ttl = R.choice(VERSES)
        tp = [t for t in teachers if R.random() < .85]
        newc = []
        if R.random() < .08:
            newc = [dict(name=name(), sex=R.choice('남여'), birth='', phone='', classId=classes[0]['id'], note='친구 초대(가상)')]
        reports.append(dict(dept=dk, date=ds, weekLabel=f'{day.month}월 {(day.day - 1) // 7 + 1}주', type=f"{cfg['name']} 주일예배", united=(day.month in (5,) and day.day <= 7),
                            presider=chief, prayer=R.choice(teachers), text=ref, title=ttl, preacher=f'{pastor} 전도사', notice=sec, counts={}, att=att, absent=absent, attUnmatched={},
                            newcomers=newc, offering=dict(sunday=R.randint(10, 60) * 1000, tithe=R.choice([0, 0, 10000, 30000]), thanks=R.choice([0, 0, 5000]), other=0),
                            teachersPresent=tp, teachersAbsent={t: '개인 사정' for t in teachers if t not in tp}, activity=R.choice(ACT), meeting='설교 내용을 나누고 함께 기도함',
                            special='', schedule=[], classRows=[], writer=sec, flags=[], source='체험용 가상 자료', status='done', imported=False))
    for s in students: s.pop('_p', None)
    # 회계
    ledgers = [dict(id=f'{dk}_main', name=f"{cfg['name']} 예산", budget=cfg['budget'], carry=0, kind='budget', note='가상 예산', flags=[])]
    expenses = []; incomes = []
    items = [('간식', '주일 간식 구입', 30000, 90000), ('교재', '공과 교재 구입', 80000, 200000), ('행사', '생일 축하 케이크', 30000, 60000), ('선물', '새친구 환영 선물', 20000, 80000), ('행사', '반 모임 식사', 60000, 150000)]
    for m in range(1, 10):
        for _ in range(R.randint(3, 5)):
            cat, desc, lo, hi = R.choice(items)
            expenses.append(dict(id=f'e_{dk}_{m}_{len(expenses)}', dept=dk, ledgerId=f'{dk}_main', date=f'2026-{m:02d}-{R.randint(1, 28):02d}', category=cat, desc=desc, amount=R.randint(lo // 1000, hi // 1000) * 1000,
                                 requester=sec, approver=chief, receipt=True, settled='완료', note='', flags=[], source='체험용 가상 자료'))
    expenses.append(dict(id=f'e_{dk}_spk', dept=dk, ledgerId=f'{dk}_main', date='2026-03-15', category='기자재', desc='블루투스 스피커', amount=189000, requester=sec, approver=chief, receipt=True, settled='완료', note='', flags=[], source='체험용 가상 자료',
                         items=[dict(desc='블루투스 스피커', qty=1, price=189000, amount=189000, asset=True)]))
    if dk == 'young':
        ledgers.append(dict(id='young_donation', name='찬조금', budget=0, carry=500000, kind='balance', note='가상 찬조금 장부', flags=[]))
        for m in (2, 5, 8): incomes.append(dict(id=f'i_young_{m}', dept=dk, ledgerId='young_donation', date=f'2026-{m:02d}-10', category='찬조', desc='수련회 찬조(가상)', amount=300000, requester='', approver='', receipt='', settled='완료', note='', flags=[], source='체험용 가상 자료'))
    budgetPlan = [dict(category='예배', item='예배 준비·소모품', amount=cfg['budget'] // 10, note=''), dict(category='양육', item='교재·공과', amount=cfg['budget'] // 5, note=''),
                  dict(category='교제', item='간식·생일 축하', amount=cfg['budget'] // 4, note=''), dict(category='행사', item='수련회·성경학교', amount=cfg['budget'] - cfg['budget'] // 10 - cfg['budget'] // 5 - cfg['budget'] // 4, note='')]
    events = [dict(id=f'ev_{dk}_{i}', date=d_, end=e_, title=t_, note='') for i, (d_, e_, t_) in enumerate([
        ('2026-01-04', '', '신입생 환영'), ('2026-04-05', '', '부활주일 달걀 나눔'), ('2026-05-03', '', '어린이주일 세대통합예배' if dk in ('kinder', 'elem') else '세대통합예배'),
        ('2026-07-24', '2026-07-26', '여름 성경학교' if dk in ('kinder', 'elem') else '여름 수련회'), ('2026-10-18', '', '친구 초청 주일'), ('2026-10-25', '', '가을 야외 예배'),
        ('2026-11-15', '', '추수감사 예배'), ('2026-12-20', '', '성탄 발표회')])]
    notices = [dict(id=f'nt_{dk}_1', date='2026-10-04', title='친구 초청 주일 준비', body='10월 18일 친구 초청 주일에 초대할 친구 이름을 반별로 적어 주세요.'),
               dict(id=f'nt_{dk}_2', date='2026-09-27', title='가을 야외 예배 안내', body='10월 25일 예배 후 근처 공원으로 이동합니다. 간식은 부서에서 준비합니다.')]
    plan = dict(year=2026, status='confirmed', confirmedAt='2025-11-30', slogan=cfg['slogan'], verse=cfg['verse'], verseRef=cfg['ref'],
                goals=['매주 말씀을 기억하고 삶에서 실천한다.', '서로 이름을 부르며 기도하는 공동체가 된다.', '친구를 초대해 함께 예배한다.'],
                methods='① 예배: 매주 설교와 공동기도\n② 양육: 반별 공과와 성경 암송\n③ 교제: 생일 축하와 반 모임', ministry='', worship='', notes='체험용 가상 계획서', budget=budgetPlan)
    doc = dict(name=cfg['name'], classLabel=cfg['label'], order=cfg['order'], year=2026, classes=classes, staff=staff, ledgers=ledgers, budgetPlan=budgetPlan, monthlyTexts={}, monthlyPlans={}, notes={'demo': '체험용 가상 자료'})
    payload['depts'][dk] = dict(doc=doc, students=students, reports=reports, expenses=expenses, incomes=incomes, events=events, notices=notices, plans=[plan])

# 교육위원회
cstaff = []
for role in ['교육위원장', '교육디렉터', '서기', '회계']:
    nm = name(); cstaff.append(dict(id=f'committee_{nm}', name=nm, dept='committee', role=role, classId='', phone=phone(), birth='', faith='', status='active', since=2026, moveNote='', note='', flags=[]))
cev = [dict(id=f'cev_{m}', date=[s for s in sundays + [dt.date(2026, 11, 1), dt.date(2026, 12, 6)] if s.month == m][0].isoformat(), end='', title='교육위원회 월례회', note='매월 첫 주일 오후') for m in range(1, 13) if any(s.month == m for s in sundays + [dt.date(2026, 11, 1), dt.date(2026, 12, 6)])]
cev.append(dict(id='cev_teacher', date='2026-11-21', end='', title='전체 교사 연수', note='교육관'))
payload['committee'] = dict(staff=cstaff, events=cev, notices=[dict(id='cn_1', date='2026-10-05', title='2027년 연간계획안 제출 안내', body='각 부서는 11월 말까지 2027년 연간계획안을 앱에서 작성해 주세요.'),
                                                               dict(id='cn_2', date='2026-09-20', title='교사 연수 일정', body='11월 21일(토) 오전 10시, 교육관.')])
for i in range(6):
    nm = name(); dk = R.choice(['youth', 'young'])
    payload['scholarship'].append(dict(id=f'sc_demo_{i}', year=2026, name=nm, nameRaw=nm, dept=dk, origDept=DEPTS[dk]['name'], sex=R.choice('남여'), birth=bday(R.randint(2004, 2009)), school=R.choice(['한빛고', '새봄대학교', '푸른숲고']), grade='',
                                       certNo=f'2026-{i + 1}호', relation='', reason='성실한 신앙생활(가상)', amount=R.choice([300000, 500000]), account='000-00-000000(가상)', bank='가상은행', holder=nm, status=R.choice(['확정', '후보']), ceremony='', note='', flags=[], source=SRC))
payload['archiveIndex'] = [dict(id=f'ar_{dk}_{m}', year=2025, dept=dk, origDept=DEPTS[dk]['name'], kind='주일보고서', month=f'2025-{m:02d}', title=f"2025년 {m}월 {DEPTS[dk]['name']} 주일 보고서 묶음(가상)", path=f'교육부/2025/{DEPTS[dk]["name"]}/{m}월', rel='', note='')
                           for dk in DEPTS for m in (11, 12)]

out = '// 체험(튜토리얼)용 가상 자료 — 모든 이름·연락처·숫자는 임의로 만든 것입니다. tools/make_demo.py로 생성\nexport default ' + json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + ';\n'
open(__import__('os').path.join(__import__('os').path.dirname(__file__), '..', 'demo-data.js'), 'w', encoding='utf-8').write(out)
print('written', len(out), 'bytes;', {k: (len(v['students']), len(v['reports']), len(v['expenses'])) for k, v in payload['depts'].items()})
