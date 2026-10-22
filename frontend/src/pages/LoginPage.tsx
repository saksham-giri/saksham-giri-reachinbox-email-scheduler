import type { FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Navigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../api/endpoints';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Field';
import { FullPageSpinner } from '../components/ui/Spinner';
import { useAuth } from '../context/AuthContext';

const errorMessages: Record<string, string> = {
  access_denied: 'Google sign-in was cancelled.',
  invalid_state: 'Your sign-in session expired. Please try again.',
};

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-6 w-6" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function LoginPage() {
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  const error = params.get('error');

  if (loading) return <FullPageSpinner />;
  if (user) return <Navigate to="/dashboard" replace />;

  // Only Google sign-in is backed by the API; the email form is part of the
  // design, so it is kept and points people to Google.
  const onEmailLogin = (e: FormEvent) => {
    e.preventDefault();
    toast('Email login is not available yet. Please continue with Google.', { icon: 'ℹ️' });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-white p-4">
      <div className="w-full max-w-[480px] rounded-2xl border border-gray-200 px-6 py-12 sm:px-14">
        <h1 className="mb-8 text-center text-4xl font-bold text-gray-900">Login</h1>

        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{errorMessages[error] ?? 'Sign-in failed. Please try again.'}</p>
        )}

        <a
          href={authApi.googleLoginUrl}
          className="flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-brand-50 text-[17px] text-gray-900 transition-colors hover:bg-brand-100"
        >
          <GoogleIcon />
          Login with Google
        </a>

        <div className="my-7 flex items-center gap-4 text-sm tracking-wide text-gray-400">
          <span className="h-px flex-1 bg-gray-200" />
          or sign up through email
          <span className="h-px flex-1 bg-gray-200" />
        </div>

        <form onSubmit={onEmailLogin} className="flex flex-col gap-3">
          <Input type="email" name="email" placeholder="Email ID" autoComplete="email" />
          <Input type="password" name="password" placeholder="Password" autoComplete="current-password" />
          <Button type="submit" size="lg" className="mt-5 w-full !rounded-xl text-[17px] font-normal">
            Login
          </Button>
        </form>
      </div>
    </div>
  );
}
