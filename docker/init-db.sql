-- Runs once, on first start of an empty data volume.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE DATABASE omena_test OWNER omena;
\connect omena_test
CREATE EXTENSION IF NOT EXISTS vector;
