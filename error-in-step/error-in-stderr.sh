#!/bin/env sh

set -e

STDIN=0
STDOUT=1
STDERR=2

echo "Making some work ..." >&$STDOUT

echo "(1/3) Testing application connection ..." >&$STDOUT
echo "(1/3) Application connection OK ..." >&$STDOUT

echo "(2/3) Testing database connection ..." >&$STDOUT
echo "(2/3) ERROR: Database connection failed ..." >&$STDERR
exit 1
