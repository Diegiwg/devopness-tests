#!/usr/env bash

set -euo pipefail

# Mask sensitive values in logs
echo "::add-mask::${TOKEN}"

# Validate HTTP method
if [[ ! "${METHOD}" =~ ^(GET|POST|PUT|DELETE)$ ]]; then
    echo "::error::Invalid HTTP method: ${METHOD}. Allowed: GET, POST, PUT, DELETE."
    exit 1
fi

# Construct the full URL
URL="https://${HOST}${PATH}"
echo "::debug::Sending $METHOD request to: $URL"

# Decode the token
TOKEN=$(echo -n "${TOKEN}" | base64 --decode 2>/dev/null || echo -n "${TOKEN}" | base64 -d 2>/dev/null)

# Prepare curl command
CMD=(
    curl -s -o response.json
    -D headers.txt
    -w "%{http_code}"
    -H "Authorization: Bearer $TOKEN"
    -H "Content-Type: application/json"
    -X "${METHOD}"
)

# Add data if provided (skip for GET/DELETE)
if [[ -n "${DATA}" && ! "${METHOD}" =~ ^(GET|DELETE)$ ]]; then
    CMD+=(-d "${DATA}")
fi

CMD+=("$URL")

# Execute the request
HTTP_STATUS=$("${CMD[@]}")
CURL_EXIT=$?

# Check for curl errors
if [ $CURL_EXIT -ne 0 ]; then
    echo "::error::Network error - Failed to connect to the server (cURL exit code: $CURL_EXIT)"
    exit 1
fi

# Handle HTTP response codes (consider all 2xx as success)
if [[ $HTTP_STATUS -lt 200 || $HTTP_STATUS -ge 300 ]]; then
    echo "::error::Request failed with status code $HTTP_STATUS"
    jq -c . response.json 2>/dev/null || cat response.json
    exit 1
fi

# Extract action ID from headers
REQUEST_ID=$(grep -i '^X-Devopness-Action-Id:' headers.txt | awk '{print $2}' | tr -d '\r' || echo "")

# Process response body
if jq -e . response.json >/dev/null 2>&1; then
    RESPONSE_BODY=$(jq -c . response.json)
else
    RESPONSE_BODY=$(tr -d '\n' <response.json)
fi

# Set outputs
{
    echo "request-id=$REQUEST_ID"
    echo "status=$HTTP_STATUS"
    echo "response=$RESPONSE_BODY"
} >>"$GITHUB_OUTPUT"

echo "::debug::Request processed. Status: $HTTP_STATUS, Action ID: ${REQUEST_ID:-none}"
