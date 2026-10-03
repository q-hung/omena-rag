import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import DemoBanner from '../../components/DemoBanner';

// Prototype login: any input signs in (AUTH-01 is simulated).
export default function LoginView({ onSignIn }) {
  const submit = (e) => { e.preventDefault(); onSignIn(); };
  return (
    <div className="flex min-h-screen flex-col bg-almost-white font-sans text-black">
      <DemoBanner />
      <div className="grid flex-1 place-items-center p-8">
        <form onSubmit={submit} className="flex w-full max-w-[400px] flex-col gap-5 border border-hairline bg-white p-8">
          <div className="flex flex-col gap-1">
            <h1 className="text-[28px] font-bold">Jarvis</h1>
            <div className="text-sm text-secondary">Product Support Copilot for SubPilot · Omena employees only</div>
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Email
            <Input type="email" name="email" autoComplete="username" placeholder="you@omena.example" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Password
            <Input type="password" name="password" autoComplete="current-password" />
          </label>
          <button type="submit" className="hidden" />
          <Button onClick={submit}>Sign in</Button>
          <div className="text-xs leading-[1.45] text-muted">Prototype — no real authentication. Any input signs you in.</div>
        </form>
      </div>
    </div>
  );
}
