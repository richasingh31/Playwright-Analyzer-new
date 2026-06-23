import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { parsePlaywrightReport } from '../services/parser.service';
import { reportRepository } from '../storage/store';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === 'text/html' ||
      file.originalname.toLowerCase().endsWith('.html')
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only Playwright HTML report files are accepted.'));
    }
  },
});

const wrap =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

// POST /api/reports/upload
router.post(
  '/upload',
  upload.single('report'),
  wrap(async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'No file provided.' });
      return;
    }
    const report = await parsePlaywrightReport(
      req.file.buffer,
      req.file.originalname,
    );
    await reportRepository.save(report);
    res.status(201).json({ id: report.id, name: report.name, stats: report.stats });
  }),
);

// GET /api/reports
router.get(
  '/',
  wrap(async (_req, res) => {
    const reports = await reportRepository.findAll();
    res.json(reports);
  }),
);

// GET /api/reports/:id
router.get(
  '/:id',
  wrap(async (req, res) => {
    const report = await reportRepository.findById(req.params.id);
    if (!report) {
      res.status(404).json({ error: 'Report not found.' });
      return;
    }
    res.json(report);
  }),
);

// DELETE /api/reports/:id
router.delete(
  '/:id',
  wrap(async (req, res) => {
    const deleted = await reportRepository.delete(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Report not found.' });
      return;
    }
    res.status(204).send();
  }),
);

export default router;
