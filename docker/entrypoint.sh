#!/bin/sh
set -e
node server/dist/src/db/migrate.js
exec "$@"
