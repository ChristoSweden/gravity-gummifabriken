import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import React from 'react';
import ProtectedRoute from '../components/ProtectedRoute';

// Mock the auth context
const mockAuth = {
  user: null as any,
  session: null,
  loading: false,
  isDemo: false,
  needsOnboarding: false,
  needsPasswordSetup: false,
  setNeedsOnboarding: vi.fn(),
  setNeedsPasswordSetup: vi.fn(),
  enterDemoMode: vi.fn(),
  logout: vi.fn(),
};

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

function renderWithRouter(initialRoute: string) {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/onboarding" element={<div>Onboarding Page</div>} />
        <Route
          path="/radar"
          element={
            <ProtectedRoute>
              <div>Radar Page</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  it('redirects to login when no user', () => {
    mockAuth.user = null;
    mockAuth.loading = false;
    renderWithRouter('/radar');
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('shows loading state when auth is loading', () => {
    mockAuth.user = null;
    mockAuth.loading = true;
    renderWithRouter('/radar');
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders children when user is authenticated', () => {
    mockAuth.user = { id: 'test-user', email: 'test@test.com' };
    mockAuth.loading = false;
    mockAuth.needsOnboarding = false;
    renderWithRouter('/radar');
    expect(screen.getByText('Radar Page')).toBeInTheDocument();
  });

  it('redirects to onboarding when needsOnboarding is true', () => {
    mockAuth.user = { id: 'test-user', email: 'test@test.com' };
    mockAuth.loading = false;
    mockAuth.needsOnboarding = true;
    renderWithRouter('/radar');
    expect(screen.getByText('Onboarding Page')).toBeInTheDocument();
  });
});
