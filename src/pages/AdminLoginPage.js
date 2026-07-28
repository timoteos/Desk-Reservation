import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, Eye, EyeOff } from 'lucide-react';
import Breadcrumb from '../components/Breadcrumb';
import { login } from '../api/client';
import { useAuth } from '../context/AuthContext';

const CRUMBS = [
  { label: 'Landing', path: '/' },
  { label: 'Admin Login', path: '/admin/login' },
];

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const { token, user } = await login(email.trim(), password);
      if (user.role !== 'admin') {
        setError('That account is not an administrator.');
        return;
      }
      signIn(token, user);
      navigate('/admin/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Breadcrumb crumbs={CRUMBS} />

      <div className="flex-1 flex flex-col items-center justify-center px-8 py-12 bg-gray-50">
        <div className="w-full max-w-sm flex flex-col gap-6 bg-white rounded-xl shadow-md border border-gray-100 p-8 opacity-0 animate-fade-up">

          <div className="flex flex-col items-center text-center gap-2">
            <div className="w-12 h-12 rounded-full bg-mqd-title/10 flex items-center justify-center">
              <Lock className="w-6 h-6 text-mqd-title" />
            </div>
            <h1 className="text-mqd-title text-2xl font-bold">Admin Login</h1>
            <p className="text-gray-500 text-sm">Sign in to manage desks and reservations.</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label htmlFor="admin-email" className="text-gray-700 font-medium mb-2 flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Email
              </label>
              <input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@dhs.hawaii.gov"
                required
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-mqd-btn"
              />
            </div>

            <div>
              <label htmlFor="admin-password" className="text-gray-700 font-medium mb-2 flex items-center gap-2">
                <Lock className="w-4 h-4" />
                Password
              </label>
              <div className="relative">
                <input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full border border-gray-300 rounded-lg pl-4 pr-11 py-3 text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-mqd-btn"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-mqd-title transition"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!email || !password || submitting}
              className="w-full bg-mqd-btn hover:bg-mqd-btn-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-lg text-base transition"
            >
              {submitting ? 'Signing in…' : 'Log In'}
            </button>
          </form>

        </div>
      </div>
    </>
  );
}
