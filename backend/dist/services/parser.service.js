"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsePlaywrightReport = parsePlaywrightReport;
const cheerio = __importStar(require("cheerio"));
const zlib = __importStar(require("zlib"));
const adm_zip_1 = __importDefault(require("adm-zip"));
const uuid_1 = require("uuid");
// ── Error categorisation ──────────────────────────────────────────────────────
const ERROR_PATTERNS = [
    {
        pattern: /expect\s*\(|toBe\(|toEqual\(|toContain\(|AssertionError|assertion failed/i,
        category: 'assertion',
    },
    {
        pattern: /timeout|timed out|exceeded.*timeout|waiting.*\d+ms/i,
        category: 'timeout',
    },
    {
        pattern: /net::|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|network|http.*error|xhr/i,
        category: 'network',
    },
    {
        pattern: /element.*not found|locator.*resolve|waiting for selector|no element.*match|strict mode violation|Target closed/i,
        category: 'element-not-found',
    },
    {
        pattern: /TypeError|ReferenceError|SyntaxError|RangeError|is not a function|Cannot read/i,
        category: 'runtime',
    },
];
function categorizeError(message) {
    for (const { pattern, category } of ERROR_PATTERNS) {
        if (pattern.test(message))
            return category;
    }
    return 'unknown';
}
// ── Decompression helpers ─────────────────────────────────────────────────────
function tryDecompress(base64) {
    try {
        const buf = Buffer.from(base64.trim(), 'base64');
        try {
            return zlib.gunzipSync(buf).toString('utf-8');
        }
        catch {
            return zlib.inflateRawSync(buf).toString('utf-8');
        }
    }
    catch {
        return null;
    }
}
// ── ZIP extraction (PW ≥ 1.44 — script id="playwrightReportBase64") ─────────
function extractFromZip(html) {
    const $ = cheerio.load(html);
    const zipScript = $('#playwrightReportBase64');
    if (!zipScript.length)
        return null;
    const raw = (zipScript.html() ?? '').trim();
    const dataUriPrefix = 'data:application/zip;base64,';
    const b64 = raw.startsWith(dataUriPrefix) ? raw.slice(dataUriPrefix.length) : raw;
    if (!b64)
        return null;
    try {
        const buf = Buffer.from(b64, 'base64');
        const zip = new adm_zip_1.default(buf);
        const reportEntry = zip.getEntry('report.json');
        if (!reportEntry)
            return null;
        const report = JSON.parse(reportEntry.getData().toString('utf-8'));
        // Merge detailed test results from individual file JSONs
        if (report.files) {
            report.files = report.files.map((fileEntry) => {
                const fileId = fileEntry.fileId;
                if (!fileId)
                    return fileEntry;
                const detailEntry = zip.getEntry(`${fileId}.json`);
                if (!detailEntry)
                    return fileEntry;
                try {
                    const detail = JSON.parse(detailEntry.getData().toString('utf-8'));
                    // Normalise errors array → error object that mapTests expects
                    if (detail.tests) {
                        fileEntry.tests = detail.tests.map(normalizeZipTest);
                    }
                }
                catch { /* keep fileEntry as-is */ }
                return fileEntry;
            });
        }
        return report;
    }
    catch {
        return null;
    }
}
function normalizeZipTest(t) {
    return {
        testId: t.testId,
        title: t.title,
        projectName: t.projectName,
        location: t.location,
        outcome: t.outcome,
        path: t.path,
        ok: t.ok,
        results: t.results.map((r) => ({
            duration: r.duration,
            status: r.status,
            retry: r.retry,
            error: r.errors?.[0]
                ? { message: r.errors[0].message, stack: r.errors[0].stack, value: r.errors[0].value }
                : undefined,
        })),
    };
}
// ── HTML → JSON extraction (handles multiple PW versions) ────────────────────
function extractReportJson(html) {
    // Strategy 1 (PW ≥ 1.44): ZIP blob in <script id="playwrightReportBase64">
    const zipResult = extractFromZip(html);
    if (zipResult)
        return zipResult;
    const $ = cheerio.load(html);
    const scripts = [];
    $('script').each((_, el) => {
        const content = $(el).html();
        if (content)
            scripts.push(content);
    });
    // Strategy 2: base64+gzip variable (PW ≥ 1.22)
    const base64VarPatterns = [
        /window\.playwrightReportBase64\s*=\s*["']([A-Za-z0-9+/=\r\n]+)["']/,
        /window\.__pw_report_data\s*=\s*["']([A-Za-z0-9+/=\r\n]+)["']/,
        /reportBase64\s*=\s*["']([A-Za-z0-9+/=\r\n]+)["']/,
    ];
    for (const script of scripts) {
        for (const re of base64VarPatterns) {
            const m = script.match(re);
            if (m?.[1]) {
                const raw = tryDecompress(m[1]);
                if (raw) {
                    try {
                        return JSON.parse(raw);
                    }
                    catch { /* try next */ }
                }
            }
        }
        // Strategy 3: direct JSON variable
        const directPatterns = [
            /window\.__PLAYWRIGHT_REPORT__\s*=\s*(\{[\s\S]*?\});\s*(?:window|<\/script>)/,
            /window\.__pw_report\s*=\s*(\{[\s\S]*?\});\s*(?:window|<\/script>)/,
        ];
        for (const re of directPatterns) {
            const m = script.match(re);
            if (m?.[1]) {
                try {
                    return JSON.parse(m[1]);
                }
                catch { /* try next */ }
            }
        }
    }
    // Strategy 4: script tag with data id
    const tagged = $('#reactData, #reportData, [data-playwright-report]').html();
    if (tagged) {
        try {
            return JSON.parse(tagged);
        }
        catch { /* fall through */ }
    }
    return null;
}
// ── Data mapping ──────────────────────────────────────────────────────────────
function outcomeToStatus(outcome, rawStatus) {
    if (outcome === 'flaky')
        return 'flaky';
    if (outcome === 'skipped' ||
        rawStatus === 'skipped')
        return 'skipped';
    if (outcome === 'unexpected' ||
        rawStatus === 'failed' ||
        rawStatus === 'timedout' ||
        rawStatus === 'interrupted')
        return 'failed';
    return 'passed';
}
function mapTests(raw, file, suitePath) {
    return raw.map((t) => {
        const lastResult = t.results[t.results.length - 1];
        const status = outcomeToStatus(t.outcome, lastResult?.status);
        const rawErr = lastResult?.error;
        const errorMsg = rawErr?.message ?? rawErr?.value ?? '';
        return {
            id: t.testId ?? (0, uuid_1.v4)(),
            title: t.title,
            fullTitle: [...(t.path ?? [suitePath]), t.title].join(' › '),
            status,
            duration: lastResult?.duration ?? 0,
            error: rawErr
                ? {
                    message: errorMsg,
                    stack: rawErr.stack,
                    category: categorizeError(errorMsg),
                }
                : undefined,
            file: t.location?.file ?? file,
            line: t.location?.line,
            retries: Math.max(0, (t.results.length ?? 1) - 1),
        };
    });
}
function mapSuites(raw, parentFile = '') {
    return raw.map((s) => {
        const file = s.location?.file ?? s.file ?? s.fileName ?? parentFile;
        const childSuites = mapSuites(s.suites ?? [], file);
        const directTests = mapTests(s.tests ?? [], file, s.title);
        const allTests = [...directTests, ...childSuites.flatMap(flattenTests)];
        return {
            id: s.fileId ?? (0, uuid_1.v4)(),
            title: s.title ?? s.fileName ?? file,
            file,
            tests: directTests,
            suites: childSuites,
            stats: {
                total: allTests.length,
                passed: allTests.filter((t) => t.status === 'passed').length,
                failed: allTests.filter((t) => t.status === 'failed').length,
                skipped: allTests.filter((t) => t.status === 'skipped').length,
                flaky: allTests.filter((t) => t.status === 'flaky').length,
            },
        };
    });
}
function flattenTests(suite) {
    return [
        ...suite.tests,
        ...suite.suites.flatMap(flattenTests),
    ];
}
function buildErrorGroups(suites) {
    const allFailed = suites
        .flatMap(flattenTests)
        .filter((t) => (t.status === 'failed' || t.status === 'flaky') && t.error);
    const grouped = new Map();
    for (const test of allFailed) {
        const cat = test.error.category;
        grouped.set(cat, [...(grouped.get(cat) ?? []), test]);
    }
    const labels = {
        assertion: 'Assertion Failures',
        timeout: 'Timeout Errors',
        network: 'Network Errors',
        'element-not-found': 'Element Not Found',
        runtime: 'Runtime Errors',
        unknown: 'Unknown Errors',
    };
    return Array.from(grouped.entries())
        .map(([category, tests]) => ({
        category,
        label: labels[category],
        count: tests.length,
        tests,
    }))
        .sort((a, b) => b.count - a.count);
}
// ── Public API ────────────────────────────────────────────────────────────────
async function parsePlaywrightReport(fileBuffer, fileName) {
    const html = fileBuffer.toString('utf-8');
    const json = extractReportJson(html);
    if (!json) {
        throw Object.assign(new Error('Unable to parse Playwright HTML report. ' +
            'Please ensure you are uploading a valid Playwright-generated HTML report.'), { status: 422 });
    }
    const rawSuites = json.files ?? json.suites ?? [];
    const suites = mapSuites(rawSuites);
    const allTests = suites.flatMap(flattenTests);
    const raw = json.stats;
    const passed = raw?.expected ?? allTests.filter((t) => t.status === 'passed').length;
    const failed = raw?.unexpected ?? allTests.filter((t) => t.status === 'failed').length;
    const skipped = raw?.skipped ?? allTests.filter((t) => t.status === 'skipped').length;
    const flaky = raw?.flaky ?? allTests.filter((t) => t.status === 'flaky').length;
    const total = raw?.total ?? allTests.length;
    const duration = raw?.duration ?? json.metadata?.duration ?? json.duration ?? 0;
    return {
        id: (0, uuid_1.v4)(),
        name: fileName.replace(/\.html?$/i, ''),
        uploadedAt: new Date(),
        stats: {
            total,
            passed,
            failed,
            skipped,
            flaky,
            duration,
            passRate: total > 0 ? Math.round((passed / total) * 100) : 0,
        },
        suites,
        errorGroups: buildErrorGroups(suites),
        metadata: {
            startTime: json.metadata?.startTime,
            workers: json.metadata?.actualWorkers,
        },
    };
}
