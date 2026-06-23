"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const parser_service_1 = require("../services/parser.service");
const store_1 = require("../storage/store");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype === 'text/html' ||
            file.originalname.toLowerCase().endsWith('.html')) {
            cb(null, true);
        }
        else {
            cb(new Error('Only Playwright HTML report files are accepted.'));
        }
    },
});
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
// POST /api/reports/upload
router.post('/upload', upload.single('report'), wrap(async (req, res) => {
    if (!req.file) {
        res.status(400).json({ error: 'No file provided.' });
        return;
    }
    const report = await (0, parser_service_1.parsePlaywrightReport)(req.file.buffer, req.file.originalname);
    await store_1.reportRepository.save(report);
    res.status(201).json({ id: report.id, name: report.name, stats: report.stats });
}));
// GET /api/reports
router.get('/', wrap(async (_req, res) => {
    const reports = await store_1.reportRepository.findAll();
    res.json(reports);
}));
// GET /api/reports/:id
router.get('/:id', wrap(async (req, res) => {
    const report = await store_1.reportRepository.findById(req.params.id);
    if (!report) {
        res.status(404).json({ error: 'Report not found.' });
        return;
    }
    res.json(report);
}));
// DELETE /api/reports/:id
router.delete('/:id', wrap(async (req, res) => {
    const deleted = await store_1.reportRepository.delete(req.params.id);
    if (!deleted) {
        res.status(404).json({ error: 'Report not found.' });
        return;
    }
    res.status(204).send();
}));
exports.default = router;
