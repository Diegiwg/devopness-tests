#!/usr/env bash

set -euo pipefail

response_file=$(mktemp)
trap 'rm -f "$response_file"' EXIT

status_code=$(curl -s -o "$response_file" -w "%{http_code}" \
    --max-time 30 \
    -X POST \
    -H "Content-Type: application/json" \
    -d "{\"email\": \"${EMAIL}\", \"password\": \"${PASSWORD}\"}" \
    "https://${HOST}/users/login")

if [ "$status_code" -lt 200 ] || [ "$status_code" -gt 299 ]; then
    echo "::error::Authentication failed with status $status_code"
    # Try to extract error message from JSON response
    if jq -e . "$response_file" >/dev/null 2>&1; then
        jq -r '.message // "Unknown error"' "$response_file" | sed 's/^/::error::/'
    else
        echo "::error::Non-JSON response:"
        cat "$response_file"
    fi
    exit 1
fi

if ! jq -e . "$response_file" >/dev/null 2>&1; then
    echo "::error::Invalid JSON response from server"
    cat "$response_file"
    exit 1
fi

cp "$response_file" response.json
