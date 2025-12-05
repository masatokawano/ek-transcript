#!/bin/bash
set -euo pipefail

# ek-transcript deployment script

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

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed"
        exit 1
    fi

    if ! command -v cdk &> /dev/null; then
        log_error "AWS CDK is not installed"
        exit 1
    fi

    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi

    log_info "All prerequisites met"
}

# Build Lambda containers
build_lambdas() {
    log_info "Building Lambda containers..."

    local lambdas=("extract_audio" "diarize" "split_by_speaker" "transcribe" "llm_analysis" "aggregate_results")

    for lambda in "${lambdas[@]}"; do
        local dockerfile="${PROJECT_ROOT}/lambdas/${lambda}/Dockerfile"
        if [[ -f "$dockerfile" ]]; then
            log_info "Building ${lambda}..."
            docker build -t "ek-transcript-${lambda}:latest" "${PROJECT_ROOT}/lambdas/${lambda}"
        else
            log_warn "Dockerfile not found for ${lambda}, skipping..."
        fi
    done
}

# Run tests
run_tests() {
    log_info "Running tests..."
    cd "$PROJECT_ROOT"
    python -m pytest --tb=short -q
}

# Deploy CDK stack
deploy_cdk() {
    local environment="${1:-dev}"
    log_info "Deploying CDK stack for environment: ${environment}..."

    cd "${PROJECT_ROOT}/cdk"
    npm ci
    npx cdk deploy --all --require-approval never -c environment="${environment}"
}

# Main
main() {
    local command="${1:-help}"

    case "$command" in
        check)
            check_prerequisites
            ;;
        build)
            build_lambdas
            ;;
        test)
            run_tests
            ;;
        deploy)
            local env="${2:-dev}"
            check_prerequisites
            run_tests
            build_lambdas
            deploy_cdk "$env"
            ;;
        help|*)
            echo "Usage: $0 {check|build|test|deploy [env]}"
            echo ""
            echo "Commands:"
            echo "  check       Check prerequisites"
            echo "  build       Build Lambda containers"
            echo "  test        Run tests"
            echo "  deploy      Full deployment (test -> build -> deploy)"
            echo ""
            echo "Options:"
            echo "  env         Environment (dev, staging, prod). Default: dev"
            ;;
    esac
}

main "$@"
