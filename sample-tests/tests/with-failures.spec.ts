import { test, expect } from '@playwright/test';

test.describe('Auth', () => {
  test('user can log in with valid credentials', async () => {
    expect(1 + 1).toBe(2);
  });

  test('user is redirected to dashboard after login', async () => {
    expect('dashboard').toContain('dash');
  });

  test('token refresh works correctly', async () => {
    // Intentionally failing test to produce realistic fixture data
    expect(false).toBe(true);
  });
});

test.describe('Navigation', () => {
  test('header links render correctly', async () => {
    expect(['home', 'about', 'contact']).toHaveLength(3);
  });

  test('breadcrumbs update on route change', async () => {
    // Intentionally failing
    expect('breadcrumb-value').toBe('wrong-value');
  });
});

test.describe('API', () => {
  test('GET /health returns 200', async () => {
    expect(200).toBe(200);
  });

  test('POST /comments creates a comment', async () => {
    const payload = { text: 'hello' };
    expect(payload).toHaveProperty('text');
  });

  test.skip('DELETE /comments requires auth', async () => {
    // Skipped until auth middleware is set up
  });
});
