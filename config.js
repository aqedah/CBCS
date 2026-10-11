// Firebase 프로젝트 설정 (공개되어도 되는 식별자. 접근 통제는 로그인 + Firestore 보안 규칙이 담당)
window.CBCS_FIREBASE = {
  apiKey: "AIzaSyDVBdHThwjvyxiUhmI6RVLAw3WJfwsG_pM",
  authDomain: "cbcs-ec627.firebaseapp.com",
  projectId: "cbcs-ec627",
  storageBucket: "cbcs-ec627.firebasestorage.app",
  messagingSenderId: "878740501675",
  appId: "1:878740501675:web:40f14cd2b0612f991db3ee"
};
// 부서 계정 이메일 도메인 (Authentication에 등록한 kinder@cbcs.app 등과 맞춰야 함)
window.CBCS_EMAIL_DOMAIN = "cbcs.app";
// 2026년 데이터 기준 연도 (연초에 바꾸면 통계·월간 집계의 기본 연도가 바뀜)
window.CBCS_YEAR = 2026;
