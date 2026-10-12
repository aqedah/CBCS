# 역대 청년부 회칙(HWP·PDF → 텍스트) → data/young_bylaws.json
# 사용: (먼저 tools/hwp.py로 HWP를, pdftotext -layout로 PDF를 txt로 바꿔 한 폴더에 둔 뒤)
#       python3 -I tools/young_bylaws.py <txt 폴더> > data/young_bylaws.json
# 앱의 회칙 화면 "역대 회칙 가져오기"로 넣는다. 같은 id는 본문이 비어 있을 때만 채운다.
import sys, os, re, json, datetime
SRC = sys.argv[1]
def clean(t):
    out = []
    for ln in t.splitlines():
        ln = re.sub(r'[ \t　]+', ' ', ln).strip()
        out.append(ln)
    s = '\n'.join(out)
    s = re.sub(r'\n{3,}', '\n\n', s).strip()
    return s
HEAD = re.compile(r'^(제\s*\d+\s*[장조]|\d+\s*항|[가-힣]\.|\d+\.|\*|\d+\s*차)')
END = re.compile(r'[.。)）:：]$')
def unwrap(s):
    # PDF 텍스트는 줄이 중간에서 잘리고 빈 줄이 끼어 있음 → 문장이 끝나지 않은 줄은 다음 줄과 붙인다
    lines = [l for l in s.split('\n')]; out = []
    for l in lines:
        if not l: 
            if out and out[-1] and not END.search(out[-1]): continue
            out.append(l); continue
        if out and out[-1] and not END.search(out[-1]) and not HEAD.match(l) and not re.match(r'^제\s*\d+\s*장', out[-1]): out[-1] += ' ' + l
        else: out.append(l)
    return re.sub(r'\n{3,}', '\n\n', '\n'.join(out)).strip()
def read(name, pdf=False):
    t = clean(open(os.path.join(SRC, name), encoding='utf-8').read())
    return unwrap(t) if pdf else t
BASE = { 'ageMin': 19, 'ageMax': 39, 'voterMonths': 6, 'voterRate': 60, 'absentYears': 1, 'presAgeMax': 33, 'presYears': 3, 'vpYears': 2, 'apptYears': 1,
         'presBaptized': False, 'vpBaptized': False, 'apptBaptized': True, 'quorumWeeks': 5, 'quorumNum': 2, 'quorumDen': 3, 'sameRoleMax': 2, 'chairTeamMax': 0 }
# (id, 파일, 개정 차수, 개정일, 요약, 판정 수치 중 그 판에서 다른 것)
VERS = [
  ('2011-11', '2011-12 청년부 회칙.txt', '11차 수정', '2011-09-26',
   [('4조', '회원', '미혼 20~33세 (19~25세 청년 1부, 26~33세 청년 2부)'), ('5조', '결의권', '회원 모두 발언권·선거권·피선거권'), ('11조', '자격', '회장: 본 교회 출석 1년 이상 세례교인'), ('13조', '정족수', '직전 3주 평균 출석의 2/3')],
   { 'ageMin': 20, 'ageMax': 33, 'voterMonths': 0, 'voterRate': 0, 'presAgeMax': 0, 'presYears': 1, 'vpYears': 1, 'quorumWeeks': 3, 'presBaptized': True, 'vpBaptized': True }),
  ('2013-13', '2013 청년부회칙 (13년총회수정본).txt', '13차 수정 (2013년 총회, 날짜 기록 없음)', '2013',
   [('4조', '회원', '미혼 20세부터 (나이 상한 없음)'), ('11조', '자격', '회장: 본 교회 출석 1년 이상 세례교인'), ('13조', '정족수', '직전 3주 평균 출석의 2/3')],
   { 'ageMin': 20, 'ageMax': 0, 'voterMonths': 0, 'voterRate': 0, 'presAgeMax': 0, 'presYears': 1, 'vpYears': 1, 'quorumWeeks': 3, 'presBaptized': True, 'vpBaptized': True }),
  ('2017-17', '2017 청년부 회칙.txt', '17차 수정', '2017-11-05',
   [('4조', '회원', '미혼 20세부터, 직분자 제외, 조기 졸업자는 교역자와 상의'), ('11조', '자격', '회장: 본 교회 1년 이상 세례교인, 1년 중 무단결석 6회 미만, 만 33세 이하'), ('13조', '정족수', '직전 5주 평균 출석의 2/3')],
   { 'ageMin': 20, 'ageMax': 0, 'voterMonths': 0, 'voterRate': 0, 'presYears': 1, 'vpYears': 1, 'presBaptized': True, 'vpBaptized': True }),
  ('2018-18', '2018 청년부 회칙.txt', '18차 수정', '2018-11-11',
   [('4조', '회원', '미혼 20세부터, 직분자 제외'), ('11조', '자격', '회장: 본 교회 1년 이상 세례교인, 만 33세 이하'), ('13조', '정족수', '직전 5주 평균 출석의 2/3')],
   { 'ageMin': 20, 'ageMax': 0, 'voterMonths': 0, 'voterRate': 0, 'presYears': 1, 'vpYears': 1, 'presBaptized': True, 'vpBaptized': True }),
  ('2022-20', '2022 중앙성서교회 청년부 회칙.txt', '20차 수정', '2022-11-13',
   [('4조', '회원', '미혼 20~39세, 직분자 제외, 새가족반 과정'), ('5조', '선거권', '새가족반 수료 후 예배 출석 6개월 이상 (출석률 조건 없음)'), ('11조', '자격', '회장: 만 33세 이하')],
   { 'ageMin': 20, 'voterRate': 0, 'presYears': 1, 'vpYears': 1 }),
  ('2023-21', 'PDF:2023 중앙성서교회 청년부 회칙.txt', '21차 수정', '2023-11-19',
   [('5조', '선거권', '6개월 이상 출석 + 1년 내 출석률 60% 이상'), ('11조', '자격', '회장: 만 33세 이하, 제명 없이 3년 이상 출석 / 부회장: 2년 이상')],
   { 'ageMin': 20 }),
  ('2024-22', 'PDF:2024 중앙성서교회 청년부 회칙-1.txt', '22차 수정', '2024-11-10',
   [('4조', '회원', '만 32세 이상 또는 기혼자는 선택적으로 라피끄 가입'), ('5조', '선거권', '6개월 이상 출석 + 1년 내 출석률 60% 이상'), ('11조', '자격', '회장: 만 33세 이하, 3년 이상 출석 / 부회장: 2년 이상')],
   { 'ageMin': 20 }),
  ('2025-23', '2025 중앙성서교회 청년부 회칙(수정본).txt', '23차 수정', '2025-11-16',
   [('4조', '회원', '만 19~39세 미혼'), ('5조', '선거권', '6개월 이상 출석 + 1년 내 출석률 60% 이상'), ('11조', '자격', '회장: 만 33세 이하, 3년 이상 출석 / 부회장: 2년 이상 / 임명직: 본 교회 1년 이상 세례교인')],
   {}),
]
bylaws = []
for id_, fn, rev, date, summ, diff in VERS:
    bylaws.append({ 'id': id_, 'kind': 'young', 'title': '중앙성서교회 청년부 회칙', 'revision': rev, 'date': date, 'status': 'old', 'text': read(fn.replace('PDF:', ''), fn.startswith('PDF:')),
                    'params': { **BASE, **diff }, 'summary': [{ 'no': n, 'title': t, 'body': b } for n, t, b in summ],
                    'notes': f'원본: {fn.replace("PDF:", "").replace(".txt", "")} — 이전 판은 총회 자동 판정에 쓰지 않습니다.' })
# 현행(24차)은 본문만 채운다 (앱에 이미 있는 2025-24 문서의 text가 비어 있을 때)
bylaws.append({ 'id': '2025-24', 'kind': 'young', 'textOnly': True, 'text': read('2025 중앙성서교회 청년부 회칙(수정본1).txt', True) })
# 기드온 찬양팀 회칙 (별도 규례)
bylaws.append({ 'id': 'gideon-12', 'kind': 'gideon', 'title': '중앙성서교회 기드온 찬양팀 회칙', 'revision': '12차 수정', 'date': '2025-11-30', 'status': 'current',
                'text': read('2025_중앙성서교회 기드온 회칙.txt', True), 'summary': [], 'notes': '기드온 찬양팀 자체 회칙 — 청년부 총회 자동 판정에는 쓰지 않습니다.' })
out = { 'generated': datetime.datetime.now().isoformat(timespec='seconds'), 'dept': 'young', 'bylaws': bylaws,
        '_review': ['2013년 판은 파일 안의 수정 이력이 12차(2012-10-21)까지만 있고 파일명이 "13년총회수정본"이라 13차로 두었습니다 (날짜 기록 없음)',
                    '2011~2018 판의 판정 수치(선거권 출석률 없음, 회장 나이 제한 등)는 본문을 읽고 넣은 값이라 참고용입니다'] }
json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
print(f'bylaws {len(bylaws)}', file=sys.stderr)
