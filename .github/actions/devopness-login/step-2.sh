#!/usr/env bash

set -euo pipefail

access_token=$(jq -r '.access_token // empty' response.json)
echo "::add-mask::$access_token"

if [ -z "$access_token" ]; then
    echo "::error::Invalid token response structure"
    jq . response.json
    exit 1
fi

encoded_token=$(echo -n "$access_token" | base64 | tr -d '\n')
echo "::add-mask::$encoded_token"

# echo "::set-output name=devopness_token::$encoded_token"
echo "devopness_token=$encoded_token" >>"$GITHUB_OUTPUT"
