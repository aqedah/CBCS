# 교육부 전체 명부 엑셀(부서·이름·성별·생년월일·신급·신급연도·연락처·학교·부·모·형제자매·주소·전도자·장결자·비고·장학) → data/roster.json
# 사용: python3 -I tools/roster_xlsx.py <명부.xlsx> [기준연도] > data/roster.json
# 앱의 "데이터 가져오기" 화면 → "명부(신급·가족·연락처) 가져오기"로 넣는다. 이름+생일로 기존 학생과 합친다.
import sys, re, json, datetime
import openpyxl
SRC = sys.argv[1]; YEAR = int(sys.argv[2]) if len(sys.argv) > 2 else datetime.date.today().year
DEPT = { '영유치부': 'kinder', '유치부': 'kinder', '초등부': 'elem', '중고등부': 'youth', '청년부': 'young' }
ws = openpyxl.load_workbook(SRC, data_only=True).active
rows = list(ws.iter_rows(values_only=True))
hdr = [str(h or '').strip() for h in rows[0]]
def col(name): return hdr.index(name) if name in hdr else None
C = { k: col(k) for k in ['부서', '이름', '성별', '생년월일', '신급', '신급연도', 'C.P.', '학교', '부', '모', '주소', '전도자', '장결자', '비고'] }
sib_cols = [i for i, h in enumerate(hdr) if h == '형제자매']
sch0 = col('장학')
review = []; out = []
def s(v): return '' if v is None else str(v).strip()
def birth_of(v, name):
    if v is None: return '', ''
    if isinstance(v, datetime.datetime): return v.strftime('%Y-%m-%d'), ''
    t = s(v)
    if re.fullmatch(r'\d{4}', t): return '', f'생년만 알려짐: {t}'
    m = re.match(r'^(\d{2,4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})\.?$', t)
    if not m: review.append(f'{name}: 생년월일 "{t}" 읽지 못함'); return '', f'생년월일 기록: {t}'
    y, mo, d = m.groups(); y = int(y)
    if y < 100: y += 2000 if y < 30 else 1900
    return f'{y}-{int(mo):02d}-{int(d):02d}', ''
def faith_year(v):
    t = s(v)
    m = re.match(r'^(\d{4})\s*(상|하)?$', t)
    if m: return int(m.group(1)), m.group(2) or ''
    if t and t != '?': review.append(f'신급연도 "{t}" 읽지 못함')
    return '', ''
last_dept = ''
for r in rows[1:]:
    r = list(r) + [None] * 40
    name = s(r[C['이름']]) if C['이름'] is not None else ''
    if not name: continue
    dept_raw = s(r[C['부서']]) if C['부서'] is not None else ''
    # 부서 칸이 비어 있고 생년월일 뒤에 "2024제적"처럼 적힌 줄: 바로 위 부서의 제적자
    dept = DEPT.get(dept_raw, '')
    cells = [s(x) for x in r if s(x)]
    left = next((m for m in (re.match(r'^(\d{4})\s*제적$', c) for c in cells) if m), None)
    if not dept:
        if left or dept_raw == '': dept = last_dept or 'young'
        if not dept: review.append(f'{name}: 부서 "{dept_raw}" 모름'); continue
    else: last_dept = dept
    birth, bflag = birth_of(r[C['생년월일']], name)
    fy, fh = faith_year(r[C['신급연도']]) if C['신급연도'] is not None else ('', '')
    sibs = [s(r[i]) for i in sib_cols if s(r[i])]
    sch = []
    if sch0 is not None:
        for v in r[sch0:sch0 + 12]:
            if isinstance(v, (int, float)) and 1990 < int(v) < 2100: sch.append(int(v))
            elif isinstance(v, str) and re.fullmatch(r'\d{4}', v.strip()): sch.append(int(v))
    note = s(r[C['비고']]) if C['비고'] is not None else ''
    ev = s(r[C['전도자']]) if C['전도자'] is not None else ''
    ev = re.sub(r'^전도자\s*[:：]\s*', '', ev)
    join = ''
    m = re.search(r'(\d{2,4})년\s*등록', note)
    if m: y = int(m.group(1)); join = f'{y + 2000 if y < 100 else y}-01-01'
    cp = s(r[C['C.P.']]) if C['C.P.'] is not None else ''
    phone, gphone = '', ''
    if cp:
        if re.search(r'[(（]\s*(모|부)\s*[)）]', cp): gphone = re.sub(r'\s*[(（].*?[)）]', '', cp)
        else: phone = cp
    out.append({ 'dept': dept, 'name': name, 'sex': s(r[C['성별']]), 'birth': birth, 'faithRaw': s(r[C['신급']]), 'faithYear': fy, 'faithHalf': fh,
                 'phone': phone, 'guardianPhone': gphone, 'guardianRel': ('모' if '모' in cp else '부') if gphone else '',
                 'school': s(r[C['학교']]) if C['학교'] is not None else '', 'father': s(r[C['부']]), 'mother': s(r[C['모']]), 'siblings': sibs,
                 'address': s(r[C['주소']]) if C['주소'] is not None else '', 'evangelist': ev,
                 'longabsent': bool(s(r[C['장결자']])) if C['장결자'] is not None else False,
                 'note': note, 'joinDate': join, 'scholarship': sorted(set(sch)),
                 'left': int(left.group(1)) if left else 0, 'flags': [f for f in [bflag] if f] })
import collections
review.insert(0, '부서별 인원: ' + ', '.join(f'{k} {v}' for k, v in collections.Counter(x['dept'] for x in out).items()))
json.dump({ 'generated': datetime.datetime.now().isoformat(timespec='seconds'), 'year': YEAR, 'source': 'roster.xlsx', 'rows': out, '_review': review }, sys.stdout, ensure_ascii=False, indent=1)
print(f'rows {len(out)}', file=sys.stderr)
