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
depts/{d}/students/{id}                    학생: name, sex, birth, classId, status(active|newcomer|longabsent|left), faith, phone, guardianPhone, address, history[], scholarship[], flags[]
depts/{d}/reports/{YYYY-MM-DD}             주일 보고서: 예배 정보, counts{}, att{studentId: P|O}, absent{}, newcomers[], offering{}, teachersPresent[], teachersAbsent{}, activity, meeting, special, status, imported
depts/{d}/expenses/{id} · incomes/{id}     회계: ledgerId, date, category, desc, amount, requester, receipt
depts/{d}/events/{id} · notices/{id}       연간 행사 · 부서 공지
depts/{d}/plans/{year}                     연간계획서: status(draft|confirmed), slogan, verse, goals[], methods, ministry, worship, budget[], notes
depts/{d}/assets/{id}                      물품대장: no, name, category, spec, qty, unit, price, total, purchaseDate, vendor, location, manager, status, expenseId, source(auto|manual)
committee/main (+ notices, events)         교육위원회 임원 · 공지 · 공통 일정
scholarship/{id}                           장학(교육위원회 전용, 계좌 포함)
archive/{id}                               2025년 이전 파일 색인(파일은 시놀로지)
promotions/{year_studentId}                다음 해 진급 예정자(보내는 부서가 자동 기록, 받는 부서가 "출석부에 받기")
meta/import                                가져오기 기록
```

## 운영

- 비밀번호 변경: Firebase 콘솔 → Authentication → 사용자 → 비밀번호 재설정.
- 담당자 교체: 부서 비밀번호만 새로 알려주면 됨. 교회 계정이 생기면 Firebase "사용자 및 권한"과 GitHub 저장소 소유권을 그 계정으로 이전.
- 연도 바뀔 때: 각 부서 출석부의 "진급자 명단 출력"으로 확인 → 받는 부서가 "출석부에 받기" → 보내는 부서는 졸업자를 제적·졸업으로 → `config.js`의 `CBCS_YEAR`를 바꾸고 연간 계획 입력.
- 로컬 시험: `python3 -m http.server` 후 `index.html?mock=1` (브라우저 저장소만 사용, `data/import_data.json`이 있으면 자동 적재).

## 자료 보관

모든 자료는 교육부 전용 Firebase 데이터베이스에만 보관되며, 부서 비밀번호로 로그인한 사람만 볼 수 있습니다(보안 규칙으로 부서별 분리, 장학·계좌는 교육위원회 전용). 외부에 공개하거나 제공하지 않습니다.

제작자: 이삭 목사 · 중앙성서교회
