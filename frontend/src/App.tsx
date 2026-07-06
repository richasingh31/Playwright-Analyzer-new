import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { UploadPage } from './pages/UploadPage';
import { AnalysisPage } from './pages/AnalysisPage';
import { DrillDownPage } from './pages/DrillDownPage';
import { TrendsPage } from './pages/TrendsPage';
import { FailurePatternsPage } from './pages/FailurePatternsPage';
import { ApiScenariosPage } from './pages/ApiScenariosPage';
import { TenantComparisonPage } from './pages/TenantComparisonPage';

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<UploadPage />} />
          <Route path="/analysis/:id" element={<AnalysisPage />} />
          <Route path="/analysis/:id/category/:status" element={<DrillDownPage />} />
          <Route path="/trends" element={<TrendsPage />} />
          <Route path="/failures" element={<FailurePatternsPage />} />
          <Route path="/api-scenarios" element={<ApiScenariosPage />} />
          <Route path="/tenant-comparison" element={<TenantComparisonPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
