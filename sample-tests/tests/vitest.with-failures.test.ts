import { describe, it, expect } from 'vitest';

describe('Auth', () => {
  it('user can log in with valid credentials', () => {
    expect(1 + 1).toBe(2);
  });

  it('user is redirected to dashboard after login', () => {
    expect('dashboard').toContain('dash');
  });

  it('token refresh works correctly', () => {
    // Intentionally failing test to produce realistic fixture data
    expect(false).toBe(true);
  });
});

describe('Navigation', () => {
  it('header links render correctly', () => {
    expect(['home', 'about', 'contact']).toHaveLength(3);
  });

  it('breadcrumbs update on route change', () => {
    // Intentionally failing
    expect('breadcrumb-value').toBe('wrong-value');
  });
});

describe('API', () => {
  it('GET /health returns 200', () => {
    expect(200).toBe(200);
  });

  it('POST /comments creates a comment', () => {
    const payload = { text: 'hello' };
    expect(payload).toHaveProperty('text');
  });

  it.skip('DELETE /comments requires auth', () => {
    // Skipped until auth middleware is set up
  });
});
