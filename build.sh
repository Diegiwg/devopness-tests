#!/usr/env bash

set -e

if [ "$1" == "request" ]; then
    echo "Building Devopness Request Action"

    cd .github/actions/devopness-request

    npm install
    npm run build

    cd -
    exit 0

elif [ "$1" == "login" ]; then
    echo "Building Devopness Login Action"

    cd .github/actions/devopness-login

    npm install
    npm run build

    cd -
    exit 0

fi

echo "Unknown Action: $1"
exit 1
