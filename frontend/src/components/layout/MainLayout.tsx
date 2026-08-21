import React from 'react';
import { useAuth } from '../../hooks/useAuth';
import { NavLink, useNavigate } from 'react-router-dom';
import { Clock, Send, Search, Filter, RefreshCw } from 'lucide-react';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex h-screen bg-white font-sans text-gray-900">
      {/* Sidebar */}
      <aside className="w-64 flex flex-col border-r border-gray-100 p-6 shrink-0">
        <div className="mb-8">
          <h1 className="text-3xl font-black tracking-tighter">ONE</h1>
        </div>

        {/* User Profile */}
        <div className="flex items-center space-x-3 mb-6 p-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors relative group">
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="Avatar" className="w-10 h-10 rounded-full" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-500">
              {user?.name?.charAt(0) || 'U'}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">{user?.name}</div>
            <div className="text-xs text-gray-500 truncate">{user?.email}</div>
          </div>
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>

          {/* Logout dropdown on hover */}
          <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-100 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
            <button onClick={logout} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg">
              Logout
            </button>
          </div>
        </div>

        {/* Compose Button */}
        <button 
          className="w-full py-2.5 px-4 mb-8 text-[#28A745] font-medium text-sm border-2 border-[#28A745] rounded-full hover:bg-[#28A745]/5 transition-colors"
          onClick={() => navigate('/compose')}
        >
          Compose
        </button>

        {/* Navigation */}
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-2">Core</div>
        <nav className="flex-1 space-y-1">
          <NavLink
            to="/"
            className={({ isActive }) =>
              `flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-[#E2F1DF] text-gray-900' : 'text-gray-600 hover:bg-gray-50'
              }`
            }
          >
            <div className="flex items-center space-x-3">
              <Clock className="w-4 h-4" />
              <span>Scheduled</span>
            </div>
            {/* The count would ideally be dynamic, but omitting or keeping static for now since it's just visual unless we have an endpoint */}
            <span className="text-xs text-gray-400"></span>
          </NavLink>

          <NavLink
            to="/sent"
            className={({ isActive }) =>
              `flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-[#E2F1DF] text-gray-900' : 'text-gray-600 hover:bg-gray-50'
              }`
            }
          >
            <div className="flex items-center space-x-3">
              <Send className="w-4 h-4" />
              <span>Sent</span>
            </div>
            <span className="text-xs text-gray-400"></span>
          </NavLink>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top Header / Search */}
        <header className="h-20 flex items-center px-8 border-b border-gray-100 shrink-0">
          <div className="flex-1 flex items-center">
            <div className="relative w-full max-w-2xl flex items-center">
              <Search className="w-4 h-4 text-gray-400 absolute left-4" />
              <input
                type="text"
                placeholder="Search"
                className="w-full bg-[#F4F5F6] text-sm rounded-full py-2.5 pl-10 pr-4 outline-none focus:ring-2 focus:ring-[#28A745]/30 transition-shadow"
              />
            </div>
          </div>
          <div className="flex items-center space-x-4 ml-4">
            <button className="text-gray-400 hover:text-gray-600">
              <Filter className="w-4 h-4" />
            </button>
            <button className="text-gray-400 hover:text-gray-600">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto bg-white p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
