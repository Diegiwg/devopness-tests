import * as core from "@actions/core";
import * as github from "@actions/github";
import type { GitHub } from "@actions/github/lib/utils";
import type { Context } from "@actions/github/lib/context";

import { DevopnessApiClient } from "@devopness/sdk-js";

import { loadDatabase, type Database } from "./src/database";
import {
    handleClosePullRequest,
    handleOpenPullRequest,
    handleSyncPullRequest,
} from "./src/pull-request";

class Manager {
    public context: Context;
    public octokit: InstanceType<typeof GitHub>;

    public devopnessClient: DevopnessApiClient;
    public devopnessAPIUrl: string;
    public devopnessAPPUrl: string;
    public refreshToken: string;

    public database: Database;
    public databaseFileId: number;

    public projectId: number;
    public environmentId: number;
    public serverId: number;
    public credentialId: number;

    public prNumber: number;
    public prBranchName: string;

    public repository: string;

    constructor(
        devopnessAPIUrl: string,
        devopnessAPPUrl: string,
        databaseFileId: number,
        projectId: number,
        environmentId: number,
        serverId: number,
        credentialId: number,
        repository: string
    ) {
        this.context = undefined as any;
        this.octokit = undefined as any;

        this.devopnessClient = undefined as any;
        this.devopnessAPIUrl = devopnessAPIUrl;
        this.devopnessAPPUrl = devopnessAPPUrl;
        this.refreshToken = undefined as any;

        this.database = {};
        this.databaseFileId = databaseFileId;

        this.projectId = projectId;
        this.environmentId = environmentId;
        this.serverId = serverId;
        this.credentialId = credentialId;

        this.prNumber = undefined as any;
        this.prBranchName = undefined as any;

        this.repository = repository;
    }

    async initialize(
        githubToken: string,
        devopnessEmail: string,
        devopnessPassword: string
    ) {
        core.info("Initializing Manager...");
        this.context = github.context;
        this.octokit = github.getOctokit(githubToken);

        this.devopnessClient = new DevopnessApiClient({
            baseURL: this.devopnessAPIUrl,
        });

        core.info(`Logging in to Devopness API at: ${this.devopnessAPIUrl}`);
        try {
            const login = await this.devopnessClient.users.loginUser({
                email: devopnessEmail,
                password: devopnessPassword,
            });

            if (login.status !== 200) {
                core.setFailed(
                    `Devopness Login failed with status code: ${login.status}`
                );
                return;
            }

            this.devopnessClient.accessToken = login.data.access_token;
            this.refreshToken = login.data.refresh_token;
            core.info("Devopness Login successful.");
        } catch (error: any) {
            core.setFailed(`Devopness Login failed: ${error.message}`);
            return;
        }

        await loadDatabase(this.devopnessClient, this.databaseFileId);
        core.info("Manager initialization complete.");
    }
}

async function run() {
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

    const manager = new Manager(
        devopnessAPIUrl,
        devopnessAPPUrl,
        databaseFileId,
        projectId,
        environmentId,
        serverId,
        credentialId,
        repository
    );

    await manager.initialize(githubToken, devopnessEmail, devopnessPassword);

    const eventName = manager.context.eventName;
    const payload = manager.context?.payload;

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

    manager.prNumber = pullRequest.number;
    manager.prBranchName = pullRequest.head.ref;

    const action = payload.action;
    core.info(`Handling pull request action: ${action}`);

    if (!manager.database[manager.prNumber]) {
        manager.database[manager.prNumber] = {
            branch_name: manager.prBranchName,
            application: { id: 0, url: "" },
            comment: { id: 0, content: "" },
            deploy: { id: 0, url: "" },
            virtual_host: { id: 0, port: 0, url: "" },
            preview_url: "",
        };
    }

    if (action === "opened") {
        await handleOpenPullRequest(
            manager.context,
            manager.octokit,
            manager.devopnessClient,
            manager.database,
            {
                credentialId: manager.credentialId,
                databaseFileId: manager.databaseFileId,
                devopnessAPPUrl: manager.devopnessAPPUrl,
                environmentId: manager.environmentId,
                prBranchName: manager.prBranchName,
                prNumber: manager.prNumber,
                projectId: manager.projectId,
                repository: manager.repository,
                serverId: manager.serverId,
            }
        );

        return;
    }

    if (action === "synchronize") {
        await handleSyncPullRequest(
            manager.context,
            manager.octokit,
            manager.devopnessClient,
            manager.database,
            {
                databaseFileId: manager.databaseFileId,
                prBranchName: manager.prBranchName,
                prNumber: manager.prNumber,
                serverId: manager.serverId,
            }
        );

        return;
    }

    if (action === "closed") {
        await handleClosePullRequest(
            manager.context,
            manager.octokit,
            manager.devopnessClient,
            manager.database,
            {
                databaseFileId: manager.databaseFileId,
                prNumber: manager.prNumber,
            }
        );

        return;
    }

    core.warning(
        `No action configured for pull request event action: ${action}`
    );
}

run();
