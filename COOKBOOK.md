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
