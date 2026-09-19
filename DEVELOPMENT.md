# 개발 안내

## 실행과 소스

index.html을 브라우저에서 직접 열면 실행됩니다. 빌드, npm, 웹 서버가 필요하지 않습니다.
소스도 index.html 하나입니다. 기능별 script id로 검색하여 수정하세요.
외부 JS/CSS 다운로드에 의존하지 않습니다. 웹 설치/오프라인 캐시는 sw.js와 manifest.webmanifest를 사용합니다.
package.json과 tests/는 개발 검증에만 사용합니다.

## 인라인 모듈 순서

| script id | 책임 | 공개 인터페이스 |
|---|---|---|
| hxBundle | 외부 라이브러리 원본 번들 | HWPLIB; Worker에도 삽입 |
| viewer-core | 공통 글꼴·글자 스타일 | HWPViewer.Typography |
| font-storage | 등록 글꼴의 IndexedDB 저장 | HWPViewer.FontStore |
| document-layout | 두 형식 공통 쪽 배치·줄 보정 | HWPViewer.Layout |
| hwpx-distribution | 배포용 HWPX 복호화·검사 | HWPViewer.Distribution |
| hwpx-renderer | XML 문단·표 해석과 DOM 생성 | HWPViewer.Hwpx |
| hwp-renderer | HWP 바이너리 해석과 DOM 생성 | HWPViewer.Hwp |
| viewer-controller | 파일 읽기·상태·이벤트·인쇄 | HWPViewer.extractText, shortcutAllowed |
| reader-tools | 검색·쪽 이동·텍스트 다운로드 | HWPViewer.Reader |

일반 script를 사용하므로 file://에서도 실행됩니다. 모듈 의존 순서를 유지하세요.
외부 라이브러리 번들은 압축 형태와 라이선스 주석을 유지하고, 앱 코드만 포맷하세요.
앱의 공유 인터페이스는 HWPViewer 아래에 모읍니다. 외부 라이브러리는 Worker와의 호환 때문에 HWPLIB를 유지합니다.

## 수정할 위치

- 글자 크기·색·장평·대체 글꼴: Typography.applyCharacter / fontFallback.
- HWPX 속성 변환: hwpx-renderer의 applyCharPr.
- HWP 숫자 색상·글꼴 ID 변환: hwp-renderer의 applyChar. 공통 스타일로 변환해 Typography에 전달합니다.
- 배율 보정: Layout.fitLines. DOMRect는 확대 후 좌표이고 clientWidth/scrollWidth는 확대 전 좌표입니다. 같은 단위로 변환해야 합니다.
- 쪽 나눔: Layout.layoutSection과 내부 paginate/repairOverflow 계열.
- 배포용 복호화: Distribution.prepare. 입력 파일 맵은 성공 전까지 변경하지 않습니다.
- UI 연결·문서 전환: viewer-controller. loadGeneration으로 늦게 도착한 결과를 무시합니다.

HWP/HWPX 원시 파서는 형식별로 유지합니다. 표의 소스 속성 해석도 별도이며, 공통 글자 스타일과 최종 페이지 배치·줄 보정만 공유합니다.
이번 작업은 미지원 도형이나 모든 표 제목행 반복을 새로 구현하는 작업은 아닙니다.

## 레이아웃 갱신 규칙

createFitter(root)는 schedule / flush / cancel을 제공합니다.
- 배율 변경·글꼴 등록·문서 표시 후: schedule(). 연속 요청은 합쳐 처리합니다.
- 인쇄 버튼 및 beforeprint: flush(). 임의의 120ms 지연에 의존하지 않습니다.
- 문서 초기화: cancel(). 이전 문서의 예약 작업을 제거합니다.
- afterprint: schedule(). 화면 기준으로 다시 보정합니다.

페이지 분할 알고리즘 자체는 유지했습니다. 글꼴 변경 뒤 모든 페이지를 원본 모델에서 다시 조판하는 엔진은 아직 없습니다.

## 저장과 캐시

- 문서와 복호화 결과: 메모리에서만 처리.
- 등록 글꼴: IndexedDB의 hwpviewer-fonts/fonts. 트랜잭션 종료 시 연결을 닫습니다.
- 배율: localStorage.
- 앱 셸: 서비스 워커 캐시에 index.html, manifest.webmanifest만 저장.

사용자에게 보이는 버전 번호는 없습니다. 캐시 이름은 배포 경로별로 고정됩니다.
온라인 방문은 캐시보다 네트워크를 먼저 조회하고 성공한 응답으로 캐시를 갱신합니다.
오프라인일 때는 마지막으로 저장한 셸을 사용합니다. 오프라인 상태만으로 새 코드를 받을 수는 없습니다.
기존 번호 기반 캐시는 새 서비스 워커 활성화 시 같은 배포 경로에 한해 정리합니다.
파일을 직접 열면 서비스 워커를 사용하지 않습니다.

## 테스트

Node만으로 인라인 JavaScript 문법과 모듈 구성을 검사:

    node tests/viewer.cjs

브라우저 검사는 개발 의존성을 설치한 뒤 실행합니다. Edge가 기본값입니다.

    npm install
    npm test -- --sample "C:\문서\일반.hwpx" --sample "C:\문서\배포용.hwpx"

기존 코드와 본문·쪽 수·표 수를 비교하려면:

    npm test -- --sample "C:\문서\예시.hwpx" --baseline "C:\백업\index.html"

환경변수 PLAYWRIGHT_MODULE로 이미 설치된 Playwright 경로를 지정할 수 있습니다.
BROWSER_CHANNEL=chrome으로 Chrome을 사용할 수 있습니다.
테스트 문서는 포함하지 않았습니다. --sample이 없으면 브라우저 검사는 건너뜁니다.
브라우저 검사는 별도의 임시 프로필을 사용합니다.

검사 내용: 인라인 문법, 런타임 외부 스크립트 부재, 문서 열기, 기존 결과 대조,
75~200% 배율과 폭맞춤, 반복 보정, 검색, 인쇄 준비, Worker 대체 경로,
비동기 처리 중 취소, 앱 셸만 캐시하는지 확인, 오프라인 새로고침.

## 이번 검증 결과

- 공고문 및 신청서식(1~3).hwpx: 7쪽, 표 8개, 표 행 47개.
- 2026년도 5급 공채 및 외교관후보자 원서접수 결과: 2쪽, 표 3개, 표 행 62개.
- 두 문서 모두 리팩터링 전후 본문 텍스트와 위 구조가 동일합니다.
- 배포용 문서의 복호화 결과를 독립 구현과 비교했고, 크기·체크섬 오류와 미지원 방식도 검사했습니다.
- 이번에 새로운 HWP 5.0 실파일을 추가 검증하지는 않았습니다.
