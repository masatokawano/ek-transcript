#!/bin/bash
set -euo pipefail

# Local testing script for ek-transcript

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Setup virtual environment
setup_venv() {
    log_info "Setting up virtual environment..."
    cd "$PROJECT_ROOT"

    if [[ ! -d ".venv" ]]; then
        python -m venv .venv
    fi

    source .venv/bin/activate
    pip install -e ".[dev]"
}

# Run unit tests
run_unit_tests() {
    log_info "Running unit tests..."
    cd "$PROJECT_ROOT"
    python -m pytest -m "unit" -v --tb=short
}

# Run integration tests
run_integration_tests() {
    log_info "Running integration tests..."
    cd "$PROJECT_ROOT"
    python -m pytest -m "integration" -v --tb=short
}

# Run all tests with coverage
run_all_tests() {
    log_info "Running all tests with coverage..."
    cd "$PROJECT_ROOT"
    python -m pytest --cov=lambdas --cov-report=html --cov-report=term-missing -v
}

# Lint code
lint_code() {
    log_info "Linting code..."
    cd "$PROJECT_ROOT"
    ruff check .
    ruff format --check .
}

# Format code
format_code() {
    log_info "Formatting code..."
    cd "$PROJECT_ROOT"
    ruff check --fix .
    ruff format .
}

# Type check
type_check() {
    log_info "Running type checks..."
    cd "$PROJECT_ROOT"
    mypy lambdas --ignore-missing-imports
}

# Test single Lambda locally
test_lambda() {
    local lambda_name="${1:-}"
    if [[ -z "$lambda_name" ]]; then
        log_error "Lambda name required"
        exit 1
    fi

    log_info "Testing Lambda: ${lambda_name}..."
    cd "$PROJECT_ROOT"
    python -m pytest "lambdas/${lambda_name}/tests" -v --tb=short
}

# Main
main() {
    local command="${1:-help}"

    case "$command" in
        setup)
            setup_venv
            ;;
        unit)
            run_unit_tests
            ;;
        integration)
            run_integration_tests
            ;;
        all)
            run_all_tests
            ;;
        lint)
            lint_code
            ;;
        format)
            format_code
            ;;
        typecheck)
            type_check
            ;;
        lambda)
            test_lambda "${2:-}"
            ;;
        ci)
            lint_code
            type_check
            run_all_tests
            ;;
        help|*)
            echo "Usage: $0 {setup|unit|integration|all|lint|format|typecheck|lambda <name>|ci}"
            echo ""
            echo "Commands:"
            echo "  setup        Setup virtual environment"
            echo "  unit         Run unit tests"
            echo "  integration  Run integration tests"
            echo "  all          Run all tests with coverage"
            echo "  lint         Check code style"
            echo "  format       Format code"
            echo "  typecheck    Run type checks"
            echo "  lambda       Test specific Lambda (e.g., ./test_local.sh lambda extract_audio)"
            echo "  ci           Run full CI checks (lint + typecheck + tests)"
            ;;
    esac
}

main "$@"
