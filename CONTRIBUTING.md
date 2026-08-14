# Contributing to OutreachKit

Thanks for your interest in contributing! Here's how to get started:

## Getting Started

1. Fork the repository
2. Clone your fork
3. Install dependencies: `npm install`
4. Install Playwright browsers: `npx playwright install chromium`
5. Create a branch: `git checkout -b feature/your-feature`

## Development

```bash
npm start          # Start the dashboard
npm test           # Run tests
npm run lint       # Lint code
npm run format     # Format code
```

## Code Style

- Use ES2022+ features (no `var`, prefer `const`)
- Single quotes, no trailing commas
- 100 character line limit
- Run `npm run format` before committing

## Pull Requests

- Keep PRs focused on a single change
- Add tests for new functionality
- Run `npm test` and `npm run lint` before submitting
- Follow the existing code style

## Reporting Bugs

Open an issue with:
- Steps to reproduce
- Expected behavior
- Actual behavior
- Your OS and Node.js version

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
