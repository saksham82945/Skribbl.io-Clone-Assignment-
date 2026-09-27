import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { bindSocket, useStore } from './lib/store';
import { Home } from './pages/Home';
import { RoomPage } from './pages/RoomPage';
import './index.css';

bindSocket();

function Toast() {
  const toast = useStore((s) => s.toast);
  return toast ? (
    <div className="toast" role="status">
      {toast}
    </div>
  ) : null;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/room/:roomId" element={<RoomPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toast />
    </BrowserRouter>
  </React.StrictMode>,
);
