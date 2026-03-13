# Next.js Bundle Test App

Minimal Next.js app for testing the BUNDLE_ANALYSIS signal. Used to generate fixture JSON and validate the Next.js adapter.

## Setup

```bash
pnpm install
```

## Generate bundle analysis JSON

```bash
ANALYZE=true pnpm build
```

Output is written to `.next/analyze/` (client.json, edge.json, nodejs.json when using App Router).

## Config

`next.config.js` uses `@next/bundle-analyzer` with `analyzerMode: 'json'` so the action can parse the output.
