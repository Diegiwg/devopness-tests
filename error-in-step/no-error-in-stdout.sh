#!/bin/env sh

set -e

STDIN=0
STDOUT=1
STDERR=2

echo "Making some work ..." >&$STDOUT

echo "(1/3) Testing application connection ..." >&$STDOUT
echo "(1/3) Application connection OK ..." >&$STDOUT

echo "(2/3) Testing database connection ..." >&$STDOUT
echo "(2/3) Database connection OK ..." >&$STDOUT

echo "(3/3) Testing database schema ..." >&$STDOUT
echo "(3/3) Database schema OK ..." >&$STDOUT
exit 0