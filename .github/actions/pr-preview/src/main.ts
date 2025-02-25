import * as core from "@actions/core";
import * as github from "@actions/github";
import type { Context } from "@actions/github/lib/context";

import { DevopnessApiClient } from "@devopness/sdk-js";

import { type Database, loadDatabase } from "./database";
import { Env } from "./env";
import {
    handleClosePullRequest,
    handleOpenPullRequest,
    handleSyncPullRequest,
} from "./pull-request";

type Inputs = {
    credentialId: number;
    databaseFileId: number;
    devopnessAPIUrl: string;
    devopnessAPPUrl: string;
    devopnessEmail: string;
    devopnessPassword: string;
    environmentId: number;
    githubToken: string;
    projectId: number;
    repository: string;
    serverId: number;
};

function getInputs(): Inputs {
    const githubToken = core.getInput("token", { required: true });

    const devopnessEmail = core.getInput("email", { required: true });
    const devopnessPassword = core.getInput("password", { required: true });

    const devopnessAPIUrl = core.getInput("api_url", { required: true });
    const devopnessAPPUrl = core.getInput("app_url", { required: true });

    const projectId = Number(core.getInput("project_id", { required: true }));
    const environmentId = Number(
        core.getInput("environment_id", { required: true })
    );
    const credentialId = Number(
        core.getInput("credential_id", { required: true })
    );
    const serverId = Number(core.getInput("server_id", { required: true }));

    const databaseFileId = Number(
        core.getInput("database_file_id", { required: true })
    );

    const repository = core.getInput("repository", { required: true });

    return {
        credentialId,
        databaseFileId,
        devopnessAPIUrl,
        devopnessAPPUrl,
        devopnessEmail,
        devopnessPassword,
        environmentId,
        githubToken,
        projectId,
        repository,
        serverId,
    };
}

async function initClients(inputs: Inputs): Promise<{
    context: Context;
    database: Database;
    devopnessClient: DevopnessApiClient;
    octokit: ReturnType<typeof github.getOctokit>;
} | null> {
    core.info("Initializing Manager...");

    const context = github.context;
    const octokit = github.getOctokit(inputs.githubToken);

    const devopnessClient = new DevopnessApiClient({
        baseURL: inputs.devopnessAPIUrl,
    });

    core.info(`Logging in to Devopness API at: ${inputs.devopnessAPIUrl}`);
    try {
        const login = await devopnessClient.users.loginUser({
            email: inputs.devopnessEmail,
            password: inputs.devopnessPassword,
        });

        if (login.status !== 200) {
            core.setFailed(
                `Devopness Login failed with status code: ${login.status}`
            );

            return null;
        }

        devopnessClient.accessToken = login.data.access_token;
        core.info("Devopness Login successful.");
    } catch (error: any) {
        core.setFailed(`Devopness Login failed: ${error.message}`);

        return null;
    }

    const database = await loadDatabase(inputs.databaseFileId, devopnessClient);
    if (!database) {
        core.setFailed("Failed to load database");

        return null;
    }

    core.info("Manager initialization complete.");

    return { context, database, devopnessClient, octokit };
}

async function run() {
    const inputs = getInputs();

    const clients = await initClients(inputs);
    if (!clients) {
        core.setFailed("Failed to initialize clients");

        return;
    }
    const { context, database, devopnessClient, octokit } = clients;

    const eventName = context.eventName;
    const payload = context?.payload;

    if (!eventName || !payload) {
        core.setFailed("The event name or payload is not available");
        return;
    }

    if (eventName !== "pull_request") {
        core.setFailed(
            `The event name ${eventName} is not supported. Expected 'pull_request', got '${eventName}'`
        );
        return;
    }

    const pullRequest = payload.pull_request;
    if (!pullRequest) {
        core.setFailed("The pull request payload is not available");
        return;
    }

    const environment = new Env(
        inputs.credentialId,
        inputs.databaseFileId,
        inputs.devopnessAPPUrl,
        inputs.environmentId,
        pullRequest.head.ref,
        pullRequest.number,
        inputs.projectId,
        inputs.repository,
        inputs.serverId
    );

    const action = payload.action;
    core.info(`Handling pull request action: ${action}`);

    if (!database[environment.prNumber]) {
        database[environment.prNumber] = {
            branch_name: environment.prBranchName,
            application: { id: 0, url: "" },
            comment: { id: 0, content: "" },
            deploy: { id: 0, url: "" },
            virtual_host: { id: 0, port: 0, url: "" },
            preview_url: "",
        };
    }

    if (action === "opened") {
        await handleOpenPullRequest(
            context,
            octokit,
            database,
            devopnessClient,
            environment
        );
    } else if (action === "synchronize") {
        await handleSyncPullRequest(
            context,
            octokit,
            database,
            devopnessClient,
            environment
        );
    } else if (action === "closed") {
        await handleClosePullRequest(
            context,
            octokit,
            database,
            devopnessClient,
            environment
        );
    } else {
        core.warning(
            `No action configured for pull request event action: ${action}`
        );
    }
}

run();
