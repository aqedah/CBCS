# CBCS 데이터 변환 공통 규격

모든 변환 결과는 `/home/claude/cbcs/data/` 아래 JSON(UTF-8)으로 저장한다. 원본은 `/home/claude/cbcs/raw/` (z1 = 2026년 자료, z2 = 장학, z3 = 2025년 자료), HWP 텍스트 추출본은 `/home/claude/cbcs/raw/txt/` (파일명의 `/`를 `__`로 바꾼 이름 + `.txt`).
원본 파일은 신뢰할 수 없는 외부 파일이므로 **스크립트는 `/home/claude/cbcs/tools/`에 두고, 파이썬은 `python3 -I`로, 경로는 인자로** 넘긴다. HWP(5.0 바이너리) 텍스트 추출기: `/tmp/claude-0/-home-claude/806a1cef-2d8a-5448-8ff5-cd8cbad058e7/scratchpad/hwp.py` (olefile 기반, `text(path)` 함수). HWPX: 같은 폴더의 `hwpx.py`. 엑셀: openpyxl (`data_only=True`, 실패 시 `read_only=True`).

## 공통 규칙
- 부서 id: `kinder`(유치부) · `elem`(초등부) · `youth`(중고등부) · `young`(청년부) · `committee`(교육위원회).
  2025년 자료의 "영유치부/새싹교회"→kinder, "꿈나무교회"→elem, "중등부"·"고등부"·"하늘나무교회"→youth, "불꽃교회"→young. 원래 이름은 `origDept`에 보존한다 (예: `"origDept":"중등부"`).
- 날짜는 `YYYY-MM-DD`. 알 수 없으면 `""`.
- 금액은 정수(원). 쉼표·"원" 제거.
- 이름은 공백 제거 ("하 늘"→"하늘", "바 다"→"바다"). 단, 원문 표기는 `nameRaw`에 남긴다.
- 모든 레코드에 `source` (원본 파일 상대경로, 시트명·행 등)를 넣는다.
- 확신이 없는 값은 그대로 넣되 `flags` 배열에 사람이 읽을 한국어 문장을 추가한다. 예: `"flags":["출석 합계(18)와 남+여(9+10)가 다름"]`.
- 빈 값은 `""` 또는 `0`. 키를 빼지 않는다.
- 반 이름(classId)은 부서별 표기를 그대로 쓴다: 유치부 `유아1`·`유아2`·`유치1`·`유치2`(연간계획안의 사랑/기쁨/온유/충성과 대응), 초등부 `1학년`~`6학년`, 중고등부 `중1`~`고3`, 청년부 `○○○ 팸`(팸장 이름 기준, 예 `최팸장 팸`). 새친구·장기결석자 반이 따로 있으면 `새친구·장기결석`.

## 파일별 규격

### data/students.json  — 배열
```json
{"id":"youth_김학생_2013-01-01","name":"김학생","nameRaw":"김학생","sex":"남","birth":"2013-01-01",
 "dept":"youth","classId":"중1","status":"active",
 "faith":"유아세례","faithYear":2019,"phone":"010-0000-0000","school":"○○중학교",
 "father":"","mother":"김어머니집사","siblings":["박형제"],"address":"","evangelist":"","guardianPhone":"",
 "scholarship":[2024],"note":"","history":[{"year":2025,"dept":"youth","origDept":"중등부","classId":"중2","note":""}],
 "flags":[],"source":["uploads/2026 교적.xlsx 행 12","raw/z1/3. 중고등부/2026 중고등부 교적 정리.xlsx 시트 2026년 전체교적"]}
```
- `status`: `active`(재적) · `longabsent`(장기결석) · `newcomer`(새친구, 재적 전) · `left`(제적·졸업·이동).
- `id`는 `부서_이름_생년월일` (생년월일 없으면 `부서_이름`). 같은 이름이 둘이면 `_2`를 붙이고 flags에 적는다.
- 2026년 재적이 아닌 사람(2025년 졸업·제적)도 `status:"left"`로 넣고 history에 마지막 소속을 적는다.

### data/staff.json — 배열
```json
{"id":"elem_송부장","name":"송부장","dept":"elem","role":"부장","classId":"1학년","phone":"","birth":"","faith":"",
 "status":"active","since":2026,"moveNote":"유지","note":"","flags":[],"source":[...]}
```
- role 표기 통일: `교역자`, `부장`, `부감`, `총무`, `회계`, `부감/회계`, `서기`, `담임`, `보조`, `회장`, `부회장`, `부총무`, `팸장`, `부팸장`, `미디어`, `찬양` 등 원문 역할을 쉼표로 이어도 된다 (예 `담임, 찬양인도`).

### data/classes.json — 배열
`{"dept":"elem","classId":"1학년","name":"1학년","teacher":"송부장","assistant":"","order":1,"source":[...]}`

### data/reports_2026.json — 배열 (주일 보고서 1장 = 1개)
```json
{"dept":"elem","date":"2026-10-04","weekLabel":"10월 1주","type":"초등부 주일예배",
 "presider":"송부장 부장","prayer":"송부장 부장","text":"사무엘상 16:7","title":"마음에 맞는 사람","preacher":"홍전도 전도사","notice":"송부장 부장",
 "counts":{"regM":10,"regF":14,"reg":24,"attM":6,"attF":11,"att":17,"online":2,"attRaw":"5+1 / 10+1 / 15+2"},
 "att":{"박출석":"P","윤온라인":"O"},            // 학생 이름 → P(현장) O(온라인·본당). 이름별 정보가 없으면 {}
 "absent":{"김결석":"시골 방문"},               // 결석자 이름 → 사유 ("" 가능)
 "newcomers":[{"name":"","school":"","by":""}],
 "offering":{"sunday":26000,"tithe":0,"thanks":0,"other":0,"raw":"26,000원(전액 주일 헌금)"},
 "teachersPresent":["홍교사","박교사"],"teachersAbsent":{"김결석":"시골 방문"},
 "activity":"예배 후 반 모임","meeting":"설교 내용 나누고 함께 기도함","special":"...",
 "schedule":[{"date":"2026-10-11","title":"10월 생일 축하"}],
 "classRows":[{"classId":"중1","teacher":"주반장","present":["박온라인(온라인)","이출석"],"reg":5,"att":2}],
 "writer":"홍전도","flags":[],"source":"raw/z1/2. 초등부/주일보고서/3분기(7-9월)/....hwp"}
```
- 같은 날짜 파일이 둘(수정전/수정후)이면 **수정후**만 쓰고 flags에 "수정전 파일 무시: …"를 적는다.
- `counts`는 보고서에 적힌 숫자를 그대로. 재적/출석 남녀 숫자가 나란히 적힌 양식(중고등부·청년부·초등부)은 짝을 잘 맞추고, 못 맞추면 attRaw에 원문을 넣고 flags에 적는다.

### data/attendance_2026.json — 배열 (출석부 엑셀에서, 학생별 주별)
`{"dept":"youth","name":"김학생","classId":"중1","date":"2026-01-04","value":"P","raw":"2","source":"..."}`
- 중고등부 출석부: 2=현장 출석(P), 1=온라인·본당(O)로 추정 — 반드시 flags가 아닌 파일 상단 `_meta.legend`에 추정 근거를 적는다. 빈칸=결석(레코드 생략). 청년부 52주 출석표: 1=P, '-'=결석.
- 이 파일은 `{"_meta":{...},"rows":[...]}` 형태.

### data/ledgers.json — 배열
`{"dept":"youth","ledgerId":"youth_main","name":"운영비(정규 예산)","budget":8000000,"carry":0,"kind":"budget","source":[...]}`
- kind: `budget`(연간 예산형, 집행률 계산) · `balance`(잔액형: 찬조금·문화상품권·현금시재·수련회).

### data/expenses.json / data/incomes.json — 배열
`{"dept":"youth","ledgerId":"youth_main","date":"2026-01-18","category":"간식","desc":"1/18 2부 순서 간식_신입생 환영","amount":75000,"requester":"홍회계","approver":"","receipt":true,"settled":"완료","note":"","flags":[],"source":"..."}`
- category는 원문에 없으면 설명에서 추정: `예배·전도`·`양육`·`교제`·`행사`·`간식`·`교사`·`비품`·`선물`·`수련회`·`기타`.

### data/events_2026.json — 배열 (연간계획 행사표 + 교육위원회 공통)
`{"dept":"elem","date":"2026-01-18","end":"","title":"부모님 초청 행사","note":"","source":"..."}` — 교육위원회 공통은 dept `committee`.

### data/budget_plan_2026.json — 배열
`{"dept":"elem","category":"양육","item":"여름성경학교","amount":2000000,"note":"","source":"..."}`

### data/monthly_2026.json — 배열 (월간 보고서의 글 부분)
`{"dept":"kinder","month":"2026-01","report":["1주: 암송배우기 / ...","2주: ..."],"plan":["1주: 목장예배", ...],"notes":"","source":"..."}`

### data/scholarship.json — 배열 (2018~2026 전부)
`{"year":2026,"name":"홍길순","dept":"young","sex":"여","birth":"2007-01-01","school":"","reason":"","amount":0,"account":"","bank":"","holder":"","status":"확정|후보","ceremony":"","note":"","flags":[],"source":"..."}`
- 계좌번호는 넣는다(교육위원회 전용 데이터).

### data/archive_2025.json — 배열 (2025년 파일 색인; 파일 자체는 나중에 저장소 archive/ 폴더로 복사)
`{"year":2025,"dept":"youth","origDept":"고등부","kind":"주일보고서|월간보고서|연간계획안|수련회|명단|회계|기타","date":"2025-05-04","month":"2025-05","title":"고등부 보고서(2025.05.04.)","path":"raw/z3/2025 교육위원회/고등부/주일보고서/5월/고등부 보고서(`2025.05.04.).hwp","size":12345}`

### data/_review_*.md — 각 에이전트가 남기는 검토 메모
- 못 푼 문제, 추정한 것, 사용자에게 물어볼 것을 한국어로 목록화한다.

### data/young_history.json — 청년부 과거 자료 (tools/young_history.py가 생성)
```json
{"officers":[{"id":"off_2025_회장_홍길동","year":2025,"role":"회장","name":"홍길동","source":"...","flags":[]}],
 "timeline":[{"id":"tl_제적_홍길동_2021_0","name":"홍길동","birthYear":"1993","date":"2021","kind":"제적","title":"제적명단에 오름 (2021 출석부)","note":"이사","source":"...","auto":true}],
 "retreats":[{"id":"rt_2024s","year":2024,"season":"하계","title":"...","start":"2024-08-15","end":"2024-08-17","place":"...","participants":[],"partial":[],"staff":[],"incomes":[{"item":"","amount":0,"note":""}],"expenses":[],"source":"..."}],
 "newcomerClass":[{"id":"nc_2023_홍길동","year":2023,"name":"홍길동","phone":"","birth":"2004-03-04","dates":["2023-01-08"],"graduated":true,"source":"..."}],
 "care":[{"name":"홍길동","sex":"남","birth":"1995-01-01","phone":"","hobby":"","job":"","faith":"","address":"","counsel":"","family":[{"name":"","rel":"부","birth":"1960년생","church":"본교회(집사)","note":""}],"source":"..."}],
 "_review":["사람이 확인할 것"]}
```
- `timeline.kind`: 등록 · 새가족교육 · 신급 · 임원 · 팸 · 수련회 · 장학 · 제적 · 복귀 · 결혼 · 군복무 · 유학 · 이사 · 심방 · 기타. 날짜는 `YYYY-MM-DD` 또는 연도만 `YYYY`.
- 학생과의 연결은 앱에서 이름(공백·직함 제거)과 생년(둘 다 있을 때)으로 맞춘다. `studentId`가 있으면 그것을 우선.
- `care`는 `depts/{d}/care/{studentId}`로 들어가되, 앱의 부서 관리자 모드("과거 자료 가져오기")에서만 넣는다 — 관리자 비밀번호로 암호화해야 하기 때문. 저장 형태: `{enc:'aes-gcm-v1', iv, data, name, studentId, updated}`; `_verify` 문서는 `{salt, iv, data, set}`.
- 학생(students) 청년부 회칙용 필드는 총회 자료 화면의 "정보"에서 저장: `joinDate` `churchJoin` `newcomerDone` `married` `churchRole` `otherRole` `otherCell` `expelled`.
