
import { useAuth } from '../hooks/useAuth';
import { Navigate } from 'react-router-dom';

export default function Login() {
  const { status, loginWithGoogle } = useAuth();

  if (status === 'authenticated') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-[#F4F5F6] flex items-center justify-center p-4 font-sans">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 w-full max-w-[400px]">
        <h1 className="text-3xl font-bold text-center text-gray-900 mb-8">Login</h1>
        
        <button
          onClick={loginWithGoogle}
          className="w-full bg-[#E2F1DF] hover:bg-[#D5E9D1] transition-colors rounded-lg py-3 px-4 flex items-center justify-center relative mb-6"
        >
          <div className="absolute left-4 bg-white p-1 rounded-full">
            <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          </div>
          <span className="text-gray-700 font-medium text-sm">Login with Google</span>
        </button>

        <div className="flex items-center justify-center space-x-2 mb-6">
          <div className="flex-1 h-px bg-gray-200"></div>
          <span className="text-xs text-gray-400 font-medium uppercase px-2 tracking-wide">or sign up through email</span>
          <div className="flex-1 h-px bg-gray-200"></div>
        </div>

        <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
          <div>
            <input
              type="email"
              placeholder="Email ID"
              className="w-full bg-[#F0F0F0] text-gray-800 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-[#28A745]/30 transition-all text-sm"
              disabled
            />
          </div>
          <div>
            <input
              type="password"
              placeholder="Password"
              className="w-full bg-[#F0F0F0] text-gray-800 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-[#28A745]/30 transition-all text-sm"
              disabled
            />
          </div>
          <button
            type="button"
            className="w-full bg-[#28A745] hover:bg-[#218838] text-white font-medium rounded-lg py-3 mt-2 transition-colors text-sm"
            disabled
          >
            Login
          </button>
        </form>
      </div>
    </div>
  );
}
