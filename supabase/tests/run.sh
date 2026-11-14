#!/usr/bin/env bash
# Applies the migration to a throwaway Postgres (with pgvector) and runs the RLS checks.
# Usage: DATABASE_URL=postgres://user:pass@host:5432/postgres bash supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
DB="${DATABASE_URL:?set DATABASE_URL}"
psql "$DB" -q -v ON_ERROR_STOP=1 -c "drop database if exists biopay_rls_test" -c "create database biopay_rls_test"
TEST_DB="${DB%/*}/biopay_rls_test"
psql "$TEST_DB" -q -v ON_ERROR_STOP=1 -f supabase/tests/local_auth_stub.sql -f supabase/migrations/20261114000001_init.sql -f supabase/tests/rls_test.sql
