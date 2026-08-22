import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Paperclip, Clock, Upload, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Papa from 'papaparse';
import { fetchApi } from '../../services/apiClient';
import type { Sender, ScheduleRequest } from '../../types';

export default function ComposePage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [senders, setSenders] = useState<Sender[]>([]);
  const [loadingSenders, setLoadingSenders] = useState(true);
  
  // Form State
  const [senderId, setSenderId] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [delayMs, setDelayMs] = useState(5000);
  const [hourlyLimit, setHourlyLimit] = useState(100);
  const [scheduleDate, setScheduleDate] = useState(() => {
    // Default to right now so delays apply immediately
    const d = new Date();
    // Format for datetime-local input YYYY-MM-DDThh:mm
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);

  useEffect(() => {
    loadSenders();
  }, []);

  const loadSenders = async () => {
    try {
      const data = await fetchApi<Sender[]>('/senders');
      setSenders(data);
      if (data.length > 0) setSenderId(data[0].id);
    } catch (err: any) {
      setError(err.message || 'Failed to load senders');
    } finally {
      setLoadingSenders(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvError(null);

    const ext = file.name.split('.').pop()?.toLowerCase();
    
    if (ext === 'csv') {
      Papa.parse(file, {
        complete: (results) => {
          extractEmails(results.data.flat());
        },
        error: (err) => {
          setCsvError(`CSV Error: ${err.message}`);
        }
      });
    } else if (ext === 'txt') {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target?.result as string;
        extractEmails(text.split(/\s+|,/));
      };
      reader.readAsText(file);
    } else {
      setCsvError('Unsupported file type. Please upload a .csv or .txt file.');
    }
    
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const extractEmails = (strings: any[]) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const extracted: string[] = [];
    
    for (const item of strings) {
      if (typeof item === 'string') {
        const cleaned = item.trim();
        if (emailRegex.test(cleaned)) {
          extracted.push(cleaned);
        }
      }
    }

    if (extracted.length === 0) {
      setCsvError('No valid email addresses found in the file.');
      return;
    }

    // Deduplicate
    const uniqueEmails = Array.from(new Set([...recipients, ...extracted]));
    setRecipients(uniqueEmails);
  };

  const removeRecipient = (emailToRemove: string) => {
    setRecipients(recipients.filter(email => email !== emailToRemove));
  };

  const handleSubmit = async () => {
    setError(null);
    if (!senderId) return setError('Please select a sender');
    if (!subject.trim()) return setError('Subject is required');
    if (!body.trim()) return setError('Body is required');
    if (recipients.length === 0) return setError('At least one recipient is required');
    if (delayMs < 0) return setError('Delay must be a positive number');
    if (hourlyLimit <= 0) return setError('Hourly limit must be greater than 0');
    if (!scheduleDate) return setError('Please select a scheduled time');

    const startTime = new Date(scheduleDate).toISOString();

    const payload: ScheduleRequest = {
      senderId,
      subject: subject.trim(),
      body: body.trim(),
      recipients,
      startTime,
      delayMs: Number(delayMs),
      hourlyLimit: Number(hourlyLimit)
    };

    setIsSubmitting(true);
    try {
      await fetchApi('/emails/schedule', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      setSuccess(true);
      setTimeout(() => navigate('/'), 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to schedule emails');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-200">
      {/* Compose Header */}
      <div className="flex items-center justify-between pb-6 border-b border-gray-100 mb-6">
        <button onClick={() => navigate(-1)} className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors font-medium">
          <ArrowLeft className="w-5 h-5" />
          <span>Compose New Email</span>
        </button>
        <div className="flex items-center space-x-4">
          <button className="text-gray-400 hover:text-gray-600"><Paperclip className="w-5 h-5" /></button>
          
          <div className="relative">
             <input 
               type="datetime-local" 
               className="absolute inset-0 opacity-0 cursor-pointer w-full"
               value={scheduleDate}
               onChange={(e) => setScheduleDate(e.target.value)}
             />
             <button className="text-gray-400 hover:text-gray-600 flex items-center"><Clock className="w-5 h-5" /></button>
          </div>

          <button 
            onClick={handleSubmit}
            disabled={isSubmitting || success}
            className="flex items-center space-x-2 bg-white border border-[#28A745] text-[#28A745] hover:bg-[#28A745]/5 px-4 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-50"
          >
            <span>{isSubmitting ? 'Scheduling...' : success ? 'Scheduled!' : 'Send Later'}</span>
          </button>
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm border border-red-100">{error}</div>}

      {/* Compose Form */}
      <div className="flex-1 overflow-auto">
        <div className="space-y-6 max-w-4xl">
          
          {/* From */}
          <div className="flex items-center border-b border-gray-100 pb-2">
            <span className="w-16 text-gray-400 text-sm">From</span>
            {loadingSenders ? (
              <span className="text-sm text-gray-400">Loading...</span>
            ) : senders.length === 0 ? (
              <span className="text-sm text-red-500">No senders available. Please add one in settings.</span>
            ) : (
              <select 
                value={senderId} 
                onChange={(e) => setSenderId(e.target.value)}
                className="bg-gray-50 border border-gray-200 text-sm rounded-md px-3 py-1.5 outline-none focus:ring-2 focus:ring-[#28A745]/30"
              >
                {senders.map(s => (
                  <option key={s.id} value={s.id}>{s.senderEmail} {s.displayName ? `(${s.displayName})` : ''}</option>
                ))}
              </select>
            )}
          </div>

          {/* To */}
          <div className="flex items-start border-b border-gray-100 pb-2">
            <span className="w-16 text-gray-400 text-sm mt-1.5">To</span>
            <div className="flex-1 flex flex-col">
              <div className="flex flex-wrap gap-2 min-h-[36px] items-center">
                {recipients.map(email => (
                  <div key={email} className="flex items-center bg-[#E2F1DF] text-gray-800 text-xs px-2.5 py-1 rounded-full border border-[#D5E9D1]">
                    <span>{email}</span>
                    <button onClick={() => removeRecipient(email)} className="ml-1.5 text-gray-500 hover:text-gray-800"><X className="w-3 h-3" /></button>
                  </div>
                ))}
                <input
                  type="email"
                  placeholder={recipients.length === 0 ? "recipient@example.com" : "Add another..."}
                  className="flex-1 min-w-[150px] outline-none text-sm text-gray-900 bg-transparent placeholder:text-gray-400 py-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
                      e.preventDefault();
                      const val = e.currentTarget.value.trim().replace(',', '');
                      if (val && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) && !recipients.includes(val)) {
                        setRecipients([...recipients, val]);
                        e.currentTarget.value = '';
                      }
                    }
                  }}
                  onBlur={(e) => {
                    const val = e.currentTarget.value.trim().replace(',', '');
                    if (val && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) && !recipients.includes(val)) {
                      setRecipients([...recipients, val]);
                      e.currentTarget.value = '';
                    }
                  }}
                />
              </div>
              {csvError && <span className="text-xs text-red-500 mt-1">{csvError}</span>}
              {recipients.length > 0 && <span className="text-xs text-[#28A745] mt-1 font-medium">Detected {recipients.length} unique email(s)</span>}
            </div>
            
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              accept=".csv,.txt" 
              className="hidden" 
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center space-x-1.5 text-[#28A745] hover:text-[#218838] text-sm font-medium transition-colors"
            >
              <Upload className="w-4 h-4" />
              <span>Upload List</span>
            </button>
          </div>

          {/* Subject */}
          <div className="flex items-center border-b border-gray-100 pb-2">
            <span className="w-16 text-gray-400 text-sm">Subject</span>
            <input 
              type="text" 
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="flex-1 outline-none text-sm font-medium text-gray-900 placeholder:text-gray-400"
            />
          </div>

          {/* Rate Limiting */}
          <div className="flex items-center space-x-6 py-2">
            <div className="flex items-center space-x-3">
              <span className="text-sm font-medium text-gray-700">Delay between 2 emails</span>
              <div className="relative">
                <input 
                  type="number" 
                  value={delayMs}
                  onChange={(e) => setDelayMs(Number(e.target.value))}
                  className="w-20 bg-gray-50 border border-gray-200 rounded-md text-sm px-2 py-1 outline-none focus:ring-1 focus:ring-[#28A745]"
                />
                <span className="absolute right-2 top-1.5 text-xs text-gray-400">ms</span>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <span className="text-sm font-medium text-gray-700">Hourly Limit</span>
              <input 
                type="number" 
                value={hourlyLimit}
                onChange={(e) => setHourlyLimit(Number(e.target.value))}
                className="w-20 bg-gray-50 border border-gray-200 rounded-md text-sm px-2 py-1 outline-none focus:ring-1 focus:ring-[#28A745]"
              />
            </div>
          </div>

          {/* Rich Text Editor Mock */}
          <div className="border border-gray-100 rounded-xl bg-gray-50 overflow-hidden flex flex-col" style={{ minHeight: '300px' }}>
            <div className="flex items-center px-4 py-2 border-b border-gray-200 bg-white space-x-4 overflow-x-auto">
              <span className="text-gray-400 font-serif font-bold italic">T</span>
              <span className="text-gray-400 font-bold">B</span>
              <span className="text-gray-400 italic font-serif">I</span>
              <span className="text-gray-400 underline">U</span>
              <div className="w-px h-4 bg-gray-200"></div>
              {/* Other mock editor icons could go here */}
            </div>
            <textarea 
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Type Your Reply..."
              className="flex-1 w-full bg-transparent p-4 outline-none resize-none text-sm text-gray-800"
            />
          </div>
          
        </div>
      </div>
    </div>
  );
}
