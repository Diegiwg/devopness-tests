#!/usr/bin/env bash

set -euo pipefail

echo "::add-mask::${R_TOKEN}"

TOKEN=$(echo -n "${R_TOKEN}" | base64 --decode 2>/dev/null || echo -n "${R_TOKEN}" | base64 -d 2>/dev/null)
echo "::add-mask::$TOKEN"

if [ "$R_LIST" = "true" ] && [ "$R_GET" = "true" ] && [ "$R_CREATE" = "true" ]; then
    echo "::error::You must specify only one operation per execution."
    exit 1
fi

# Operation: List Applications
if [ "$R_LIST" = "true" ]; then
    if [ -z "$R_LIST_ENVIRONMENT_ID" ]; then
        echo "::error::For 'list' operation, 'LIST_ENVIRONMENT_ID' must be set."
        exit 1
    fi

    echo "::debug::Operation: List Applications"
    echo "::debug::Environment ID: $R_LIST_ENVIRONMENT_ID"

    CMD=(
        curl -s -o response.json
        -D headers.txt
        -w "%{http_code}"
        -H "Authorization: Bearer $TOKEN"
        -H "Content-Type: application/json"
        -X "GET"
    )

    API_URL="https://${R_HOST}/environments/${R_LIST_ENVIRONMENT_ID}/applications"
    echo "::debug::API URL: $API_URL"
    CMD+=("$API_URL")

    HTTP_STATUS=$("${CMD[@]}")
    CURL_EXIT=$?

    if [ $CURL_EXIT -ne 0 ]; then
        echo "::error::Network error - Failed to connect to the server or request timed out (cURL exit code: $CURL_EXIT)"
        exit 1
    fi

    if [[ $HTTP_STATUS -lt 200 || $HTTP_STATUS -ge 300 ]]; then
        echo "::error::Request to list applications failed with status code $HTTP_STATUS"
        jq -c . response.json 2>/dev/null || cat response.json
        exit 1
    fi

    if jq -e . response.json >/dev/null 2>&1; then
        RESPONSE_BODY=$(jq -c . response.json)
    else
        RESPONSE_BODY=$(tr -d '\n' <response.json)
    fi

    {
        echo "list_response=$RESPONSE_BODY"
    } >>"$GITHUB_OUTPUT"
    echo "::debug::List applications operation completed successfully."
    exit 0

# Operation: Get Application
elif [ "$R_GET" = "true" ]; then
    if [ -z "$R_GET_APPLICATION_ID" ]; then
        echo "::error::For 'get' operation, 'GET_APPLICATION_ID' must be set."
        exit 1
    fi

    echo "::debug::Operation: Get Application"
    echo "::debug::Application ID: $R_GET_APPLICATION_ID"

    CMD=(
        curl -s -o response.json
        -D headers.txt
        -w "%{http_code}"
        -H "Authorization: Bearer $TOKEN"
        -H "Content-Type: application/json"
        -X "GET"
    )

    API_URL="https://${R_HOST}/applications/${R_GET_APPLICATION_ID}"
    echo "::debug::API URL: $API_URL"
    CMD+=("$API_URL")

    HTTP_STATUS=$("${CMD[@]}")
    CURL_EXIT=$?

    if [ $CURL_EXIT -ne 0 ]; then
        echo "::error::Network error - Failed to connect to the server or request timed out (cURL exit code: $CURL_EXIT)"
        exit 1
    fi

    if [[ $HTTP_STATUS -lt 200 || $HTTP_STATUS -ge 300 ]]; then
        echo "::error::Request to get application failed with status code $HTTP_STATUS"
        jq -c . response.json 2>/dev/null || cat response.json
        exit 1
    fi

    if jq -e . response.json >/dev/null 2>&1; then
        RESPONSE_BODY=$(jq -c . response.json)
    else
        RESPONSE_BODY=$(tr -d '\n' <response.json)
    fi

    {
        echo "get_response=$RESPONSE_BODY"
    } >>"$GITHUB_OUTPUT"
    echo "::debug::Get application operation completed successfully."
    exit 0

elif [ "$R_CREATE" = "true" ]; then
    if [ -z "$R_CREATE_ENVIRONMENT_ID" ]; then
        echo "::error::For 'create' operation, 'CREATE_ENVIRONMENT_ID' must be set."
        exit 1
    fi

    if [ -z "$R_CREATE_CREDENTIAL_ID" ]; then
        echo "::error::For 'create' operation, 'CREATE_CREDENTIAL_ID' must be set."
        exit 1
    fi

    if [ -z "$R_CREATE_NAME" ]; then
        echo "::error::For 'create' operation, 'CREATE_NAME' must be set."
        exit 1
    fi

    if [ -z "$R_CREATE_PROGRAMMING_LANGUAGE" ]; then
        echo "::error::For 'create' operation, 'CREATE_PROGRAMMING_LANGUAGE' must be set."
        exit 1
    fi

    if [ -z "$R_CREATE_ENGINE_VERSION" ]; then
        echo "::error::For 'create' operation, 'CREATE_ENGINE_VERSION' must be set."
        exit 1
    fi

    if [ -z "$R_CREATE_FRAMEWORK" ]; then
        echo "::error::For 'create' operation, 'CREATE_FRAMEWORK' must be set."
        exit 1
    fi

    if [ -z "$R_CREATE_REPOSITORY" ]; then
        echo "::error::For 'create' operation, 'CREATE_REPOSITORY' must be set."
        exit 1
    fi

    if [ -z "$R_CREATE_DEFAULT_BRANCH" ]; then
        echo "::error::For 'create' operation, 'CREATE_DEFAULT_BRANCH' must be set."
        exit 1
    fi

    echo "::debug::Operation: Create Application"
    echo "::debug::Environment ID: $R_CREATE_ENVIRONMENT_ID"
    echo "::debug::Credential ID: $R_CREATE_CREDENTIAL_ID"
    echo "::debug::Name: $R_CREATE_NAME"
    echo "::debug::Programming Language: $R_CREATE_PROGRAMMING_LANGUAGE"
    echo "::debug::Engine Version: $R_CREATE_ENGINE_VERSION"
    echo "::debug::Framework: $R_CREATE_FRAMEWORK"
    echo "::debug::Repository: $R_CREATE_REPOSITORY"
    echo "::debug::Default Branch: $R_CREATE_DEFAULT_BRANCH"

    CMD=(
        curl -s -o response.json
        -D headers.txt
        -w "%{http_code}"
        -H "Authorization: Bearer $TOKEN"
        -H "Content-Type: application/json"
        -X "POST"
        -d "{
            \"environment_id\": $R_CREATE_ENVIRONMENT_ID,
            \"credential_id\": $R_CREATE_CREDENTIAL_ID,
            \"name\": \"$R_CREATE_NAME\",
            \"programming_language\": \"$R_CREATE_PROGRAMMING_LANGUAGE\",
            \"engine_version\": \"$R_CREATE_ENGINE_VERSION\",
            \"framework\": \"$R_CREATE_FRAMEWORK\",
            \"repository\": \"$R_CREATE_REPOSITORY\",
            \"default_branch\": \"$R_CREATE_DEFAULT_BRANCH\"
        }"
    )

    API_URL="https://${R_HOST}/applications"
    echo "::debug::API URL: $API_URL"
    CMD+=("$API_URL")

    HTTP_STATUS=$("${CMD[@]}")
    CURL_EXIT=$?

    if [ $CURL_EXIT -ne 0 ]; then
        echo "::error::Network error - Failed to connect to the server or request timed out (cURL exit code: $CURL_EXIT)"
        exit 1
    fi

    if [[ $HTTP_STATUS -lt 200 || $HTTP_STATUS -ge 300 ]]; then
        echo "::error::Request to create application failed with status code $HTTP_STATUS"
        jq -c . response.json 2>/dev/null || cat response.json
        exit 1
    fi

    if jq -e . response.json >/dev/null 2>&1; then
        RESPONSE_BODY=$(jq -c . response.json)
    else
        RESPONSE_BODY=$(tr -d '\n' <response.json)
    fi

    {
        echo "create_response=$RESPONSE_BODY"
    } >>"$GITHUB_OUTPUT"

    echo "::debug::Create application operation completed successfully."
    exit 0
fi
