#!/usr/env bash

set -euo pipefail

echo "::add-mask::${R_TOKEN}"

if [[ ! "${R_METHOD}" =~ ^(GET|POST|PUT|DELETE)$ ]]; then
    echo "::error::Invalid HTTP method: ${R_METHOD}. Allowed: GET, POST, PUT, DELETE."
    exit 1
fi

URL="https://${R_HOST}${R_PATH}"
echo "::debug::Sending $R_METHOD request to: $URL"

TOKEN=$(echo -n "${R_TOKEN}" | base64 --decode 2>/dev/null || echo -n "${R_TOKEN}" | base64 -d 2>/dev/null)
echo "::add-mask::$TOKEN"

CMD=(
    curl -s -o response.json
    -D headers.txt
    -w "%{http_code}"
    -H "Authorization: Bearer $TOKEN"
    -H "Content-Type: application/json"
    -X "${R_METHOD}"
)

if [[ -n "${R_DATA}" && ! "${R_METHOD}" =~ ^(GET|DELETE)$ ]]; then
    CMD+=(-d "${R_DATA}")
fi

CMD+=("$URL")

HTTP_STATUS=$("${CMD[@]}")
CURL_EXIT=$?

if [ $CURL_EXIT -ne 0 ]; then
    echo "::error::Network error - Failed to connect to the server (cURL exit code: $CURL_EXIT)"
    exit 1
fi

if [[ $HTTP_STATUS -lt 200 || $HTTP_STATUS -ge 300 ]]; then
    echo "::error::Request failed with status code $HTTP_STATUS"
    jq -c . response.json 2>/dev/null || cat response.json
    exit 1
fi

REQUEST_ID=$(grep -i '^X-Devopness-Action-Id:' headers.txt | awk '{print $2}' | tr -d '\r' || echo "")

if jq -e . response.json >/dev/null 2>&1; then
    RESPONSE_BODY=$(jq -c . response.json)
else
    RESPONSE_BODY=$(tr -d '\n' <response.json)
fi

{
    echo "request-id=$REQUEST_ID"
    echo "status=$HTTP_STATUS"
    echo "response=$RESPONSE_BODY"
} >>"$GITHUB_OUTPUT"

echo "::debug::Request processed. Status: $HTTP_STATUS, Action ID: ${REQUEST_ID:-none}"
