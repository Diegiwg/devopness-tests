name: CI - Cleanup Preview Resources

on:
    pull_request:
        types:
            - closed

jobs:
    cleanup-preview-resources:
        name: Cleanup Preview Resources
        runs-on: ubuntu-latest
        steps:
            - name: Checkout Repository
              uses: actions/checkout@v4

            - name: Authenticate on Devopness
              uses: ./.github/actions/devopness-login
              id: devopness-login
              with:
                  host: ${{ vars.DEVOPNESS_HOST }}
                  email: ${{ secrets.DEVOPNESS_EMAIL }}
                  password: ${{ secrets.DEVOPNESS_PASSWORD }}

            - name: Fetch Applications in Environment
              id: list-applications
              uses: ./.github/actions/devopness-application
              with:
                  host: ${{ vars.DEVOPNESS_HOST }}
                  token: ${{ steps.devopness-login.outputs.devopness_token }}

                  list: true
                  list_environment_id: ${{ vars.DEVOPNESS_ENVIRONMENT_ID }}

            - name: Extract Application ID
              id: extract-application-id
              run: |
                  echo '${{ steps.list-applications.outputs.list_response }}' > applications.json
                  APPLICATION_ID=$(jq -r --arg pr "pr-${{ github.event.number }}-preview" '.[] | select(.name == $pr) | .id' applications.json)

                  if [[ -n "$APPLICATION_ID" && "$APPLICATION_ID" != "null" ]]; then
                     echo "APPLICATION_ID=$APPLICATION_ID" >> $GITHUB_OUTPUT
                  else
                     echo "Application ID not found" >&2
                     exit 1
                  fi

            - name: Delete Preview Application
              if: steps.extract-application-id.outputs.APPLICATION_ID != ''
              uses: ./.github/actions/devopness-application
              with:
                  host: ${{ vars.DEVOPNESS_HOST }}
                  token: ${{ steps.devopness-login.outputs.devopness_token }}

                  delete: true
                  delete_application_id: ${{ steps.extract-application-id.outputs.APPLICATION_ID }}

            - name: Fetch Server Information
              id: get-server
              uses: ./.github/actions/devopness-request
              with:
                  host: ${{ vars.DEVOPNESS_HOST }}
                  path: "/servers/${{ vars.DEVOPNESS_SERVER_ID }}"
                  method: GET
                  token: ${{ steps.devopness-login.outputs.devopness_token }}

            - name: Extract Server Details
              id: parse-server-data
              run: |
                  echo '${{ steps.get-server.outputs.response }}' > server.json
                  SERVER_ID=$(jq -r '.id' server.json)
                  SERVER_IP=$(jq -r '.ip_address' server.json)
                  echo "SERVER_ID=$SERVER_ID" >> $GITHUB_OUTPUT
                  echo "SERVER_IP=$SERVER_IP" >> $GITHUB_OUTPUT

            - name: Fetch Virtual Hosts in Environment
              id: list-virtual-hosts
              uses: ./.github/actions/devopness-request
              with:
                  host: ${{ vars.DEVOPNESS_HOST }}
                  path: "/environments/${{ vars.DEVOPNESS_ENVIRONMENT_ID }}/virtual-hosts"
                  method: GET
                  token: ${{ steps.devopness-login.outputs.devopness_token }}

            - name: Extract Virtual Host ID
              id: extract-virtual-host-id
              run: |
                  echo '${{ steps.list-virtual-hosts.outputs.response }}' > virtual-hosts.json
                  VIRTUAL_HOST_NAME="${{ steps.parse-server-data.outputs.SERVER_IP }}:6969"

                  VIRTUAL_HOST_ID=$(jq -r --arg name "$VIRTUAL_HOST_NAME" '.[] | select(.name == $name) | .id' virtual-hosts.json)

                  if [[ -n "$VIRTUAL_HOST_ID" && "$VIRTUAL_HOST_ID" != "null" ]]; then
                     echo "VIRTUAL_HOST_ID=$VIRTUAL_HOST_ID" >> $GITHUB_OUTPUT
                  else
                     echo "Virtual Host ID not found" >&2
                     exit 1
                  fi

            - name: Delete Preview Virtual Host
              if: steps.extract-virtual-host-id.outputs.VIRTUAL_HOST_ID != ''
              uses: ./.github/actions/devopness-request
              with:
                  host: ${{ vars.DEVOPNESS_HOST }}
                  path: "/virtual-hosts/${{ steps.extract-virtual-host-id.outputs.VIRTUAL_HOST_ID }}"
                  method: DELETE
                  token: ${{ steps.devopness-login.outputs.devopness_token }}

            - name: Post Cleanup Comment on PR
              uses: actions/github-script@v6
              with:
                  script: |
                      const commentBody = `🗑️ The preview application and virtual host for this PR have been successfully deleted.`;
                      github.rest.issues.createComment({
                          issue_number: context.issue.number,
                          owner: context.repo.owner,
                          repo: context.repo.repo,
                          body: commentBody
                      });
