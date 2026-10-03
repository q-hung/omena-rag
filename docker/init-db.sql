-- Runs once, on first start of an empty data volume.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE DATABASE jarvis_test OWNER jarvis;
\connect jarvis_test
CREATE EXTENSION IF NOT EXISTS vector;
