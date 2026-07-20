# Playwright Report Analyzer — End-to-End Workflow

---

## Objective

> **Transform raw Playwright JUnit XML test reports into actionable intelligence** — enabling QA teams to detect failures faster, track quality trends over time, and make data-driven decisions about test suite health.

---

## Core Aims

| # | Aim | How |
|---|-----|-----|
| 1 | **Ingest** Playwright JUnit XML reports | `fast-xml-parser` maps `<testsuites>/<testsuite>/<testcase>` directly |
| 2 | **Categorize** failures by root cause | 6 error types: assertion, timeout, network, element-not-found, runtime, unknown |
| 3 | **Visualize** test results instantly | Donut, bar, and line charts via Recharts |
| 4 | **Track trends** across multiple uploads | Pass-rate history, regression detection |
| 5 | **Detect patterns** (flakiness, regressions) | Cross-report heatmap + oscillation analysis |
| 6 | **Compare** across tenants and APIs | Multi-tenant matrix + API scenario grid |
| 7 | **Export** findings as PDF | jsPDF with quality grading + tables |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER'S BROWSER                              │
│                    React SPA  (Port 5173)                           │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Vite + React 18 + TypeScript + Tailwind + Recharts + jsPDF  │   │
│  └──────────────────────────┬───────────────────────────────────┘   │
└─────────────────────────────┼───────────────────────────────────────┘
                              │  HTTP (Axios)
                              │  REST API calls
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      BACKEND SERVER (Port 4000)                     │
│                     Express.js + TypeScript                         │
│                                                                     │
│  ┌──────────┐   ┌──────────────┐   ┌───────────┐   ┌───────────┐  │
│  │ Helmet   │   │    CORS      │   │   Rate    │   │  Morgan   │  │
│  │ Security │──▶│  localhost   │──▶│  Limiter  │──▶│  Logger   │  │
│  │ Headers  │   │    :5173     │   │ 200/15min │   │           │  │
│  └──────────┘   └──────────────┘   └───────────┘   └─────┬─────┘  │
│                                                           │         │
│  ┌────────────────────────────────────────────────────────▼──────┐ │
│  │              Routes: /api/reports                             │ │
│  │  POST /upload │ GET / │ GET /:id │ DELETE /:id │ GET /health  │ │
│  └────────────────────────────┬──────────────────────────────────┘ │
│                               │                                     │
│  ┌────────────────────────────▼──────────────────────────────────┐ │
│  │           Parser Service (parser.service.ts)                  │ │
│  │  fast-xml-parser → <testsuites>/<testsuite>/<testcase>        │ │
│  │  → mapTestSuite() / mapTestCase() → app-level model           │ │
│  └────────────────────────────┬──────────────────────────────────┘ │
│                               │                                     │
│  ┌────────────────────────────▼──────────────────────────────────┐ │
│  │           In-Memory Repository (store.ts)                     │ │
│  │           Map<string, ParsedReport>                           │ │
│  └───────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## End-to-End Data Flow

```
                        ╔══════════════════════════════╗
                        ║  PLAYWRIGHT TEST SUITE RUNS  ║
                        ║  npx playwright test         ║
                        ║  --reporter=junit             ║
                        ╚══════════════════╦═══════════╝
                                           ║ generates
                                           ▼
                        ╔══════════════════════════════╗
                        ║       results.xml            ║
                        ║   <testsuites>                ║
                        ║     <testsuite>                ║
                        ║       <testcase>                ║
                        ║         <failure>/<skipped>     ║
                        ╚══════════════════╦═══════════╝
                                           ║ user uploads via browser
                                           ▼
╔══════════════════════════════════════════════════════════════════════╗
║  STEP 1 — UPLOAD (UploadPage.tsx)                                   ║
║                                                                      ║
║  ┌─────────────┐    drag-drop / click    ┌──────────────────────┐   ║
║  │    User     │ ──────────────────────▶ │  File Input (.xml)   │   ║
║  └─────────────┘                         └──────────┬───────────┘   ║
║                                                     │               ║
║                               FormData(file)        │               ║
║                      POST /api/reports/upload        │               ║
║  ┌─────────────────────────────────────────────────▼──────────────┐ ║
║  │  Axios upload with onUploadProgress → progress bar (0→100%)   │ ║
║  └─────────────────────────────────────────────────────────────────┘ ║
╚══════════════════════════════════════════════════════════════════════╝
                                           ║
                                           ▼
╔══════════════════════════════════════════════════════════════════════╗
║  STEP 2 — PARSE (parser.service.ts)                                 ║
║                                                                      ║
║  XML Buffer                                                          ║
║       │                                                              ║
║       ▼  fast-xml-parser (XMLParser.parse)                           ║
║  JUnitDocument { testsuites: { testsuite: [...] } }                  ║
║       │                                                              ║
║       ▼  mapTestSuite() — one per <testsuite> (usually per spec file)║
║  TestSuite[]                                                         ║
║       │                                                              ║
║       ├──▶ mapTestCase() → TestResult[]                              ║
║       │       ├── status: <failure>/<error> → failed                ║
║       │       │           <skipped> → skipped, else → passed        ║
║       │       ├── duration: @_time (sec) × 1000 → ms                ║
║       │       ├── errorMessage: failure @_message / text            ║
║       │       └── stackTrace: failure element text                  ║
║       │                                                              ║
║       └──▶ categorizeError() → ErrorCategory                        ║
║               assertion / timeout / network /                        ║
║               element-not-found / runtime / application              ║
║                                                                      ║
║  buildErrorGroups() → ErrorGroup[]                                   ║
║  stats from root @_tests/@_failures/@_skipped/@_time attributes      ║
║                                                                      ║
║  → ParsedReport { id, name, uploadedAt, stats, suites, errorGroups }║
╚══════════════════════════════════════════════════════════════════════╝
                                           ║
                                           ▼
╔══════════════════════════════════════════════════════════════════════╗
║  STEP 3 — STORE (store.ts)                                          ║
║                                                                      ║
║  InMemoryReportRepository                                            ║
║  ┌──────────────────────────────────────────────────────────────┐   ║
║  │  Map<uuid, ParsedReport>                                     │   ║
║  │  ┌──────────┬────────────────────────────────────────────┐   │   ║
║  │  │  uuid-1  │  { suites[], stats{}, errorGroups[] ... }  │   │   ║
║  │  │  uuid-2  │  { suites[], stats{}, errorGroups[] ... }  │   │   ║
║  │  │  uuid-N  │  { suites[], stats{}, errorGroups[] ... }  │   │   ║
║  │  └──────────┴────────────────────────────────────────────┘   │   ║
║  └──────────────────────────────────────────────────────────────┘   ║
║                                                                      ║
║  Returns: { id, name, stats } → HTTP 201 Created                    ║
╚══════════════════════════════════════════════════════════════════════╝
                                           ║
                                           ▼
╔══════════════════════════════════════════════════════════════════════╗
║  STEP 4 — NAVIGATE (React Router)                                   ║
║                                                                      ║
║  navigate('/analysis/:id')                                           ║
║                                                                      ║
║  GET /api/reports/:id  ──────────────▶  ParsedReport (full)         ║
╚══════════════════════════════════════════════════════════════════════╝
                                           ║
                                           ▼
╔══════════════════════════════════════════════════════════════════════╗
║  STEP 5 — VISUALIZE (7 Pages)                                       ║
╚══════════════════════════════════════════════════════════════════════╝
```

---

## Page Navigation Map

```
                         ┌─────────────────┐
                         │   / (Upload)    │
                         │  Drag-drop XML  │
                         └────────┬────────┘
                                  │ upload success
                                  ▼
                   ┌──────────────────────────────┐
                   │  /analysis/:id (Dashboard)   │
                   │                              │
                   │  [Total] [Pass] [Fail] [Skip]│
                   │  [Flaky] [Duration]          │
                   │                              │
                   │  ┌──────────┐ ┌───────────┐ │
                   │  │  Donut   │ │ Suite Bar │ │
                   │  │  Chart   │ │  Chart    │ │
                   │  └────┬─────┘ └───────────┘ │
                   │       │ click               │
                   │  ┌────────────────────────┐ │
                   │  │ Error Category Chart   │ │
                   │  └────────────────────────┘ │
                   │  [Executive Summary]         │
                   │  [Smart Recommendations]     │
                   │  [Suite Browser (collapse)]  │
                   │  [Export PDF]                │
                   └──────────────┬───────────────┘
          ┌───────────────────────┼──────────────────────┐
          │                       │                      │
          ▼                       ▼                      ▼
┌─────────────────┐  ┌─────────────────────┐  ┌────────────────────┐
│ /analysis/:id/  │  │   /trends           │  │  /failures         │
│ category/:status│  │                     │  │                    │
│ (DrillDown)     │  │  Avg Pass Rate      │  │  Failure Heatmap   │
│                 │  │  TrendsLineChart    │  │  (15 tests × runs) │
│ Filter by:      │  │  DurationTrend      │  │                    │
│ • status pill   │  │  Report History     │  │  Flakiness List    │
│ • error type    │  │  ↑↓ trend arrows    │  │  Suite Health Bar  │
│                 │  │  Business Insights  │  │  Error Evolution   │
│ TestCard list   │  │  Delete reports     │  │  (stacked area)    │
│ • stack trace   │  │                     │  │  Regression Cards  │
│ • file:line     │  │                     │  │                    │
└─────────────────┘  └─────────────────────┘  └────────────────────┘
          │                       │                      │
          └───────────────────────┴──────────────────────┘
                                  │
          ┌───────────────────────┴──────────────────────┐
          │                                              │
          ▼                                              ▼
┌─────────────────────────┐                 ┌──────────────────────┐
│  /api-scenarios         │                 │  /tenant-comparison  │
│                         │                 │                      │
│  Tests grouped by API   │                 │  Tests grouped by    │
│  Status matrix per run  │                 │  tenant identifier   │
│  API coverage view      │                 │  Divergent vs.       │
│                         │                 │  consistent status   │
└─────────────────────────┘                 └──────────────────────┘
```

---

## Parser Mapping Flow

```
                   Playwright JUnit XML report received
                               │
                               ▼
              ┌──────────────────────────────────────┐
              │  XMLParser.parse(xml) → JUnitDocument │
              │  (fast-xml-parser, attrs as @_name)   │
              └────────────────────┬───────────────────┘
                                   ▼
              ┌──────────────────────────────────────┐
              │  Root: <testsuites> (or bare          │
              │  <testsuite> for single-suite files)  │
              └────────────────────┬───────────────────┘
                                   ▼
              ┌──────────────────────────────────────┐
              │  For each <testsuite>:                │
              │  → mapTestSuite()                     │
              │    title = @_name, file from testcases│
              └────────────────────┬───────────────────┘
                                   ▼
              ┌──────────────────────────────────────┐
              │  For each <testcase>:                 │
              │  → mapTestCase()                      │
              │  status:                              │
              │   <failure>/<error> present → failed  │
              │   <skipped> present         → skipped │
              │   else                      → passed  │
              │  duration = @_time (sec) × 1000        │
              │  error = failure @_message / #text    │
              └────────────────────┬───────────────────┘
                                   ▼
                        ┌─────────────────────┐
                        │  TestSuite[] with    │
                        │  TestResult[] (app-  │
                        │  level model)        │
                        └─────────────────────┘
```

---

## Error Classification Pipeline

```
  Test Error Message (raw string)
            │
            ▼
  ┌─────────────────────────────────────────────────────────┐
  │  categorizeError(errorMessage: string): ErrorCategory   │
  │                                                         │
  │  Pattern matching via regex:                            │
  │                                                         │
  │  "expect.*toBe|toEqual|toMatch|AssertionError"          │
  │   ──────────────────────────────────────▶ assertion     │
  │                                                         │
  │  "timeout|timed out|exceeded"                           │
  │   ──────────────────────────────────────▶ timeout       │
  │                                                         │
  │  "net::|ECONNREFUSED|fetch|XMLHttpRequest|HTTP"         │
  │   ──────────────────────────────────────▶ network       │
  │                                                         │
  │  "locator|selector|not found|element|getBy"             │
  │   ──────────────────────────────────────▶ element-not-found│
  │                                                         │
  │  "TypeError|ReferenceError|SyntaxError|Cannot read"     │
  │   ──────────────────────────────────────▶ runtime       │
  │                                                         │
  │  (no match)                                             │
  │   ──────────────────────────────────────▶ application   │
  └─────────────────────────────────────────────────────────┘
            │
            ▼
  ErrorGroup[] — grouped by category with test list + count
```

---

## Frontend Component Tree

```
App.tsx (React Router)
│
├── Layout.tsx ──▶ Navbar.tsx (dark top nav, route links)
│
├── / ──────────▶ UploadPage.tsx
│                 └── ExportPDFButton (hidden)
│
├── /analysis/:id ──▶ AnalysisPage.tsx
│                     ├── StatCards (6 cards)
│                     ├── StatusDonutChart.tsx ──▶ onClick → /category/:status
│                     ├── SuiteBarChart.tsx
│                     ├── ErrorCategoryChart.tsx
│                     ├── ExecutiveSummary.tsx
│                     ├── SmartRecommendations.tsx
│                     ├── Suite list (collapsible rows)
│                     │   └── TestRow (expandable stack trace)
│                     └── ExportPDFButton.tsx ──▶ pdfExport.ts
│
├── /analysis/:id/category/:status ──▶ DrillDownPage.tsx
│                     ├── Status filter pills
│                     ├── Error category pills
│                     └── TestCard[] (file, line, error, stack)
│
├── /trends ──────▶ TrendsPage.tsx
│                   ├── Summary metric cards
│                   ├── TrendsLineChart.tsx
│                   ├── DurationTrendChart.tsx
│                   ├── Report history table (↑↓ trend, delete)
│                   └── BusinessInsights.tsx
│
├── /failures ────▶ FailurePatternsPage.tsx
│                   ├── Summary cards (regressions, flaky, worst suite)
│                   ├── FailureHeatmap (15 tests × last 10 runs)
│                   ├── FlakinessList
│                   ├── BarChart (suite health)
│                   ├── AreaChart (error evolution)
│                   └── RegressionCards (with stack traces)
│
├── /api-scenarios ──▶ ApiScenariosPage.tsx
│                      └── API test matrix grid
│
└── /tenant-comparison ──▶ TenantComparisonPage.tsx
                           └── Tenant status comparison matrix
```

---

## Technology Stack

```
┌──────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
│                                                                  │
│  ┌─────────┐  ┌──────────┐  ┌────────────┐  ┌──────────────┐   │
│  │ React   │  │   Vite   │  │ TypeScript │  │ Tailwind CSS │   │
│  │  18.2   │  │   5.0    │  │    5.3     │  │     3.4      │   │
│  └─────────┘  └──────────┘  └────────────┘  └──────────────┘   │
│                                                                  │
│  ┌─────────────┐  ┌──────────┐  ┌───────┐  ┌──────────────┐   │
│  │React Router │  │Recharts  │  │ Axios │  │    jsPDF     │   │
│  │    6.21     │  │   2.10   │  │  1.6  │  │     4.2      │   │
│  └─────────────┘  └──────────┘  └───────┘  └──────────────┘   │
│                                                                  │
│  ┌──────────────┐  ┌──────────┐  ┌─────────┐                   │
│  │ Lucide Icons │  │ date-fns │  │  clsx   │                   │
│  │    0.312     │  │   3.2    │  │   2.1   │                   │
│  └──────────────┘  └──────────┘  └─────────┘                   │
└──────────────────────────────────────────────────────────────────┘
                              │
                        REST API (Axios)
                              │
┌──────────────────────────────────────────────────────────────────┐
│                          BACKEND                                 │
│                                                                  │
│  ┌────────────┐  ┌──────────┐  ┌────────┐  ┌──────────────┐    │
│  │ Express.js │  │   tsx    │  │ Multer │  │    Helmet    │    │
│  │    4.18    │  │  (dev)   │  │  1.4   │  │     7.1      │    │
│  └────────────┘  └──────────┘  └────────┘  └──────────────┘    │
│                                                                  │
│  ┌──────────────────┐  ┌────────┐  ┌──────────────┐             │
│  │ fast-xml-parser  │  │  UUID  │  │   Morgan     │             │
│  │      4.5         │  │   9.0  │  │    1.10      │             │
│  └──────────────────┘  └────────┘  └──────────────┘             │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  In-Memory Repository  (→ pluggable: PostgreSQL/MongoDB)   │ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

---

## Cross-Report Analysis Flow (Failure Patterns)

```
All Stored Reports
       │
       ▼  buildPatterns()
       │
       ├──▶ Group tests by name across reports
       │         │
       │         ├──▶ HEATMAP: top 15 failing tests × last 10 runs
       │         │    Cell color: passed=green, failed=red, skipped=gray
       │         │
       │         ├──▶ FLAKINESS: tests where status oscillates
       │         │    pass→fail or fail→pass across consecutive runs
       │         │
       │         └──▶ REGRESSIONS: tests that were passing in
       │              earlier date group, now failing in latest
       │
       ├──▶ Group tests by suite name
       │         └──▶ SUITE HEALTH: aggregated failure rate per suite
       │              → BarChart
       │
       └──▶ Group errors by category per report date
                 └──▶ ERROR EVOLUTION: count per category over time
                      → Stacked AreaChart
```

---

## User Journey

```
QA Engineer                         System

    │  "I ran my Playwright tests"      │
    │  Has: results.xml (JUnit)         │
    │                                   │
    ├──── Opens localhost:5173 ────────▶│
    │                                   │ UploadPage renders
    │◀─── Drag-drop zone appears ───────┤
    │                                   │
    ├──── Drops .xml file ─────────────▶│
    │                                   │ Parses JUnit XML
    │                                   │ Categorizes errors
    │     Progress bar fills            │ Saves to memory
    │◀─── 201 Created ──────────────────┤
    │                                   │
    │◀─── Redirect to /analysis/:id ────┤
    │                                   │
    │  "I see stats + charts"           │
    │  Total: 247  Pass: 201  Fail: 46  │
    │                                   │
    ├──── Clicks red segment (Fail) ───▶│
    │                                   │
    │◀─── /category/failed page ────────┤
    │  Sees 46 failed test cards        │
    │  Filters by "timeout" ────────────┤
    │  Down to 12 tests                 │
    │  Reads stack traces               │
    │                                   │
    ├──── Navigates to /trends ────────▶│
    │◀─── Pass-rate history chart ──────┤
    │  "Rate dropped from 89%→67%"      │
    │                                   │
    ├──── Navigates to /failures ──────▶│
    │◀─── Heatmap + regression list ────┤
    │  "test_login flaky for 5 runs"    │
    │                                   │
    ├──── Clicks Export PDF ───────────▶│
    │◀─── Downloads report.pdf ─────────┤
    │  Quality grade: B+                │
    │  Shares with team                 │
```

---

## REST API Contract

```
┌──────────────────────────────────────────────────────────────────┐
│  POST   /api/reports/upload                                      │
│  Body:  multipart/form-data { file: .xml (max 50MB) }           │
│  Resp:  201 { id: uuid, name: string, stats: TestStats }        │
├──────────────────────────────────────────────────────────────────┤
│  GET    /api/reports                                             │
│  Resp:  200 ReportSummary[] (sorted by date DESC)               │
│         [ { id, name, uploadedAt, stats } ]                     │
├──────────────────────────────────────────────────────────────────┤
│  GET    /api/reports/:id                                         │
│  Resp:  200 ParsedReport (full: suites[], errorGroups[])        │
│         404 { error: "Report not found" }                       │
├──────────────────────────────────────────────────────────────────┤
│  DELETE /api/reports/:id                                         │
│  Resp:  204 No Content                                           │
│         404 { error: "Report not found" }                       │
├──────────────────────────────────────────────────────────────────┤
│  GET    /health                                                  │
│  Resp:  200 { status: "ok", timestamp: ISO-string }             │
└──────────────────────────────────────────────────────────────────┘
```

---

## Security & Resilience Layers

```
Request arrives
      │
      ▼
┌─────────────┐     ✓ XSS/clickjacking headers set
│   Helmet    │────▶ X-Content-Type, X-Frame-Options, CSP
└──────┬──────┘
       ▼
┌─────────────┐     ✓ Only http://localhost:5173 allowed
│    CORS     │────▶ Blocks cross-origin abuse
└──────┬──────┘
       ▼
┌─────────────┐     ✓ Max 200 requests per 15 minutes
│ Rate Limit  │────▶ 429 Too Many Requests if exceeded
└──────┬──────┘
       ▼
┌─────────────┐     ✓ extension check: .xml only
│ File Valid. │────▶ max size: 50 MB
└──────┬──────┘
       ▼
┌─────────────┐     ✓ async errors caught globally
│   Parser    │────▶ XML parse wrapped in try/catch
└──────┬──────┘
       ▼
┌─────────────┐     ✓ User-friendly error messages
│  Response   │────▶ 400/404/500 with JSON error body
└─────────────┘
```

---

## How to Run

```bash
# 1. Install dependencies
.\install.ps1

# 2. Start both servers
.\start.ps1
#    → Backend:  http://localhost:4000
#    → Frontend: http://localhost:5173

# 3. Upload a Playwright JUnit XML report (`--reporter=junit`) and explore!
```

---

*Generated: 2026-07-10 | Project: Playwright Report Analyzer*
