
import { Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from '../components/layout/MainLayout';
import ScheduledList from '../components/emails/ScheduledList';
import ComposePage from '../components/compose/ComposePage';
import SentList from '../components/emails/SentList';
import { useAuth } from '../hooks/useAuth';

export default function Dashboard() {
  const { status } = useAuth();
  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }

  if (status === 'loading') {
    return <div className="min-h-screen flex items-center justify-center bg-[#F4F5F6]">Loading...</div>;
  }

  return (
    <MainLayout>
      <div className="max-w-5xl mx-auto h-full flex flex-col">
        <Routes>
          <Route path="/" element={<ScheduledList />} />
          <Route path="/sent" element={<SentList />} />
          <Route path="/compose" element={<ComposePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </MainLayout>
  );
}
