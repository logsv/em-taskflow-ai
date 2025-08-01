# CI/CD Documentation

## Overview
This project uses GitHub Actions for Continuous Integration and Continuous Deployment (CI/CD). The workflows are designed to ensure code quality, run tests, and provide coverage reports for the backend.

## Workflows

### 1. Backend CI (`backend-ci.yml`)
**Triggers:**
- Push to `main` or `develop` branches (only when backend files change)
- Pull requests to `main` or `develop` branches (only when backend files change)

**Jobs:**
- **test**: Runs the full test suite with coverage
- **build-check**: Verifies production build works correctly

**Features:**
- Node.js 20.x support
- TypeScript compilation
- Test execution with Jasmine
- Coverage reporting with nyc
- Security audit
- Codecov integration
- Build artifact verification

### 2. Tests (`test.yml`)
**Triggers:**
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches

**Features:**
- Simplified test execution
- Coverage reporting
- PR comments with coverage summary

### 3. CI (`ci.yml`)
**Triggers:**
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches

**Features:**
- Path-based change detection
- Conditional job execution
- Future-ready for frontend tests

## Setup Instructions

### 1. Repository Secrets
Add the following secrets to your GitHub repository:

```
CODECOV_TOKEN: Your Codecov token (optional, for coverage reporting)
```

### 2. Branch Protection Rules
Recommended branch protection settings for `main` branch:
- Require status checks to pass before merging
- Require branches to be up to date before merging
- Required status checks:
  - `Backend Tests`
  - `test (backend-tests)`

### 3. Codecov Integration (Optional)
1. Sign up at [codecov.io](https://codecov.io)
2. Connect your GitHub repository
3. Add the `CODECOV_TOKEN` to your repository secrets
4. Coverage reports will be automatically uploaded

## Local Testing

### Run the CI script locally:
```bash
cd backend
chmod +x scripts/test-ci.sh
./scripts/test-ci.sh
```

### Manual test execution:
```bash
cd backend
npm ci
npm run build
npx tsc -p tsconfig.test.json
npm test
```

## Coverage Requirements
The project is configured with minimum coverage thresholds:
- Statements: 42%
- Branches: 29%
- Functions: 36%
- Lines: 42%

These can be adjusted in `backend/package.json` under the `nyc` configuration.

## Workflow Status Badges
Add these badges to your README.md:

```markdown
[![Backend CI](https://github.com/logsv/em-taskflow/workflows/Backend%20CI/badge.svg)](https://github.com/logsv/em-taskflow/actions/workflows/backend-ci.yml)
[![Tests](https://github.com/logsv/em-taskflow/workflows/Tests/badge.svg)](https://github.com/logsv/em-taskflow/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/logsv/em-taskflow/branch/main/graph/badge.svg)](https://codecov.io/gh/logsv/em-taskflow)
```

## Troubleshooting

### Common Issues:

1. **Tests failing locally but passing in CI**
   - Check Node.js version (should be 20.x)
   - Ensure all dependencies are installed with `npm ci`
   - Clear node_modules and reinstall

2. **Coverage not uploading to Codecov**
   - Verify `CODECOV_TOKEN` is set in repository secrets
   - Check that `coverage/lcov.info` file is generated
   - Review Codecov action logs

3. **TypeScript compilation errors**
   - Ensure `tsconfig.json` and `tsconfig.test.json` are properly configured
   - Check for missing type definitions
   - Verify all imports are correct

4. **Workflow not triggering**
   - Check branch names match the workflow configuration
   - Verify file paths in the `paths` filter
   - Ensure workflow files are in `.github/workflows/`

## Future Enhancements

### Planned additions:
- Frontend test integration
- Docker image building
- Deployment workflows
- Performance testing
- Security scanning with CodeQL
- Dependency vulnerability scanning

### Adding Frontend Tests:
Uncomment the frontend job in `ci.yml` and configure:
```yaml
frontend:
  needs: check-changes
  if: needs.check-changes.outputs.frontend == 'true'
  runs-on: ubuntu-latest
  defaults:
    run:
      working-directory: ./frontend
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '18'
        cache: 'npm'
        cache-dependency-path: frontend/package-lock.json
    - run: npm ci
    - run: npm test
```

## Best Practices

1. **Keep workflows fast**: Use caching and parallel jobs
2. **Fail fast**: Stop on first error to save resources
3. **Use specific versions**: Pin action versions for reproducibility
4. **Monitor costs**: GitHub Actions has usage limits
5. **Security**: Never commit secrets, use repository secrets
6. **Documentation**: Keep this file updated with changes

## Monitoring

### Key metrics to monitor:
- Test execution time
- Coverage trends
- Build success rate
- Security vulnerabilities
- Dependency updates needed

### GitHub Actions insights:
- Go to repository → Actions → Insights
- Monitor workflow runs, success rates, and execution times
- Set up notifications for failed workflows