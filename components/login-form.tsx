'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';

export function LoginForm() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [isSigningIn, setIsSigningIn] = useState(false);

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors([]);
    setIsSigningIn(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      setErrors([error.message]);
      setIsSigningIn(false);
      return;
    }

    router.replace('/');
    router.refresh();
  }

  return (
    <form className="auth-form" onSubmit={handleSignIn}>
      <label className="field auth-field">
        <span>Email</span>
        <input
          type="email"
          placeholder="you@company.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>
      <label className="field auth-field">
        <span>Password</span>
        <input
          type="password"
          placeholder="Enter your password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>
      {errors.length > 0 ? (
        <ul className="warning-list">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
      <button className="primary-button auth-submit" type="submit" disabled={isSigningIn}>
        {isSigningIn ? 'Signing in…' : 'Get Started'}
      </button>
    </form>
  );
}

