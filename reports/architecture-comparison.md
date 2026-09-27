# rhwp와 HWP Viewer 구조 비교 및 개선

기준: rhwp `680111ec7bea2fe11110de18c3676ba5a1cf7847`, 우리 뷰어의 출발점 `7b2c58f`.

## 입력과 판단

| 영역 | rhwp에서 확인한 구조 | 기존 뷰어 | 이번 결정 |
|---|---|---|---|
| 문서 해석 | 형식별 파서 → 공통 Document 모델 | HWP 객체/파서와 HWPX XML → 각각 DOM | 공통 DocumentModel에 나눔·용지·머리말 의미를 먼저 보존 |
| 배치 | 모델 → 측정·페이지 분할 → 렌더 트리 | 브라우저 DOM 실측 + 원본 좌표, 공통 splitter | 기존 공통 분할을 유지하고 최종 물리적 페이지 번호로 여백/머리말 결정 |
| 출력 | Canvas/SVG/HTML 등 백엔드 분리 | HTML DOM과 브라우저 인쇄 | 화면·인쇄가 같은 최종 여백을 사용하도록 통일 |
| 오류 | 오류/진단 계층 별도 | 일부 잘린 스트림에서 읽힌 앞부분만 반환 | 레코드 경계 오류는 명확히 실패, 자동 호환 폴백 금지 |
| 확장 범위 | 편집/직렬화와 Rust/WASM 포함 | 설치 없는 단일 HTML 읽기 뷰어 | 런타임 교체 없이 검증 가능한 부분을 단계적으로 적용 |

언어가 Rust인지 JavaScript인지보다 **원본 의미를 얼마나 보존하고 어느 단계에서 판단하는지**가 현재 오류에 직접 연결된다. 전체 엔진을 바꾸면 오프라인/단일 파일 배포, 글꼴 등록, 검색 등도 다시 검증해야 하므로 이번에는 기존 사용 흐름을 유지했다. rhwp도 모든 출력의 정확성을 보증하는 정답으로 취급하지 않고 해당 코드와 합성 회귀 사례를 대조했다.

## 출력물과 수정

- `index.html`: DocumentModel; HWP/HWPX 명시적 나눔; 가로 용지; 제본 및 맞쪽 여백; 실제 페이지 순번; 홀짝 머리말/꼬리말과 정의 시작점; 레코드 경계 오류/후속 구역 선검증.
- `tests/document-model.cjs`, `package.json`: `npm run test:document` 추가.
- `DEVELOPMENT.md`: 모델 책임과 지원 한계 기록.

명시적 나눔은 저장된 줄 좌표가 없거나 이전 줄보다 작아지지 않아도 동작한다. 단일 단에서 columnBreak는 다음 쪽으로 이동한다. 실제 다단을 지원한다는 의미는 아니다. 맞쪽 편집의 여백 합은 그대로이므로 최종 홀짝 판정이 줄 폭이나 이미 끝난 분할을 바꾸지 않는다.

## 검증 기준과 증거

새 합성 검사는 HWP/HWPX에서 같은 용지·여백, 첫 문단 나눔의 불필요한 빈 쪽 방지, 명시적 나눔과 동일 Y, 구역/다단 정의 비트, 넘침으로 생성된 페이지의 홀짝, 구역 간 홀짝, 중간 머리말 변경, 화면/인쇄 여백 일치 및 가로 PDF 크기, 글꼴 등록 후 재배치 유지, DocInfo/본문 레코드 헤더·확장 길이·payload 절단, 후속 구역 손상 시 부분 DOM 미출력, 자동 legacy 폴백 차단을 검사한다.

명령: `npm test`, `npm run test:document`, `npm run test:layout`, `npm run test:simplification`, `npm run test:fidelity`, `npm run test:fonts`, `npm run test:font-reflow`, `npm run test:fields`. 실제 문서는 `node tests/containment.cjs --sample <file>` 및 `node tests/viewer.cjs --sample <file>`로 검사한다. 별도 lint/typecheck/build는 구성되어 있지 않으며 `npm test`에 인라인 구문/독립 실행 구조 검사가 있다. 로컬 문서와 결과 PDF는 저장소에 포함하지 않는다.

독립 AI 리뷰에서 발견한 뒤쪽 머리말의 앞쪽 소급 적용을 수정하고 두 형식의 회귀 검사를 추가했다. 문단 전체가 다음 쪽으로 이동할 때도 최초 내용 줄/행을 따라가도록 적용 기준을 보완하고 추가 검사를 통과했다. 검토 범위에서 새 Critical/High 보안 이슈는 발견하지 않았다. 새 네트워크 전송, 외부 런타임 의존성, HTML 삽입 경로는 추가하지 않았다. 경계 검증은 압축 해제 크기나 모든 레코드 내부 필드에 대한 포괄적인 보안 감사가 아니다.

## 남은 문제와 다음 단계

1. 다단: 단 정의/폭/방향과 명시적 단 나눔을 보존하고, 물리적 쪽 안에서 단끼리 넘침을 연결하는 모델 필요(T-012). 단순히 Y 초기화 횟수로 묶지 않는다.
2. 개체: 어울림/글 뒤/글 앞과 원본 X/Y, 기준 영역을 공통 개체 모델에 보존해야 한다. 기존 float 경로와 고정 간격의 한계는 이번 수정 범위 밖이다.
3. 글꼴/문자 측정: 브라우저 대체 글꼴 의존, 페이지 전체 흐름 전환, 복잡한 병합 행은 남는다.
4. 머리말: 구역 간 상속, 문서 쪽 번호 재시작/숨김 조건은 아직 지원하지 않는다.
5. TOP_BOTTOM 제본의 정확한 방향 처리는 보류했다. 참고한 rhwp 구현에서도 기본 왼쪽 제본 경로를 사용하므로 그것만 근거로 동일하다고 주장하지 않는다.

## 배포와 복구

기존 main 기반 GitHub Pages로 게시한다. 배포 후 HTML 일치와 실제 문서 열기/인쇄를 확인한다. 새 환경 변수나 마이그레이션은 없다. 되돌림은 해당 개선 커밋을 `git revert <commit>` 후 `git push origin main`; 이전 기준은 7b2c58f이며 강제 푸시는 필요 없다.

## 확인한 소스

- [모듈 경계](https://github.com/edwardkim/rhwp/blob/680111ec7bea2fe11110de18c3676ba5a1cf7847/src/lib.rs)
- [공통 문서 모델](https://github.com/edwardkim/rhwp/blob/680111ec7bea2fe11110de18c3676ba5a1cf7847/src/model/mod.rs)
- [렌더 트리와 백엔드](https://github.com/edwardkim/rhwp/blob/680111ec7bea2fe11110de18c3676ba5a1cf7847/src/renderer/mod.rs)
- [용지/맞쪽 모델](https://github.com/edwardkim/rhwp/blob/680111ec7bea2fe11110de18c3676ba5a1cf7847/src/model/page.rs)
- [HWPX 속성과 나눔 플래그](https://github.com/edwardkim/rhwp/blob/680111ec7bea2fe11110de18c3676ba5a1cf7847/src/parser/hwpx/section.rs)

구조와 형식 의미를 참고해 기존 JavaScript 구조에 맞춰 작성했으며 Rust 구현 코드를 복사하지 않았다.

## 최종 검증 결과

위 8개 기본/브라우저 테스트 명령 모두 통과했다. 첨부 HWPX/HWP의 75–200% 확대, 표·셀·글자 경계, 검색, 인쇄/복귀, 오류 복구 및 오프라인 검사도 통과했다. 화면/PDF는 각각 9쪽과 18쪽을 유지했다. 마지막 내용 기준점 보완 후 `npm run test:document`를 다시 실행해 통과했다. 이 결과는 제공된 문서와 합성 사례의 회귀 방지이며 모든 문서의 완전한 원본 재현을 뜻하지 않는다.
