# Dev Herald GitHub Action

Automated PR comments via [Dev Herald](https://dev-herald.com) - let workflows communicate with reviewers and teammates using simple markdown or rich templates. Templates built for CI/CD clarity: deploys, tests, table summaries, migration insights, and more.

👉 [Docs](https://dev-herald.com/docs)

👉 [Quick Start](https://dev-herald.com/docs/quick-start)

---

## Why You'll ❤️ This

- [Sticky comments](https://dev-herald.com/docs/features/sticky-comments) - update instead of cluttering threads
- [Pre-built templates](https://dev-herald.com/docs/features/templates) - include deployment status, test results, table summaries, migration highlights (and more!)
- [Signals](https://dev-herald.com/docs/signals/test-results) - Plug and play signals for DEPENDENCY_DIFF, TEST_RESULTS, NEW_DEPENDENCY, BUNDLE_ANALYSIS (diff PR bundle vs baseline)
- Full GitHub Markdown support - plain comments when you want them  
- Faster feedback loops - CI/CD results automatically surface in PRs

## Simple Example

```yaml
- name: Post a comment
  uses: dev-herald/comment@v1 
  with:
    api-key: ${{ secrets.DEV_HERALD_API_KEY }}
    pr-number: ${{ github.event.pull_request.number }}
    comment: 'Hello World!'
```

## Points of Reference

- 🏠 [Home](https://dev-herald.com)
- 📚 [Full docs](https://dev-herald.com/docs)
- 📄 [Template reference](https://dev-herald.com/docs/templates)

---

## License

MIT
