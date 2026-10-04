#!/bin/sh
set -e
node server/src/db/migrate.ts
exec "$@"
