name: CI - Preview Application

on:
    pull_request:
        types:
            - opened
            - reopened

concurrency:
    group: ${{ github.workflow }}-${{ github.ref }}
    cancel-in-progress: false

jobs:
    preview-application:
        name: Preview Application
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

            - name: Create the Application
              id: create-application
              uses: ./.github/actions/devopness-application
              with:
                  host: ${{ vars.DEVOPNESS_HOST }}
                  token: ${{ steps.devopness-login.outputs.devopness_token }}

                  create: true
                  create_environment_id: ${{ vars.DEVOPNESS_ENVIRONMENT_ID }}
                  create_credential_id: ${{ vars.DEVOPNESS_CREDENTIAL_ID }}
                  create_name: pr-${{ github.event.number }}-preview
                  create_programming_language: html
                  create_engine_version: none
                  create_framework: none
                  create_repository: Diegiwg/devopness-tests
                  create_default_branch: main

            - name: Extract Application ID
              id: parse-application-id
              run: |
                  APP_ID=$(echo '${{ steps.create-application.outputs.create_response }}' | jq -r '.id')
                  echo "APPLICATION_ID=$APP_ID" >> $GITHUB_OUTPUT

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
                  SERVER_ID=$(echo '${{ steps.get-server.outputs.response }}' | jq -r '.id')
                  echo "SERVER_ID=$SERVER_ID" >> $GITHUB_OUTPUT

                  SERVER_IP=$(echo '${{ steps.get-server.outputs.response }}' | jq -r '.ip_address')
                  echo "SERVER_IP=$SERVER_IP" >> $GITHUB_OUTPUT

            - name: Create the Virtual Host
              id: create-virtual-host
              uses: ./.github/actions/devopness-request
              with:
                  host: ${{ vars.DEVOPNESS_HOST }}
                  path: "/environments/${{vars.DEVOPNESS_ENVIRONMENT_ID}}/virtual-hosts"
                  method: POST
                  token: ${{ steps.devopness-login.outputs.devopness_token }}
                  data: '{"type": "ip-based", "name": "${{ steps.parse-server-data.outputs.SERVER_IP }}:6969", "application_id": "${{ steps.parse-application-id.outputs.APPLICATION_ID }}"}'

            - name: Fetch Deployment Pipeline
              id: get-deploy-pipeline
              uses: ./.github/actions/devopness-request
              with:
                  host: ${{ vars.DEVOPNESS_HOST }}
                  path: "/pipelines/application/${{ steps.parse-application-id.outputs.APPLICATION_ID }}"
                  method: GET
                  token: ${{ steps.devopness-login.outputs.devopness_token }}

            - name: Extract Deployment Pipeline ID
              id: parse-deploy-pipeline-id
              run: |
                  PIPELINE_ID=$(echo '${{ steps.get-deploy-pipeline.outputs.response }}' | jq -r '.[0].id')
                  echo "PIPELINE_ID=$PIPELINE_ID" >> $GITHUB_OUTPUT

            - name: Trigger Application Deployment
              id: deploy-application
              uses: ./.github/actions/devopness-request
              with:
                  host: ${{ vars.DEVOPNESS_HOST }}
                  path: "/pipelines/${{ steps.parse-deploy-pipeline-id.outputs.PIPELINE_ID }}/actions"
                  method: POST
                  token: ${{ steps.devopness-login.outputs.devopness_token }}
                  data: '{"operation": "deploy", "source_ref": "master", "source_type": "branch", "servers": [${{ steps.parse-server-data.outputs.SERVER_ID }}]}'

            - name: Post Deployment Comment on PR
              uses: actions/github-script@v6
              with:
                  script: |
                      const previewUrl = `http://${{ steps.parse-server-data.outputs.SERVER_IP }}:6969`;
                      const commentBody = `🚀 Hello! Your preview application has been successfully deployed! ✨\n\nYou can access it here: [${previewUrl}](${previewUrl})\n\nHappy coding! 😊💻`;
                      github.rest.issues.createComment({
                      issue_number: context.issue.number,
                      owner: context.repo.owner,
                      repo: context.repo.repo,
                      body: commentBody
                      });
