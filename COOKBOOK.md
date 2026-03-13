# Cookbook

## Deployment Template

```yaml
- name: Post deployment status
  uses: dev-herald/comment@v1
  with:
    api-key: ${{ secrets.DEV_HERALD_API_KEY }}
    pr-number: ${{ github.event.pull_request.number }}
    template: 'DEPLOYMENT'
    template-data: |
      {
        "projectName": "My App",
        "deploymentStatus": "success",
        "deploymentLink": "https://vercel.com/deployments/abc123"
      }
    sticky-id: 'deployment'
```

## Migration Template

```yaml
- name: Post migration summary
  uses: dev-herald/comment@v1
  with:
    api-key: ${{ secrets.DEV_HERALD_API_KEY }}
    pr-number: ${{ github.event.pull_request.number }}
    template: 'MIGRATION'
    template-data: |
      {
        "migrations": [
          { "name": "20240101_add_users_table", "status": "pending" },
          { "name": "20240102_add_posts_table", "status": "pending" }
        ]
      }
    sticky-id: 'migration'
```

## Dependency Diff Signal

```yaml
- name: Post dependency diff
  uses: dev-herald/comment@v1
  with:
    api-key: ${{ secrets.DEV_HERALD_API_KEY }}
    pr-number: ${{ github.event.pull_request.number }}
    signal: 'DEPENDENCY_DIFF'
    enable-cve: 'true'
    max-deps: '50'
```

## New Dependency Signal

```yaml
- name: Post new dependency report
  uses: dev-herald/comment@v1
  with:
    api-key: ${{ secrets.DEV_HERALD_API_KEY }}
    pr-number: ${{ github.event.pull_request.number }}
    signal: 'NEW_DEPENDENCY'
    enable-cve: 'true'
    max-deps: '25'
    sticky-id: 'new-deps'
```

## Test Results Signal

```yaml
- name: Post test results
  uses: dev-herald/comment@v1
  with:
    api-key: ${{ secrets.DEV_HERALD_API_KEY }}
    pr-number: ${{ github.event.pull_request.number }}
    signal: 'TEST_RESULTS'
    test-results: |
      - name: Unit Tests
        path: vitest-results/results.json
      - name: E2E Tests
        path: playwright-results/results.json
```

## Bundle Analysis Signal

Requires two workflows: one to store the baseline on your target branch, and one in your PR workflow to diff and post.

**1. bundle-baseline.yml** — runs on push to target branch (main, dev, stg — your choice):

```yaml
on:
  push:
    branches: [main]

jobs:
  baseline:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install
      - run: ANALYZE=true pnpm build
      - uses: actions/upload-artifact@v4
        with:
          name: bundle-baseline
          path: .next/analyze/
```

**2. pr-checks.yml** — bundle diff step alongside lint, test, etc.:

```yaml
on:
  pull_request:
    branches: [main]

jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - run: pnpm install
      - run: pnpm lint
      - run: pnpm test
      - run: ANALYZE=true pnpm build

      - name: Download baseline
        uses: dawidd6/action-download-artifact@v3
        with:
          branch: main
          workflow: bundle-baseline.yml
          path: baseline/

      - name: Post bundle diff
        uses: dev-herald/comment@v1
        with:
          api-key: ${{ secrets.DEV_HERALD_API_KEY }}
          pr-number: ${{ github.event.pull_request.number }}
          signal: BUNDLE_ANALYSIS
          bundle-report-path: .next/analyze/
          bundle-baseline-path: baseline/
          sticky-id: bundle-analysis
```

**Next.js setup**: Add `@next/bundle-analyzer` and configure `next.config.js` with `analyzerMode: 'json'`. If no baseline exists yet, the action logs a message and skips posting.
