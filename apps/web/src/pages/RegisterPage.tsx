import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Field, Input } from '../components/ui';
import { AuthLayout } from './AuthLayout';

export function RegisterPage({ isSetup = false }: { isSetup?: boolean }) {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await register({ email, password, name: name.trim() || undefined });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to create your account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title={isSetup ? 'Welcome — set up your admin account' : 'Create your account'}
      subtitle={
        isSetup
          ? 'This is the first account for your Ping Monitor instance. It becomes the owner.'
          : 'Set up monitoring in less than a minute.'
      }
      footer={
        isSetup ? null : (
          <>
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </>
        )
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-down/20 bg-down/10 px-3 py-2 text-sm text-down">
            {error}
          </div>
        )}
        <Field label="Name" hint="Optional — how we should greet you.">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ada Lovelace"
            autoFocus
          />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <Input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </Field>
        <Button type="submit" size="lg" fullWidth loading={loading}>
          {isSetup ? 'Create admin account' : 'Create account'}
        </Button>
      </form>
    </AuthLayout>
  );
}
