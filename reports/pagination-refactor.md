# Pagination refactor verification — 2026-09-27

## Inputs / plan

Compared the measured pagination/height separation and table policies in rhwp commit `680111ec7bea2fe11110de18c3676ba5a1cf7847` with this viewer. Scope: common measured splitter, fractional geometry, page-edge spacing, CELL row continuation and batched browser reads. No document-specific offsets or scaling. Source references are in DEVELOPMENT.md.

## Changes

- index.html: remove duplicate flow/tall-cell splitting, batch geometry reads and writes, retain overflowing object extents, account for collapsed margins, discard page-edge trailing gaps, distinguish HWPX table policies and repeat requested headings.
- tests/layout.cjs: fractional heights, margins, fixed-wrapper overflow, policy distinctions, single-row multi-cell splitting, split paragraph bottom spacing and parser attributes.
- tests/performance.cjs: alternating before/after local Chrome benchmark (five runs, median).
- DEVELOPMENT.md: implementation rules, references and limitations.

## Acceptance / evidence

Passed `npm test`, `npm run test:simplification`, `npm run test:layout`, `npm run test:fidelity`, `npm run test:fonts`, `npm run test:font-reflow`, `npm run test:fields`.

Both supplied local documents passed `node tests/containment.cjs --sample <file>` and `node tests/viewer.cjs --sample <file>`: 75–200% zoom, text retention, search, print/return, fallback/cancel and offline app-shell cache. Festival screen/PDF: 9 pages; education screen/PDF: 18. The industry table now continues within its row and repeats the requested header. Local document files and rendered artifacts are not committed.

This standalone project has no separate lint/typecheck/build scripts. `npm test` checks embedded JavaScript syntax and app structure; browser suites validate runtime behavior. `git diff --check` passed.

## Performance

Baseline: d8cf47f, same Chrome and machine, alternating five runs. Counts cover opening/rendering the document. Pagination time measures layoutSection, not file I/O.

| Document | Layout count | Style recalc count | Pagination median | Pages |
|---|---:|---:|---:|---:|
| Festival HWPX | 54 → 10 | 172 → 12 | 69.1 → 70.3 ms | 9 |
| Education HWP | 44 → 12 | 273 → 12 | 124.9 → 125.9 ms | 18 |

Recalculation counts fell substantially; total pagination time did not improve meaningfully. Do not interpret fewer layout events as a claimed end-to-end speedup. Text measurement and the document DOM remain significant costs. Timings are machine/font/browser dependent.

## Review / security

Independent read-only AI review found fixed-container overflow loss, previous-page margin carryover and duplicated split-paragraph bottom margins. All were corrected and covered by browser regressions. Final scope review found no new high/critical security issue: no new network requests, runtime dependencies, HTML parsing sinks or document upload; finite source-unit split bound, and indivisible objects preserve content. This is a focused change review, not a complete security audit of bundled parsers.

## Risks / decisions

- Column definitions, changing column widths and explicit column/page breaks still need a separate model (T-012). Grouping y resets heuristically would break mixed column documents. This part of the original investigation remains unresolved.
- A wrapped body line still makes its entire source page use flow layout.
- Complex merged rows and indivisible objects can remain oversized; missing original fonts can change line breaks. No claim of universal source fidelity.
- Chose shared browser measurement rather than replacing the standalone app with a Rust/WASM engine. No source code was copied from rhwp.

## Deploy / rollback

Publish through the existing main-branch GitHub Pages build, then verify deployed HTML matches the commit and smoke-test a document in the deployed viewer. No migrations or new environment variables. Rollback: revert the pagination commit with `git revert <commit>` and `git push origin main`; the preceding deploy source is d8cf47f. Reversion uses a new commit, without history rewriting. Deployment result is recorded in the local final report after the build.
