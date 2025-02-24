import * as core from "@actions/core";
import * as github from "@actions/github";
import type { GitHub } from "@actions/github/lib/utils";
import type { Context } from "@actions/github/lib/context";

import { DevopnessApiClient } from "@devopness/sdk-js";
import { SourceType } from "@devopness/sdk-js/dist/api/generated/models";

import { setTimeout as sleep } from "timers/promises";

interface ApplicationResource {
    id: number;
    url: string;
}

interface CommentResource {
    id: number;
    content: string;
}

interface DeployResource {
    id: number;
    url: string;
}

interface VirtualHostResource {
    id: number;
    port: number;
    url: string;
}

interface DatabaseEntry {
    branch_name: string;
    application: ApplicationResource;
    comment: CommentResource;
    deploy: DeployResource;
    virtual_host: VirtualHostResource;
    preview_url: string;
}

type Database = Record<string, DatabaseEntry>;

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

        this.database = undefined as any;
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
        this.context = github.context;
        this.octokit = github.getOctokit(githubToken);

        this.devopnessClient = new DevopnessApiClient({
            baseURL: this.devopnessAPIUrl,
        });

        const login = await this.devopnessClient.users.loginUser({
            email: devopnessEmail,
            password: devopnessPassword,
        });

        if (login.status != 200) {
            core.setFailed("Failed to login to Devopness");
            return;
        }

        this.devopnessClient.accessToken = login.data.access_token;
        this.refreshToken = login.data.refresh_token;

        await this.readDatabase();
    }

    async commitFile(
        filePath: string,
        fileContent: string,
        commitBranch: string,
        commitMessage: string
    ) {
        if (this.context === null || this.octokit === null) {
            core.setFailed(
                "GITHUB_OCTOKIT or GITHUB_CONTEXT is not initialized"
            );
            return;
        }

        const branch = commitBranch;

        const refResponse = await this.octokit.rest.git.getRef({
            owner: this.context.repo.owner,
            repo: this.context.repo.repo,
            ref: `heads/${branch}`,
        });

        const latestCommitSha = refResponse.data.object.sha;

        const blobResponse = await this.octokit.rest.git.createBlob({
            owner: this.context.repo.owner,
            repo: this.context.repo.repo,
            content: fileContent,
            encoding: "utf-8",
        });

        const blobSha = blobResponse.data.sha;

        const treeResponse = await this.octokit.rest.git.createTree({
            owner: this.context.repo.owner,
            repo: this.context.repo.repo,
            base_tree: refResponse.data.object.sha,
            tree: [
                {
                    path: filePath,
                    mode: "100644",
                    type: "blob",
                    sha: blobSha,
                },
            ],
        });

        const treeSha = treeResponse.data.sha;

        const commitResponse = await this.octokit.rest.git.createCommit({
            owner: this.context.repo.owner,
            repo: this.context.repo.repo,
            message: commitMessage,
            tree: treeSha,
            parents: [latestCommitSha],
            author: {
                name: this.context.actor,
                email: `${this.context.actor}@users.noreply.github.com`,
            },
            committer: {
                name: this.context.actor,
                email: `${this.context.actor}@users.noreply.github.com`,
            },
        });

        const commitSha = commitResponse.data.sha;

        await this.octokit.rest.git.updateRef({
            owner: this.context.repo.owner,
            repo: this.context.repo.repo,
            ref: `heads/${branch}`,
            sha: commitSha,
        });

        core.info(
            `Successfully committed file ${filePath} to branch ${branch}`
        );
    }

    async readDatabase() {
        if (!this.devopnessClient) {
            core.setFailed("DEVOPNESS_CLIENT is not initialized");
            return;
        }

        const file = await this.devopnessClient.variables.getVariable(
            this.databaseFileId
        );

        if (file.status != 200) {
            core.setFailed("Failed to read database file");
            return;
        }

        this.database = JSON.parse(file.data.value as string);
    }

    async syncDatabase() {
        if (!this.devopnessClient) {
            core.setFailed("DEVOPNESS_CLIENT is not initialized");
            return;
        }

        const fileContent = JSON.stringify(this.database);

        const file = await this.devopnessClient.variables.getVariable(
            this.databaseFileId
        );

        if (file.status != 200) {
            core.setFailed("Failed to read database file");
            return;
        }

        const res = await this.devopnessClient.variables.updateVariable(
            this.databaseFileId,
            {
                value: fileContent,
                id: file.data.id,
                key: file.data.key,
                target: file.data.target,
                hidden: file.data.hidden,
                type: file.data.type,
            }
        );

        if (res.status != 204) {
            core.setFailed("Failed to update database file");
            return;
        }
    }

    async createApplication() {
        if (!this.devopnessClient) {
            core.setFailed("DEVOPNESS_CLIENT is not initialized");
            return;
        }

        const application =
            await this.devopnessClient.environments.applications.addEnvironmentApplication(
                this.environmentId,
                {
                    credential_id: this.credentialId,
                    repository: this.repository,
                    name: `pr-${this.prNumber}-preview`,
                    programming_language: "html",
                    engine_version: "none",
                    framework: "none",
                    default_branch: this.prBranchName,
                }
            );

        if (application.status != 201) {
            core.setFailed("Failed to create application");
            return;
        }

        return {
            id: application.data.id,
            url: `${this.devopnessAPPUrl}/projects/${this.projectId}/environments/${this.environmentId}/applications/${application.data.id}`,
        };
    }

    async createVirtualHost(applicationId: number) {
        if (!this.devopnessClient) {
            core.setFailed("DEVOPNESS_CLIENT is not initialized");
            return;
        }

        const port = this.getPort();

        if (!port) {
            core.setFailed("No available virtual host port found");
            return;
        }

        const server = await this.devopnessClient.servers.getServer(
            this.serverId
        );

        if (server.status !== 200) {
            core.setFailed("Failed to get server");
            return;
        }

        const virtualHost =
            await this.devopnessClient.environments.virtualHosts.addEnvironmentVirtualHost(
                this.environmentId,
                {
                    type: "ip-based",
                    name: `${server.data.ip_address}:${port}`,
                    application_id: applicationId,
                }
            );

        if (virtualHost.status !== 201) {
            core.setFailed("Failed to create virtual host");
            return;
        }

        return {
            id: virtualHost.data.id,
            port: port,
            url: `${this.devopnessAPPUrl}/projects/${this.projectId}/environments/${this.environmentId}/virtual-hosts/${virtualHost.data.id}`,
        };
    }

    async deployApplication(applicationId: number) {
        if (!this.devopnessClient) {
            core.setFailed("DEVOPNESS_CLIENT is not initialized");
            return;
        }

        core.info(
            `Deploying application: ${applicationId} for branch: ${this.prBranchName}`
        );

        const applicationPipelines =
            await this.devopnessClient.pipelines.listPipelinesByResourceType(
                applicationId,
                "application"
            );

        if (applicationPipelines.status != 200) {
            core.setFailed("Failed to get application pipelines");
            return;
        }

        const deployPipeline = applicationPipelines.data.find(
            (pipeline) => pipeline.operation === "deploy"
        );

        if (!deployPipeline) {
            core.setFailed("Deploy pipeline not found");
            return;
        }

        const action =
            await this.devopnessClient.pipelines.actions.addPipelineAction(
                deployPipeline.id,
                {
                    source_type: SourceType.Branch,
                    source_ref: this.prBranchName,
                    servers: [this.serverId],
                }
            );

        if (action.status != 201) {
            core.setFailed("Failed to deploy application.");
            return;
        }

        return {
            id: action.data.id,
            url: action.data.url_web_permalink,
        };
    }

    async deleteApplication(applicationId: number) {
        if (!this.devopnessClient) {
            core.setFailed("DEVOPNESS_CLIENT is not initialized.");
            return;
        }

        core.info(`Deleting application with ID ${applicationId}.`);

        const req = await this.devopnessClient.applications.deleteApplication(
            applicationId
        );

        if (req.status != 204) {
            core.setFailed("Failed to delete application.");
            return;
        }

        core.info("Application deleted successfully.");
    }

    async deleteVirtualHost(virtualHostId: number) {
        if (!this.devopnessClient) {
            core.setFailed("DEVOPNESS_CLIENT is not initialized.");
            return;
        }

        core.info(`Deleting virtual host with ID ${virtualHostId}.`);

        const req = await this.devopnessClient.virtualHosts.deleteVirtualHost(
            virtualHostId
        );

        if (req.status != 204) {
            core.setFailed("Failed to delete virtual host.");
            return;
        }

        core.info("Virtual host deleted successfully.");
    }

    async getServer() {
        if (!this.devopnessClient) {
            core.setFailed("DEVOPNESS_CLIENT is not initialized.");
            return;
        }

        const server = await this.devopnessClient.servers.getServer(
            this.serverId
        );

        if (server.status != 200) {
            core.setFailed("Failed to get server.");
            return;
        }

        return server.data;
    }

    async watchAction(actionId: number, timeoutMinutes = 30): Promise<void> {
        const startTime = Date.now();
        const timeoutMs = timeoutMinutes * 60 * 1000;

        core.info(`Watching action ${actionId}...`);

        while (Date.now() - startTime < timeoutMs) {
            const { data: action } =
                await this.devopnessClient.actions.getAction(actionId);

            if (action.status === "completed") {
                core.info(`Action ${actionId} completed`);
                break;
            }

            if (["failed", "skipped"].includes(action.status)) {
                throw new Error(
                    `Action ${actionId} failed with status: ${action.status}`
                );
            }

            core.info(
                `Action ${actionId} still in progress... Waiting 30 seconds...`
            );

            await sleep(30_000);
        }

        const { data: finalAction } =
            await this.devopnessClient.actions.getAction(actionId);

        await Promise.all(
            finalAction.children.map((child) => this.watchAction(child.id))
        );
    }

    getPort() {
        const usedPorts = new Set();
        for (const key in this.database) {
            usedPorts.add(this.database[key].virtual_host.port);
        }

        for (let port = 9000; port <= 9500; port++) {
            if (!usedPorts.has(port)) {
                return port;
            }
        }

        return null;
    }
}

async function openPullRequest(manager: Manager) {
    core.info(
        `Handling pull request opened event for PR number: ${manager.prNumber}`
    );

    const issueComment = await manager.octokit!.rest.issues.createComment({
        owner: manager.context!.repo.owner,
        repo: manager.context!.repo.repo,
        issue_number: manager.prNumber,
        body: "🚀 Preparing your preview environment...\n\n",
    });

    const commentId = issueComment.data.id;

    manager.database[manager.prNumber].comment.id = commentId;
    manager.database[manager.prNumber].comment.content = issueComment.data
        .body as string;

    const application = await manager.createApplication();
    if (!application) {
        core.setFailed("Failed to create application");
        return;
    }

    manager.database[manager.prNumber].application = application;

    const virtualHost = await manager.createVirtualHost(application.id);
    if (!virtualHost) {
        core.setFailed("Failed to create virtual host");
        return;
    }

    manager.database[manager.prNumber].virtual_host = virtualHost;

    manager.database[
        manager.prNumber
    ].comment.content = `✅ Preview environment initialized

**Application:** [${application.id}](${application.url})
**Virtual Host:** [${virtualHost.id}](${virtualHost.url})

⚡ Deployment Starting...
`;

    await manager.octokit!.rest.issues.updateComment({
        owner: manager.context!.repo.owner,
        repo: manager.context!.repo.repo,
        comment_id: commentId,
        body: manager.database[manager.prNumber].comment.content,
    });

    const deployment = await manager.deployApplication(application.id);
    if (!deployment) {
        core.setFailed("Failed to deploy application");
        return;
    }

    manager.database[manager.prNumber].deploy = deployment;

    await manager.syncDatabase();

    manager.database[
        manager.prNumber
    ].comment.content = `✅ Preview environment initialized

**Application:** [${application.id}](${application.url})
**Virtual Host:** [${virtualHost.id}](${virtualHost.url})

🚢 Deployment in Progress

**Deployment ID:** ${deployment.id} - [View details](${deployment.url})

🔍 Monitoring every 30 seconds...
`;

    await manager.octokit!.rest.issues.updateComment({
        owner: manager.context!.repo.owner,
        repo: manager.context!.repo.repo,
        comment_id: commentId,
        body: manager.database[manager.prNumber].comment.content,
    });

    await manager.watchAction(deployment.id);

    const server = await manager.getServer();
    if (!server) {
        core.setFailed("Failed to get server.");
        return;
    }

    manager.database[
        manager.prNumber
    ].preview_url = `http://${server.ip_address}:${virtualHost.port}/`;

    await manager.syncDatabase();

    manager.database[
        manager.prNumber
    ].comment.content = `🎉 Preview Environment Ready!

**Application:** [${application.id}](${application.url})
**Virtual Host:** [${virtualHost.id}](${virtualHost.url})

🚢 Deployment Completed

**Deployment ID:** ${deployment.id} - [View details](${deployment.url})

Access the **Application Preview** in ${
        manager.database[manager.prNumber].preview_url
    }`;

    await manager.octokit!.rest.issues.updateComment({
        owner: manager.context!.repo.owner,
        repo: manager.context!.repo.repo,
        comment_id: commentId,
        body: manager.database[manager.prNumber].comment.content,
    });

    core.info(
        `Preview environment setup completed for PR number: ${manager.prNumber}`
    );
}

async function syncPullRequest(manager: Manager) {
    core.info(
        `Handling pull request synchronized event for PR number: ${manager.prNumber}`
    );

    if (
        !manager.database[manager.prNumber] ||
        !manager.database[manager.prNumber].comment.id
    ) {
        core.warning(
            `No existing preview environment found for PR number: ${manager.prNumber} to synchronize.`
        );
        core.warning(
            `This might happen if the 'opened' event was missed or the database is inconsistent.`
        );
        core.warning(`Will skip synchronization for this 'synchronize' event.`);
        return;
    }

    const commentId = manager.database[manager.prNumber].comment.id;

    await manager.octokit!.rest.issues.updateComment({
        owner: manager.context!.repo.owner,
        repo: manager.context!.repo.repo,
        comment_id: commentId,
        body: `🔄 Synchronizing Preview Environment...`,
    });

    const application = manager.database[manager.prNumber].application;
    if (!application || !application.id) {
        core.setFailed(
            `Application data not found in database for PR number: ${manager.prNumber} during synchronize.`
        );
        return;
    }

    const virtualHost = manager.database[manager.prNumber].virtual_host;
    if (!virtualHost || !virtualHost.id) {
        core.setFailed(
            `Virtual host data not found in database for PR number: ${manager.prNumber} during synchronize.`
        );
        return;
    }

    const deployment = await manager.deployApplication(application.id);
    if (!deployment) {
        core.setFailed("Failed to deploy application");
        return;
    }

    manager.database[manager.prNumber].deploy = deployment;

    await manager.syncDatabase();

    manager.database[
        manager.prNumber
    ].comment.content = `✅ Preview environment synchronized

**Application:** [${application.id}](${application.url})
**Virtual Host:** [${virtualHost.id}](${virtualHost.url})
    
🚢 Deployment in Progress
    
**Deployment ID:** ${deployment.id} - [View details](${deployment.url})
    
🔍 Monitoring every 30 seconds...
    `;

    await manager.octokit!.rest.issues.updateComment({
        owner: manager.context!.repo.owner,
        repo: manager.context!.repo.repo,
        comment_id: commentId,
        body: manager.database[manager.prNumber].comment.content,
    });

    await manager.watchAction(deployment.id);

    await manager.syncDatabase();

    manager.database[
        manager.prNumber
    ].comment.content = `🎉 Preview Environment Ready!

**Application:** [${application.id}](${application.url})
**Virtual Host:** [${virtualHost.id}](${virtualHost.url})

🚢 Deployment Completed

**Deployment ID:** ${deployment.id} - [View details](${deployment.url})

Access the **Application Preview** in ${
        manager.database[manager.prNumber].preview_url
    }`;

    await manager.octokit!.rest.issues.updateComment({
        owner: manager.context!.repo.owner,
        repo: manager.context!.repo.repo,
        comment_id: commentId,
        body: manager.database[manager.prNumber].comment.content,
    });

    core.info(
        `Preview environment synchronization completed for PR number: ${manager.prNumber}`
    );
}

async function closePullRequest(manager: Manager) {
    const commentId = manager.database[manager.prNumber].comment.id;
    if (!commentId) {
        core.info(
            `No comment ID found for PR number: ${manager.prNumber}. Skipping deletion of resources.`
        );
        return;
    }

    await manager.octokit!.rest.issues.updateComment({
        owner: manager.context!.repo.owner,
        repo: manager.context!.repo.repo,
        comment_id: commentId,
        body: `🧹 Cleaning Up Preview Environment...`,
    });

    const application = manager.database[manager.prNumber].application;
    if (application) {
        await manager.deleteApplication(application.id);
    } else {
        core.info("No application to delete.");
    }

    const virtualHost = manager.database[manager.prNumber].virtual_host;
    if (virtualHost) {
        await manager.deleteVirtualHost(virtualHost.id);
    } else {
        core.info("No virtual host to delete.");
    }

    delete manager.database[manager.prNumber];
    await manager.syncDatabase();

    await manager.octokit!.rest.issues.updateComment({
        owner: manager.context!.repo.owner,
        repo: manager.context!.repo.repo,
        comment_id: commentId,
        body: `🧹 Preview environment cleaned up.`,
    });
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
        core.setFailed(`The event name ${eventName} is not supported`);
        return;
    }

    const pullRequest = payload.pull_request;
    if (!pullRequest) {
        core.setFailed("The pull request is not available");
        return;
    }

    manager.prNumber = pullRequest.number;
    manager.prBranchName = pullRequest.head.ref;

    const action = payload.action;

    if (!manager.database[manager.prNumber]) {
        manager.database[manager.prNumber] = {
            branch_name: manager.prBranchName,
            application: {
                id: 0,
                url: "",
            },
            comment: {
                id: 0,
                content: "",
            },
            deploy: {
                id: 0,
                url: "",
            },
            virtual_host: {
                id: 0,
                port: 0,
                url: "",
            },
            preview_url: "",
        };
    }

    if (action === "opened") {
        await openPullRequest(manager);
    }

    if (action === "synchronize") {
        await syncPullRequest(manager);
    }

    if (action === "closed") {
        await closePullRequest(manager);
    }
}

run();
