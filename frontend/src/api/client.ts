import axios from 'axios';
import type { ParsedReport, ReportSummary, UploadResponse } from '../types';

const http = axios.create({ baseURL: '/api', timeout: 30_000 });

http.interceptors.response.use(
  (r) => r,
  (err) => {
    const msg: string =
      err.response?.data?.error ?? err.message ?? 'Unexpected error';
    return Promise.reject(new Error(msg));
  },
);

export const reportsApi = {
  upload: async (file: File, onProgress?: (pct: number) => void): Promise<UploadResponse> => {
    const fd = new FormData();
    fd.append('report', file);
    const { data } = await http.post<UploadResponse>('/reports/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
      },
    });
    return data;
  },

  getAll: async (): Promise<ReportSummary[]> => {
    const { data } = await http.get<ReportSummary[]>('/reports');
    return data;
  },

  getById: async (id: string): Promise<ParsedReport> => {
    const { data } = await http.get<ParsedReport>(`/reports/${id}`);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await http.delete(`/reports/${id}`);
  },
};
