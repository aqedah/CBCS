# CBCS — 중앙성서교회 교육부 관리

교육부 네 부서(영유치부·초등부·중고등부·청년부)의 **주일 보고서 · 출결 · 회계 · 월간 보고서 · 연간 계획 · 장학**을 한곳에서 작성·보관·자동 집계하는 웹앱입니다.
주소: `https://aqedah.github.io/CBCS/` (GitHub Pages) · 데이터: Firebase Firestore · 로그인: 부서 비밀번호(부서별 계정)

- **PC**: 작성·수정·출력(PDF) 전부
- **휴대폰**: 메인·일정·공지·보고서 열람·통계·멤버 연락처·**출석 체크**
- 2026년 자료는 HWP·엑셀에서 변환해 넣었고, **2027년 1월 1일부터 앱에서 직접 작성**합니다.
- 2025년까지는 중등부·고등부가 따로 보고했고 2026년부터 중고등부로 통합되었습니다(화면·PDF에 단서 표시).

## 파일

| 파일 | 역할 |
|---|---|
| `index.html` `style.css` `app.js` | 앱 전체 (설치 없음, 빌드 없음) |
| `config.js` | Firebase 설정 키, 계정 이메일 도메인, 기준 연도 |
| `patches.js` | 패치 현황 — 메인 화면 전광판에 나오는 목록. **패치할 때마다 맨 위에 한 줄 추가** |
| `tour.js` `demo-data.js` | 튜토리얼과 체험 모드(`?demo=1`). 가상 자료는 `tools/make_demo.py`로 생성 — 실제 교인 자료 없음 |
| `firestore.rules` | Firestore 보안 규칙 — Firebase 콘솔 → Firestore → 규칙 탭에 붙여넣고 게시 |
| `manifest.webmanifest` `icon-*.png` | 홈 화면 추가(PWA) |
| `tools/` | HWP·HWPX 텍스트·표 추출기와 데이터 규격(SCHEMA.md). 실제 변환 스크립트는 실명이 들어 있어 교육위원회가 따로 보관 |

**이 저장소는 공개입니다. 학생 명단·보고서·회계 등 데이터 파일(JSON, HWP, 엑셀)은 절대 올리지 마세요.** 데이터는 Firestore에만 있고, 2025년 원본 파일은 시놀로지 드라이브에 둡니다.

## 처음 설정 (한 번만)

1. Firebase 콘솔 → Authentication → 이메일/비밀번호 사용 설정 → 사용자 5명 추가:
   `kid@cbcs.app`(영유치부) `youth@cbcs.app`(초등부) `teen@cbcs.app`(중고등부) `flame@cbcs.app`(청년부) `minist@cbcs.app`(교육위원회). 비밀번호가 곧 "부서 비밀번호".
   계정 이름을 바꾸면 `config.js`의 `CBCS_ACCOUNTS`와 `firestore.rules`의 `deptEmail()`도 같이 바꿉니다.
2. Authentication → 설정 → 승인된 도메인에 `aqedah.github.io` 추가.
3. Firestore → 규칙 탭에 `firestore.rules` 내용을 붙여넣고 게시.
4. 앱에 `교육위원회`로 로그인 → **데이터 가져오기** → 변환된 `import_data.json` 올리기.
5. 저장소 Settings → Pages → Branch `main` / `(root)`.

## 데이터 구조 (Firestore)

```
depts/{kinder|elem|youth|young}            부서 문서: name, classLabel, classes[], staff[], ledgers[], budgetPlan[], monthlyPlans{}, monthlyTexts{}, notes{}
depts/{d}/students/{id}                    학생: name, sex, birth, classId, status(active|newcomer|longabsent|left), leftDate·leftKind·leftReason·statusLog[](제적·복적 기록), faith, phone, guardianPhone, address, history[], scholarship[], flags[]
depts/{d}/reports/{YYYY-MM-DD}             주일 보고서: 예배 정보, counts{}, att{studentId: P|O}, absent{}, newcomers[], offering{}, teachersPresent[], teachersAbsent{}, activity, meeting, special, status, imported
depts/{d}/expenses/{id} · incomes/{id}     회계: ledgerId, date, category, desc, amount, requester, receipt
depts/{d}/events/{id} · notices/{id}       연간 행사 · 부서 공지
depts/{d}/timeline/{id}                    삶의 궤적(제적·팸·수련회·교육·직접 적은 기록) · depts/young/officers · depts/young/retreats
depts/{d}/care/{studentId}                 심방 카드 — 부서 관리자 비밀번호로 암호화(AES-GCM) 저장, `_verify`는 비밀번호 확인용
depts/{d}/plans/{year}                     연간계획서: status(draft|confirmed), slogan, verse, goals[], methods, ministry, worship, budget[], notes
depts/young/bylaws/{id}                    청년부 회칙 판: title, revision, date, status(current|draft|old), text(본문), params(판정 기준값), summary[]
depts/young/assemblies/{date}              총회: kind, title, place, overrides{학생: 선거권 직접 지정}, candidates[], minutes{순서·안건·선거 결과·성원}
depts/{d}/assets/{id}                      물품대장: no, name, category, spec, qty, unit, price, total, purchaseDate, vendor, location, manager, status, expenseId, source(auto|manual)
depts/{d}/receipts/{id}                    영수증 사진의 읽은 값: at, date, amount, vendor, memo (지출의 receiptId가 가리킴)
depts/{d}/receiptImgs/{id}                 영수증 사진 한 장(줄인 JPEG). 볼 때만 읽고, 연말 결산 뒤 교육위원회가 일괄 삭제
vehicles/{id}                              차량 신청(전 부서 공유): dept, date, dateEnd, start, end, vehicle, dest, purpose, driver, status
siblings/{부서}                            형제자매 색인: 형제자매가 적힌 학생의 이름·반·형제 이름만 (다른 부서와 이어 보기용)
committee/main (+ notices, events)         교육위원회 임원 · 공지 · 공통 일정
scholarship/{id}                           장학(교육위원회 전용, 계좌 포함)
archive/{id}                               2025년 이전 파일 색인(파일은 시놀로지)
promotions/{year_studentId}                다음 해 진급 예정자(보내는 부서가 자동 기록, 받는 부서가 "출석부에 받기")
meta/import                                가져오기 기록
meta/backup                                마지막 전체 자료 내려받기 날짜
```

## 삶의 궤적 · 심방 카드 · 관리자 모드

- **삶의 궤적**(모든 부서): 학생 카드 아래에 과거 자료에서 모은 제적 사유·팸 소속·임원 이력·수련회 참가·새가족교육·장학과 올해 출석 요약이 시간순으로 보입니다. 군 입대·복학 같은 일은 직접 적습니다(청년부 계정 모두 봄).

## 모든 부서: 심방 카드와 관리자 모드

- 부서 화면 왼쪽 **🔒 관리자 모드** → 부서 관리자 비밀번호(처음 여는 교역자·부장이 정함, 부서 비밀번호와 별개) → **심방 카드**가 열립니다. 학생마다 직장·취미·가족·상담내용과 날짜별 심방 기록을 적고, 삶의 궤적과 함께 출력합니다.
- 심방 기록은 브라우저에서 그 비밀번호로 **암호화되어(PBKDF2 → AES-GCM)** 저장되므로 부서 비밀번호만으로는 읽을 수 없고, 다른 부서·교육위원회는 Firestore 규칙으로 접근 자체가 막힙니다. 계정은 더 만들지 않습니다.
- 비밀번호를 잊으면 복구할 수 없습니다. 담당자가 바뀔 때는 심방 카드 화면의 "관리자 비밀번호 바꾸기"로 넘겨 주세요(모든 카드를 새 비밀번호로 다시 암호화).
- 삶의 궤적(학생 카드 아래)은 모든 부서에서 보이고, 부서 계정 누구나 적을 수 있는 일반 기록입니다. 민감한 내용은 심방 카드에만 적습니다.
- 청년부 임원 이력(`depts/young/officers`)·수련회(`depts/young/retreats`)도 같은 변환기로 들어갑니다.
- 과거 자료 넣기: `python3 -I tools/young_history.py <청년부 원본 폴더> <GPT 텍스트 폴더> > data/young_history.json` → 청년부 관리자 모드의 심방 카드 화면 "과거 자료 가져오기" (명부는 암호화되어 들어가므로 관리자 모드에서만).

## 청년부 출석부 연도별 보기 · 라피끄

- 출석부 위의 연도 버튼(2021~)으로 그해 소속 명단·팸·주별 출석 띠를 봅니다. 2021~2024년은 과거 출석부·주일보고서 엑셀을 변환해 넣은 것입니다(`young_attendance.py` → `young_attendance.json` → 출석부의 "과거 출석부 가져오기"; 같은 이름·생일은 소속 이력만 보태고, 없는 사람은 제적·졸업 상태로 추가).
- **라피끄**(2청년)는 출석부 옆 탭에서 따로 봅니다. 학생 카드의 "구분"을 라피끄로 두면 되고, 총회 결의권·후보 판정에서는 제외됩니다.

## 운영

- 비밀번호 변경: Firebase 콘솔 → Authentication → 사용자 → 비밀번호 재설정.
- 담당자 교체: 부서 비밀번호만 새로 알려주면 됨. 교회 계정이 생기면 Firebase "사용자 및 권한"과 GitHub 저장소 소유권을 그 계정으로 이전.
- 연도 바뀔 때: 각 부서 출석부의 "진급자 명단 출력"으로 확인 → 받는 부서가 "출석부에 받기" → 보내는 부서는 졸업자를 제적·졸업으로 → `config.js`의 `CBCS_YEAR`를 바꾸고 연간 계획 입력.
- 월 1회: 교육위원회로 로그인 → **자료 내려받기** → 받은 파일(`CBCS-backup-날짜.json`)을 시놀로지 교육위원회 폴더로 옮김. 되돌릴 때는 "데이터 가져오기"에 그 파일을 올림. 심방 카드(care)는 부서 관리자만 읽을 수 있어 이 파일에 들어가지 않음.
- 연말 결산 뒤: **자료 내려받기 → 영수증 사진 정리**에서 그 해 사진을 일괄 삭제(증빙은 실물 영수증).
- `firestore.rules`가 바뀌면(차량 신청·형제자매 색인이 추가됨) Firebase 콘솔 → Firestore → 규칙에 다시 붙여넣고 게시해야 그 기능이 켜짐.
- 영수증 글자 인식은 브라우저 안에서 돌아가며(Tesseract.js, jsDelivr에서 처음 한 번 약 9MB 내려받음) 사진을 외부 서버로 보내지 않음.
- 학생의 `watch`(관심 학생)·`settled`(새친구 재적 전환일)는 앱이 적는 표시.
- 로컬 시험: `python3 -m http.server` 후 `index.html?mock=1` (브라우저 저장소만 사용, `data/import_data.json`이 있으면 자동 적재).

## 자료 보관

모든 자료는 교육부 전용 Firebase 데이터베이스에만 보관되며, 부서 비밀번호로 로그인한 사람만 볼 수 있습니다(보안 규칙으로 부서별 분리, 장학·계좌는 교육위원회 전용). 외부에 공개하거나 제공하지 않습니다.

제작자: 이삭 목사 · 중앙성서교회
