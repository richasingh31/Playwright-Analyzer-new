"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportRepository = void 0;
class InMemoryReportRepository {
    constructor() {
        this.reports = new Map();
    }
    async save(report) {
        this.reports.set(report.id, report);
        return report;
    }
    async findById(id) {
        return this.reports.get(id) ?? null;
    }
    async findAll() {
        return Array.from(this.reports.values())
            .map(({ id, name, uploadedAt, stats }) => ({ id, name, uploadedAt, stats }))
            .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    }
    async delete(id) {
        return this.reports.delete(id);
    }
}
exports.reportRepository = new InMemoryReportRepository();
