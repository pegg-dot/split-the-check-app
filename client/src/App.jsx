import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SessionProvider } from './context/SessionContext';
import QROverlay from './components/QROverlay';
import Welcome from './pages/Welcome';
import Home from './pages/Home';
import ScanReceipt from './pages/ScanReceipt';
import ReviewItems from './pages/ReviewItems';
import JoinSession from './pages/JoinSession';
import JoinCode from './pages/JoinCode';
import ClaimItems from './pages/ClaimItems';
import Summary from './pages/Summary';
import HostDashboard from './pages/HostDashboard';

export default function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <QROverlay />
        <Routes>
          {/* Landing */}
          <Route path="/" element={<Welcome />} />

          {/* Host flow */}
          <Route path="/setup" element={<Home />} />
          <Route path="/scan" element={<ScanReceipt />} />
          <Route path="/review" element={<ReviewItems />} />
          {/* /review now owns the full bill + tip + QR launch; /tip is legacy */}
          <Route path="/tip" element={<Navigate to="/review" replace />} />
          <Route path="/host/:sessionId" element={<HostDashboard />} />

          {/* Guest flow */}
          <Route path="/join-code" element={<JoinCode />} />
          <Route path="/session/:sessionId" element={<JoinSession />} />
          <Route path="/claim/:sessionId" element={<ClaimItems />} />

          {/* Shared */}
          <Route path="/summary/:sessionId" element={<Summary />} />
        </Routes>
      </BrowserRouter>
    </SessionProvider>
  );
}
