import { useState } from 'react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';

export default function LoginView({ onSignIn }) {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await onSignIn(String(form.get('email')), String(form.get('password')));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-almost-white font-sans text-black">
      <div className="grid flex-1 place-items-center p-8">
        <form onSubmit={submit} className="flex w-full max-w-[400px] flex-col gap-5 border border-hairline bg-white p-8">
          <div className="flex flex-col gap-1">
            <h1 className="text-[28px] font-bold">Jarvis</h1>
            <div className="text-sm text-secondary">Product Support Copilot for SubPilot · Omena employees only</div>
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Email
            <Input type="email" name="email" required autoComplete="username" placeholder="you@omena.example" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Password
            <Input type="password" name="password" required autoComplete="current-password" />
          </label>
          {error && <div role="alert" className="text-sm text-negative">{error}</div>}
          <Button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
        </form>
      </div>
    </div>
  );
}
