# Dev Herald GitHub Action

A GitHub Action for posting comments on Pull Requests via the Dev Herald API. Supports both simple markdown comments and rich template-based comments for deployment status, test results, migrations, and custom tables.

## Features

- 🚀 **Simple Comments** - Post markdown comments directly to PRs
- 📊 **Rich Templates** - Use pre-built templates for common use cases
- 🔄 **Sticky Comments** - Update existing comments instead of creating new ones
- ✅ **Type-Safe** - Built with TypeScript for reliability
- 🎯 **Auto-Detection** - Automatically routes to the correct endpoint

## Quick Start

### Simple Markdown Comment

Post a basic markdown comment to a PR:

```yaml
- name: Post PR Comment
  uses: dev-herald/comment@v1
  with:
    api-key: ${{ secrets.DEV_HERALD_API_KEY }}
    pr-number: ${{ github.event.pull_request.number }}
    comment: |
      ## Build Complete! 🎉
      
      ✅ All checks passed
      📦 Build artifacts ready
      🚀 Ready to deploy
```

### Template-Based Comments

#### Deployment Status

```yaml
- name: Post Deployment Status
  uses: dev-herald/comment@v1
  with:
    api-key: ${{ secrets.DEV_HERALD_API_KEY }}
    pr-number: ${{ github.event.pull_request.number }}
    template: DEPLOYMENT
    sticky-id: deployment-status
    template-data: |
      {
        "projectName": "My App",
        "projectLink": "https://myapp.com",
        "deploymentStatus": "Ready",
        "deploymentLink": "https://vercel.com/deployments/abc123",
        "previewLink": "https://preview-pr-123.myapp.com",
        "showTimestamp": true
      }
```

#### Test Results

```yaml
- name: Post Test Results
  uses: dev-herald/comment@v1
  with:
    api-key: ${{ secrets.DEV_HERALD_API_KEY }}
    pr-number: ${{ github.event.pull_request.number }}
    template: TEST_RESULTS
    sticky-id: test-results
    template-data: |
      {
        "summary": "All tests passed successfully!",
        "testSuites": [
          {
            "name": "Unit Tests",
            "passed": 45,
            "failed": 0,
            "skipped": 2,
            "duration": "5.2s",
            "link": "https://ci.example.com/unit-tests"
          },
          {
            "name": "Integration Tests",
            "passed": 23,
            "failed": 1,
            "skipped": 0,
            "duration": "12.8s",
            "link": "https://ci.example.com/integration-tests"
          }
        ],
        "totalLink": "https://ci.example.com/full-report",
        "showTimestamp": true
      }
```

#### Migration Progress

```yaml
- name: Post Migration Progress
  uses: dev-herald/comment@v1
  with:
    api-key: ${{ secrets.DEV_HERALD_API_KEY }}
    pr-number: ${{ github.event.pull_request.number }}
    template: MIGRATION
    sticky-id: migration-progress
    template-data: |
      {
        "migrations": [
          {
            "from": "JavaScript",
            "to": "TypeScript",
            "summary": "✅ This PR converted 5 more files to TypeScript",
            "whyItMatters": "Improves type safety and developer experience",
            "metric": {
              "unit": "files",
              "before": 120,
              "after": 115,
              "delta": -5
            }
          },
          {
            "from": "emotion",
            "to": "tailwind",
            "summary": "✅ Migrated styling in 3 components",
            "metric": {
              "unit": "components",
              "before": 45,
              "after": 42,
              "delta": -3
            }
          }
        ],
        "showTimestamp": true
      }
```

#### Custom Table

```yaml
- name: Post Custom Table
  uses: dev-herald/comment@v1
  with:
    api-key: ${{ secrets.DEV_HERALD_API_KEY }}
    pr-number: ${{ github.event.pull_request.number }}
    template: CUSTOM_TABLE
    template-data: |
      {
        "title": "Bundle Size Analysis",
        "headers": ["Package", "Size", "Change", "Status"],
        "rows": [
          {
            "cells": [
              { "text": "main.js" },
              { "text": "245 KB" },
              { "text": "-12 KB ⬇️" },
              { "text": "✅ Improved" }
            ]
          },
          {
            "cells": [
              { "text": "vendor.js" },
              { "text": "890 KB" },
              { "text": "+5 KB ⬆️" },
              { "text": "⚠️ Watch" }
            ]
          }
        ],
        "showTimestamp": true
      }
```

## Inputs

### Required Inputs

| Input | Description | Example |
|-------|-------------|---------|
| `api-key` | Dev Herald API key for authentication | `${{ secrets.DEV_HERALD_API_KEY }}` |
| `pr-number` | Pull request number to comment on | `${{ github.event.pull_request.number }}` |

### Mode-Switching Inputs

You must provide **either** `comment` OR `template` (not both):

| Input | Description | Example |
|-------|-------------|---------|
| `comment` | Markdown comment text (for simple comments) | `## Build Complete\n✅ Success` |
| `template` | Template type for rich comments | `DEPLOYMENT`, `TEST_RESULTS`, `MIGRATION`, `CUSTOM_TABLE` |

### Optional Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `template-data` | JSON string with template-specific data (required when using `template`) | - |
| `sticky-id` | Identifier for updateable comments (updates existing comment instead of creating new) | - |
| `api-url` | Dev Herald API base URL | `https://api.devherald.com/api/v1/github` |

## Outputs

| Output | Description | Example |
|--------|-------------|---------|
| `comment-id` | Internal Dev Herald comment ID | `cmt_123abc` |
| `github-comment-id` | GitHub's comment ID | `3592910049` |
| `github-comment-url` | Direct URL to the GitHub comment | `https://github.com/owner/repo/pull/123#issuecomment-123456789` |
| `status` | Status of the comment | `posted`, `pending` |
| `response` | Full JSON response from the API | `{"success": true, ...}` |

## Complete Workflow Examples

### CI/CD Pipeline with Deployment Status

```yaml
name: Deploy and Notify

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Build
        run: npm run build
      
      - name: Deploy to Preview
        id: deploy
        run: |
          # Your deployment logic here
          echo "preview_url=https://preview-pr-${{ github.event.pull_request.number }}.myapp.com" >> $GITHUB_OUTPUT
      
      - name: Post Deployment Status
        uses: dev-herald/comment@v1
        with:
          api-key: ${{ secrets.DEV_HERALD_API_KEY }}
          pr-number: ${{ github.event.pull_request.number }}
          template: DEPLOYMENT
          sticky-id: deployment-status
          template-data: |
            {
              "projectName": "My Application",
              "deploymentStatus": "Ready",
              "previewLink": "${{ steps.deploy.outputs.preview_url }}",
              "showTimestamp": true
            }
```

### Test Results with Simple Comment Fallback

```yaml
name: Test and Report

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Run Tests
        id: test
        run: npm test -- --json --outputFile=test-results.json
        continue-on-error: true
      
      - name: Parse Test Results
        id: parse
        run: |
          # Parse test-results.json and set outputs
          echo "passed=45" >> $GITHUB_OUTPUT
          echo "failed=2" >> $GITHUB_OUTPUT
      
      - name: Post Test Results (Template)
        if: always()
        uses: dev-herald/comment@v1
        with:
          api-key: ${{ secrets.DEV_HERALD_API_KEY }}
          pr-number: ${{ github.event.pull_request.number }}
          template: TEST_RESULTS
          sticky-id: test-results
          template-data: |
            {
              "testSuites": [
                {
                  "name": "All Tests",
                  "passed": ${{ steps.parse.outputs.passed }},
                  "failed": ${{ steps.parse.outputs.failed }},
                  "duration": "8.5s"
                }
              ]
            }
```

## Template Data Schemas

### DEPLOYMENT Template

```typescript
{
  "projectName": string,           // Required
  "deploymentStatus": string,      // Required (e.g., "Ready", "Building", "Error")
  "projectLink"?: string,          // Optional URL
  "deploymentLink"?: string,       // Optional URL
  "previewLink"?: string,          // Optional URL
  "commentsLink"?: string,         // Optional URL
  "showTimestamp"?: boolean        // Default: true
}
```

### TEST_RESULTS Template

```typescript
{
  "summary"?: string,              // Optional summary message
  "testSuites": [                  // Required, at least 1
    {
      "name": string,              // Required
      "passed"?: number,           // Default: 0
      "failed"?: number,           // Default: 0
      "skipped"?: number,          // Default: 0
      "duration"?: string,         // e.g., "5.2s"
      "link"?: string              // Optional URL
    }
  ],
  "totalLink"?: string,            // Optional URL to full report
  "showTimestamp"?: boolean        // Default: true
}
```

### MIGRATION Template

```typescript
{
  "migrations": [                  // Required, at least 1
    {
      "from": string,              // Required (e.g., "JavaScript")
      "to": string,                // Required (e.g., "TypeScript")
      "summary": string,           // Required (e.g., "✅ Converted 5 files")
      "whyItMatters"?: string,     // Optional explanation
      "metric": {                  // Required
        "unit": string,            // Required (e.g., "files", "lines", "KB")
        "before": number,          // Required
        "after": number,           // Required
        "delta": number            // Required (after - before)
      }
    }
  ],
  "showTimestamp"?: boolean        // Default: true
}
```

### CUSTOM_TABLE Template

```typescript
{
  "title"?: string,                // Optional table title
  "headers": string[],             // Required, at least 1
  "rows": [                        // Required, at least 1
    {
      "cells": [                   // Required, at least 1
        {
          "text": string,          // Required
          "link"?: string          // Optional URL
        }
      ]
    }
  ],
  "showTimestamp"?: boolean        // Default: true
}
```

## Troubleshooting

### Error: "Must provide either comment or template"

You need to specify either the `comment` input (for simple comments) or the `template` input (for template-based comments).

### Error: "Invalid JSON in template-data"

Ensure your `template-data` is valid JSON. Use a JSON validator or check for:
- Missing commas between properties
- Unescaped quotes in strings
- Trailing commas (not allowed in JSON)

### Error: "Invalid template: must be one of..."

The `template` input must be exactly one of: `DEPLOYMENT`, `TEST_RESULTS`, `MIGRATION`, `CUSTOM_TABLE` (case-sensitive).

### Error: "template-data is required when using template mode"

When you specify a `template`, you must also provide the corresponding `template-data` with the required fields for that template type.

### Sticky Comments Not Updating

Make sure you're using the same `sticky-id` value across workflow runs. The `sticky-id` is case-sensitive and must match exactly.

## Development

### Build

```bash
npm install
npm run build
```

### Package for Distribution

```bash
npm run package
```

This will create a `dist/` directory with the compiled action ready for use.

### Testing Locally

You can test the action locally by setting environment variables:

```bash
export INPUT_API-KEY="your-api-key"
export INPUT_PR-NUMBER="123"
export INPUT_COMMENT="Test comment"
node dist/index.js
```

## API Documentation

This action uses the Dev Herald API. For full API documentation, see the OpenAPI specification at your Dev Herald instance.

## License

MIT
