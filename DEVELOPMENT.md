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
| document-layout | 두 형식 공통 쪽 배치·선행 공백 보존 | HWPViewer.Layout |
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
- 줄 정리: Layout.fitLines는 선행 공백 보존과 인쇄용 넘침 판정만 합니다. 줄 위치·폭·글자 크기를 자동으로 바꾸지 않습니다.
- 쪽 나눔: Layout.layoutSection과 내부 paginate/repairOverflow 계열.
- 배포용 복호화: Distribution.prepare. 입력 파일 맵은 성공 전까지 변경하지 않습니다.
- UI 연결·문서 전환: viewer-controller. loadGeneration으로 늦게 도착한 결과를 무시합니다.

HWP/HWPX 원시 파서는 형식별로 유지합니다. 표의 소스 속성 해석도 별도이며, 공통 글자 스타일과 최종 페이지 배치만 공유합니다.
이번 작업은 미지원 도형이나 모든 표 제목행 반복을 새로 구현하는 작업은 아닙니다.

## 레이아웃 갱신 규칙

createFitter(root)는 schedule / flush / cancel을 제공합니다.
- 배율 변경·글꼴 등록·문서 표시 후: schedule(). 연속 요청은 합쳐 처리합니다.
- 인쇄 버튼 및 beforeprint: flush(). 임의의 120ms 지연에 의존하지 않습니다.
- 문서 초기화: cancel(). 이전 문서의 예약 작업을 제거합니다.
- afterprint: schedule(). 화면 기준으로 넘침 여부를 다시 확인합니다.

페이지 분할은 실측 본문 높이를 기준으로 합니다. offsetHeight/scrollHeight의 정수 반올림에 대한 1 CSS px 허용 오차만 둡니다.
글꼴 변경 뒤 모든 페이지를 원본 모델에서 다시 조판하는 엔진은 아직 없습니다.

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

## 임의 위치·축소 보정 제거

- 줄의 가로 압축과 왼쪽 강제 이동, 페이지 전체 자동 축소를 제거했습니다.
- 문단 간격 비례 회수, 좁은 셀의 들여쓰기·여백 축소, 개체의 강제 위쪽 이동을 제거했습니다.
- 문단 높이 60%/25% 기준의 후속 이동과 60px/70px 기준의 추측 배치를 제거했습니다.
- 원본 글자 크기·장평, 셀 여백, 탭 좌표와 사용자가 선택하는 화면 확대는 유지합니다.
- 한 쪽보다 큰 분할 불가 내용은 원래 크기를 유지하고 인쇄에서 자연스럽게 이어집니다.
- HWP 용지 정보의 머리말·꼬리말 영역 높이를 보존합니다. 머리말은 원본 위쪽 용지 여백 뒤에, 꼬리말은 본문 영역 뒤에 배치하며 28% 비율을 사용하지 않습니다.
- 저장된 표 제목행 반복 플래그를 따르며 20행 이상 조건을 적용하지 않습니다. 복잡한 병합 제목행의 완전한 재현은 별도 검증이 필요합니다.

    npm run test:layout

Node.js 20 이상과 Playwright가 필요하며 BROWSER_CHANNEL, PLAYWRIGHT_MODULE을 지원합니다.
합성 문서로 정렬·확대·글자 폭 변경, 탭 위치, 쪽 나눔 경계, 셀 여백, 병합 행, 머리말·꼬리말 여백 해석, 인쇄 모드와 2쪽 PDF 생성을 검사합니다.
원본 글꼴이 없으면 대체 글꼴의 폭 차이가 그대로 드러날 수 있습니다. 임의로 눌러 맞추지 않으므로 정확한 재현에는 원본 글꼴이 필요할 수 있습니다.

여백 해석 참고: [한컴 용지 여백 안내](https://help.hancom.com/hoffice130/ko-KR/Hwp/format/setting_paper/setting_paper(margins).htm).

## 이번 검증 결과

- 공고문 및 신청서식(1~3).hwpx: 7쪽, 표 8개, 표 행 47개.
- 2026년도 5급 공채 및 외교관후보자 원서접수 결과: 2쪽, 표 3개, 표 행 62개.
- 두 문서 모두 리팩터링 전후 본문 텍스트와 위 구조가 동일합니다.
- 배포용 문서의 복호화 결과를 독립 구현과 비교했고, 크기·체크섬 오류와 미지원 방식도 검사했습니다.
- 이번에 새로운 HWP 5.0 실파일을 추가 검증하지는 않았습니다.

## 줄 앞 공백 회귀 검사

Layout.preserveLeadingSpaces는 양쪽 정렬 줄의 선행 공백을 고정 폭 인라인 요소로 감쌉니다. 공백 문자를 삭제하거나 다른 문자로 치환하지 않습니다. HWP/HWPX 공통 줄 보정 전에 한 번 적용합니다. 절대좌표 탭 줄은 제외합니다.

    node tests/leading-spaces.cjs "C:\문서\서울교통공사_연봉제보수규정(2026.01.16).hwpx"

75%, 100%, 150%, 200%, 폭맞춤과 재변경에서 1~4번 항목의 시작 위치 일치를 검사합니다. 이 문서의 본문·11쪽·표 4개·표 행 9개는 수정 전후 동일합니다.

## 자동 점검으로 발견한 오류와 회귀 검사

- 잘못된 글꼴 추가가 열린 문서를 초기화하던 문제: 글꼴 실패는 상태 메시지만 표시합니다.
- 느린 글꼴 읽기가 끝난 뒤 이전 선택의 문서가 새 문서를 덮어쓰던 문제: 파일 선택 세대 번호로 오래된 준비 결과를 무시합니다.
- 여러 파일 선택 안내가 초기화 후 되살아나던 문제: 지연 콜백을 제거했습니다.
- 뒤쪽 섹션 XML 오류 시 앞에서 생성한 이미지 Blob URL이 남던 문제: 전체 렌더 성공 때만 DOM을 반영하고 실패하면 URL을 회수합니다.

    node tests/audit.cjs "C:\문서\첫번째.hwpx" "C:\문서\두번째.hwpx"

이 검사는 잘못된 글꼴, 지연된 파일 읽기, 초기화, 깨진 XML과 이미지 데이터를 의도적으로 만들어 실제 오류 경로를 검사합니다.
두 파일은 서로 다른 정상 HWPX여야 합니다. PLAYWRIGHT_MODULE 환경변수를 지원합니다.

## 문서 제어 코드 단순화 검사

전용 HWP 표시와 호환 뷰어 해제는 각각 showBinary와 destroyLegacyViewer에서 처리합니다.
다른 ZIP 문서의 오류 안내는 형식 목록에서 선택합니다.
검색 본문은 검색어와 동일하게 문자열 전체를 소문자로 바꾸며, 길이가 늘어나는 문자에만 원문 위치 맵을 만듭니다.

    npm run test:simplification

외부 샘플 없이 합성 HWP/HWPX를 실제 파일 선택 경로로 엽니다.
문서 열기, 모드 전환, 실패 시 복귀, 초기화, 다른 ZIP 형식의 오류 안내와 Unicode 검색 범위를 검사합니다.
호환 뷰어 자체는 대역을 사용하므로 실제 hwp.js 문서 호환성 검사를 대체하지 않습니다.
브라우저 검사는 Node.js 20 이상이 필요합니다.
기본 브라우저는 Edge이며 Chrome은 BROWSER_CHANNEL=chrome으로 선택합니다.
기존 PLAYWRIGHT_MODULE 환경변수도 지원합니다.

### 공통 원본 좌표 배치

HWP/HWPX 전용 렌더러는 `Layout.createSourcePager`를 공유한다. 이전 줄의 끝 높이에 임계값을 더하는 대신 저장된 줄 시작 y가 되돌아가는 시점에 쪽을 나눈다. HWPX의 명시적 pageBreak도 유지한다.

쪽의 모든 본문 단위에 유효한 시작/끝 좌표가 있으면 `alignSourcePages`가 본문 여백 + 원본 좌표 × 96/72로 문단과 줄을 배치한다. 글꼴 실측 높이로 간격을 다시 만들거나 해당 쪽을 재분할하지 않는다. 좌표가 부족한 쪽은 기존 실측 흐름 배치를 사용한다. 이 선택은 파일 이름이나 샘플별 값과 무관하다.

`npm run test:layout`은 동일 좌표의 HWP/HWPX 생성 문서, 작은 y 되돌림, 줄 상자 겹침, 글꼴/확대율 변경, 줄 내부 좌표, 명시적 쪽 나눔 PDF를 검증한다. 다단 문서의 단 전환, 복잡한 부유 개체/각주 및 원본 글꼴 미설치는 완전한 원본 재현을 위해 추가 지원이 필요한 영역이다. 원본 좌표를 유지하므로 대체 글꼴이 크면 겹침/넘침이 드러날 수 있다.

### 표 앵커와 실제 영역 검증

원본 좌표가 있어도 표 전체가 해당 줄 상자 높이에 포함되는 것은 아니다. `alignSourcePages`는 실제 표 높이가 다음 단위/본문 하단을 넘지 않는 경우에만 고정 배치를 사용한다. 넘으면 일반 흐름에서 간격을 계산하고 행 경계로 쪽을 나눈다. `renderPara`의 표 전용 문단은 글자용 내어쓰기 padding을 적용하지 않는다. 셀의 원본 줄이 셀 폭을 넘으면 `reflowCellText`가 줄바꿈을 허용해 행 높이에 반영한다. 글자를 줄이거나 자르지 않는다.

추가 회귀 검사: `node tests/containment.cjs --sample /path/to/document.hwp`. 로컬 파일을 열어 75–200% 확대, 인쇄/복귀에서 표·셀 경계와 텍스트 보존, PDF 쪽 수를 검사한다. 입력 문서는 저장소에 포함하지 않는다. 합성 테스트에는 짧은 앵커로 표시된 긴 표와 긴 셀 글자를 포함한다.

### HWP 의미 정보 보존

`NUMBERING`과 `BULLET`은 각자 1부터 시작하는 참조 목록이다. 저장된 줄을 사용하는 문단에서도 머리표를 한 번 표시하며, PARA_TEXT에 없는 머리표가 UTF-16 위치 계산을 바꾸지 않도록 한다. HYPHEN 제어문자도 표시한다. HNC 전용 겹낫표 U+F0854/U+F0855는 원본 줄·서식 위치 해석 후 Unicode 『/』로 표시한다. 원본 파일 바이트는 변경하지 않지만 화면의 복사·검색·텍스트 추출에는 대체 문자가 사용된다.

HWP BorderFill의 대각선 속성을 보존하고 셀 크기에 맞는 SVG 대각선을 그린다. 원본 font-family를 유지하며, FontFaceSet.check만으로 없는 시스템 글꼴을 설치된 것으로 판정하지 않는다. 대체 글꼴의 폭과 일부 선 종류/다중 대각선은 완전한 원본 재현과 차이가 남을 수 있다.

`npm run test:fidelity`: 독립적인 글머리 ID, 빈 문단 머리표, 제어문자/PUA, 셀 대각선 및 없는 글꼴 판별을 합성 HWP로 검사한다. 표 넘침 복구에서는 분할 전 앵커의 min-height도 해제하여 인쇄용 추가 쪽이 생기지 않게 한다.

참고: https://github.com/mete0r/pyhwp/blob/master/src/hwp5/binmodel/tagid20_border_fill.py (BorderFill 구조), https://github.com/mete0r/pyhwp/blob/master/src/hwp5/binmodel/controlchar.py (제어문자), https://github.com/rkttu/hwplibsharp/releases (HNC 겹낫표 코드 포인트). 코드는 기존 프로젝트 구조에 맞춰 작성했다.

### 언어별 글자 서식

HWP의 ID_MAPPINGS에 저장된 언어별 FACE_NAME 개수와 CHAR_SHAPE의 일곱 참조를 사용한다. HWPX는 fontface/fontRef의 언어별 참조를 사용한다. 두 형식 모두 Typography의 공통 경로에서 한글·영문·한자·일본어·기타·기호·사용자 영역에 대응하는 글꼴, 자간, 상대 크기를 적용한다. 숫자/공백은 주변 언어 구간과 함께 처리하고, UTF-16 줄 위치 해석이 끝난 DOM 단계에서 서식 구간만 분리하므로 원문 문자열은 보존한다.

대체 글꼴 표시는 실제 출력 구간의 글꼴 이름을 대상으로 공통 설치 검사를 사용한다. 원본 글꼴이 없는 상태에서 원본 표시를 보장한다는 안내는 제거했다. 장평은 여전히 CSS font-stretch에 의존하며, 모든 정적 글꼴에서 정확한 폭을 보장하지 않는다. 글자의 수직 위치, 복잡한 문자별 언어 판정, 원본 글꼴 부재에 따른 폭 차이는 남은 지원 한계다.

검사: `npm run test:fonts` — HWP/HWPX의 동일 혼합 언어 문서에서 글꼴 참조, 상대 크기, 자간, 원문 보존, 반복 적용 및 대체 글꼴 배지를 검증한다.
참고: https://github.com/mete0r/pyhwp/blob/master/src/hwp5/binmodel/tagid17_id_mappings.py 및 tagid21_char_shape.py, https://github.com/mete0r/pyhwp/blob/master/src/hwp5/charsets.py.
