-- Run against the existing Supabase Postgres container:
-- psql postgresql://postgres:postgres@localhost:54322/postgres -f infra/docker/create-db.sql

SELECT 'CREATE DATABASE claude_code'
 WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'claude_code')\gexec

SELECT 'CREATE DATABASE claude_code_test'
 WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'claude_code_test')\gexec

\c claude_code
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\c claude_code_test
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
