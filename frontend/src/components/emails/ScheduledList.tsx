import { useEffect, useState } from 'react';
import { fetchApi } from '../../services/apiClient';
import type { EmailJob } from '../../types';
import { format } from 'date-fns';
import { Star } from 'lucide-react';

export default function ScheduledList() {
  const [jobs, setJobs] = useState<EmailJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchApi<EmailJob[]>('/emails/scheduled');
      setJobs(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load scheduled emails');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse flex items-center justify-between p-4 border-b border-gray-100">
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 rounded w-8"></div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="text-red-500 font-medium mb-2">Failed to load</div>
        <div className="text-sm text-gray-500">{error}</div>
        <button onClick={fetchJobs} className="mt-4 text-sm text-[#28A745] hover:underline">Try Again</button>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
          <Star className="w-6 h-6 text-gray-300" />
        </div>
        <div className="text-gray-900 font-medium mb-1">No scheduled emails</div>
        <div className="text-sm text-gray-500">Your scheduled emails will appear here.</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {jobs.map((job) => (
        <div key={job.id} className="group flex items-center p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer">
          <div className="w-48 shrink-0 text-sm font-medium text-gray-900 truncate">
            To: {job.recipientEmail}
          </div>
          
          <div className="flex-1 min-w-0 flex items-center space-x-3">
            {/* Status / Time Badge */}
            <div className="shrink-0 flex items-center space-x-1.5 px-2.5 py-1 bg-[#FEF3C7] text-yellow-800 rounded-md text-[11px] font-semibold whitespace-nowrap">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{format(new Date(job.scheduledTime), 'EEE h:mm:ss a')}</span>
            </div>
            
            {/* Subject preview */}
            <div className="truncate text-sm">
              <span className="font-semibold text-gray-900">{job.subject || 'No Subject'}</span>
              <span className="text-gray-400 mx-1">-</span>
              <span className="text-gray-500">{job.status === 'PROCESSING' ? 'Processing now...' : 'Scheduled for delivery'}</span>
            </div>
          </div>

          <div className="shrink-0 ml-4">
            <Star className="w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors" />
          </div>
        </div>
      ))}
    </div>
  );
}
