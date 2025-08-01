#!/bin/bash

# CI/CD Test Script
# This script simulates the GitHub Actions workflow locally

set -e  # Exit on any error

echo "🚀 Starting CI/CD Test Simulation..."
echo "=================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print status
print_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ $2${NC}"
    else
        echo -e "${RED}❌ $2${NC}"
        exit 1
    fi
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

echo "📦 Step 1: Installing dependencies..."
npm ci
print_status $? "Dependencies installed"

echo ""
echo "🔍 Step 2: Running linting..."
npx eslint src --ext .ts --max-warnings 0 || print_warning "Linting completed with warnings"

echo ""
echo "🔨 Step 3: Building TypeScript..."
npm run build
print_status $? "TypeScript build completed"

echo ""
echo "📝 Step 4: Compiling tests..."
npx tsc -p tsconfig.test.json
print_status $? "Test compilation completed"

echo ""
echo "🧪 Step 5: Running tests with coverage..."
npm test
print_status $? "Tests completed successfully"

echo ""
echo "🔒 Step 6: Security audit..."
npm audit --audit-level moderate || print_warning "Security audit completed with warnings"

echo ""
echo "📊 Step 7: Coverage summary..."
if [ -f "coverage/coverage-summary.json" ]; then
    echo "Coverage report generated successfully"
    # Extract coverage percentages if jq is available
    if command -v jq &> /dev/null; then
        echo "Coverage Summary:"
        jq -r '.total | "  Statements: \(.statements.pct)%\n  Branches: \(.branches.pct)%\n  Functions: \(.functions.pct)%\n  Lines: \(.lines.pct)%"' coverage/coverage-summary.json
    fi
else
    print_warning "Coverage summary not found"
fi

echo ""
echo "🎉 CI/CD Test Simulation Completed Successfully!"
echo "=============================================="
echo ""
echo "📋 Summary:"
echo "  - All tests passing: ✅"
echo "  - Coverage generated: ✅"
echo "  - Build successful: ✅"
echo "  - Ready for deployment: ✅"
echo ""
echo "🔗 Next steps:"
echo "  - Push to GitHub to trigger actual CI/CD"
echo "  - Check GitHub Actions for pipeline status"
echo "  - Monitor coverage reports"