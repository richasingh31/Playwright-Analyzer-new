"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const reports_routes_1 = __importDefault(require("./routes/reports.routes"));
const app = (0, express_1.default)();
const PORT = process.env.PORT ?? 4000;
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
}));
app.use((0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { error: 'Too many requests — please try again later.' },
}));
app.use((0, morgan_1.default)('dev'));
app.use(express_1.default.json());
app.use('/api/reports', reports_routes_1.default);
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
// Global error handler
app.use((err, _req, res, _next) => {
    console.error(err);
    res
        .status(err.status ?? 500)
        .json({ error: err.message ?? 'Internal server error.' });
});
app.listen(PORT, () => {
    console.log(`\n🚀  Playwright Analyzer API  →  http://localhost:${PORT}\n`);
});
