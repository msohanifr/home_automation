import React, { useState } from 'react';
import { login as apiLogin, register as apiRegister } from '../api';

const LoginPage = ({ onAuthSuccess }) => {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data =
        mode === 'login'
          ? await apiLogin(username, password)
          : await apiRegister(username, password);

      onAuthSuccess(data);
    } catch (err) {
      console.error(err);

      // Try to surface the most useful error from the backend
      const detail =
        err.response?.data?.detail ||
        err.response?.data?.non_field_errors?.[0] ||
        err.message ||
        'Something went wrong. Please check your input.';

      setError(detail);
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setMode((prev) => (prev === 'login' ? 'register' : 'login'));
    setError('');
  };

  return (
    <div className="login-wrapper">
      <div className="login-page">
        <h1 className="login-title">Home Automation Hub</h1>
        <p className="login-subtitle">
          Sign {mode === 'login' ? 'in' : 'up'} to keep your lights, cameras
          and scenes in sync.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="login-form-group">
            <label className="login-label">Username</label>
            <input
              className="login-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              disabled={loading}
            />
          </div>
          <div className="login-form-group">
            <label className="login-label">Password</label>
            <input
              className="login-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={
                mode === 'login' ? 'current-password' : 'new-password'
              }
              disabled={loading}
            />
          </div>
          {error && <div className="login-error">{error}</div>}
          <div className="login-actions">
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading
                ? mode === 'login'
                  ? 'Signing in...'
                  : 'Creating account...'
                : mode === 'login'
                ? 'Sign in'
                : 'Create account'}
            </button>
            <button
              className="btn-outline"
              type="button"
              onClick={toggleMode}
              disabled={loading}
            >
              {mode === 'login'
                ? 'New here? Create account'
                : 'Already have an account? Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;