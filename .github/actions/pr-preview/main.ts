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

        await this.readDatabase();
        core.info("Manager initialization complete.");
    }

    async readDatabase() {
        core.debug("Reading database file...");
        if (!this.devopnessClient) {
            core.setFailed("DEVOPNESS_CLIENT is not initialized");
            return;
        }

        try {
            const file = await this.devopnessClient.variables.getVariable(
                this.databaseFileId
            );

            if (file.status !== 200) {
                core.setFailed(
                    `Failed to read database file. Status code: ${file.status}`
                );
                return;
            }

            if (file.data.value) {
                this.database = JSON.parse(file.data.value as string);
            } else {
                this.database = {};
            }
            core.debug("Database file read successfully.");
        } catch (error: any) {
            core.setFailed(`Failed to read database file: ${error.message}`);
        }
    }

    async syncDatabase() {
        core.debug("Syncing database file...");
        if (!this.devopnessClient) {
            core.setFailed("DEVOPNESS_CLIENT is not initialized");
            return;
        }

        if (
            this.database[this.prNumber] &&
            this.database[this.prNumber].comment
        ) {
            this.database[this.prNumber].comment.content = "";
        }

        const fileContent = JSON.stringify(this.database);

        try {
            const file = await this.devopnessClient.variables.getVariable(
                this.databaseFileId
            );

            if (file.status !== 200) {
                core.setFailed(
                    `Failed to read database file before update. Status code: ${file.status}`
                );
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

            if (res.status !== 204) {
                core.setFailed(
                    `Failed to update database file. Status code: ${res.status}`
                );
                return;
            }
            core.debug("Database file synced successfully.");
        } catch (error: any) {
            core.setFailed(`Failed to sync database file: ${error.message}`);
        }
    }

    async createApplication(): Promise<ApplicationResource | null> {
        core.debug(`Creating application for PR number: ${this.prNumber}`);
        if (!this.devopnessClient) {
            core.setFailed("DEVOPNESS_CLIENT is not initialized");
            return null;
        }

        try {
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

            if (application.status !== 201) {
                core.setFailed(
                    `Failed to create application. Status code: ${application.status}`
                );
                return null;
            }

            core.info(
                `Application created successfully. ID: ${application.data.id}, URL: ${this.devopnessAPPUrl}/projects/${this.projectId}/environments/${this.environmentId}/applications/${application.data.id}`
            );
            return {
                id: application.data.id,
                url: `${this.devopnessAPPUrl}/projects/${this.projectId}/environments/${this.environmentId}/applications/${application.data.id}`,
            };
        } catch (error: any) {
            core.setFailed(`Failed to create application: ${error.message}`);
            return null;
        }
    }

    async createVirtualHost(
        applicationId: number
    ): Promise<VirtualHostResource | null> {
        core.debug(
            `Creating virtual host for application ID: ${applicationId}`
        );
        if (!this.devopnessClient) {
            core.setFailed("DEVOPNESS_CLIENT is not initialized");
            return null;
        }

        const port = this.getPort();

        if (!port) {
            core.setFailed("No available virtual host port found");
            return null;
        }

        try {
            const server = await this.getServer();
            if (!server) {
                return null;
            }

            const virtualHost =
                await this.devopnessClient.environments.virtualHosts.addEnvironmentVirtualHost(
                    this.environmentId,
                    {
                        type: "ip-based",
                        name: `${server.ip_address}:${port}`,
                        application_id: applicationId,
                    }
                );

            if (virtualHost.status !== 201) {
                core.setFailed(
                    `Failed to create virtual host. Status code: ${virtualHost.status}`
                );
                return null;
            }
            core.info(
                `Virtual host created successfully. ID: ${virtualHost.data.id}, Port: ${port}, URL: ${this.devopnessAPPUrl}/projects/${this.projectId}/environments/${this.environmentId}/virtual-hosts/${virtualHost.data.id}`
            );
            return {
                id: virtualHost.data.id,
                port: port,
                url: `${this.devopnessAPPUrl}/projects/${this.projectId}/environments/${this.environmentId}/virtual-hosts/${virtualHost.data.id}`,
            };
        } catch (error: any) {
            core.setFailed(`Failed to create virtual host: ${error.message}`);
            return null;
        }
    }

    async deployApplication(
        applicationId: number
    ): Promise<DeployResource | null> {
        core.debug(
            `Deploying application ID: ${applicationId}, branch: ${this.prBranchName}`
        );
        if (!this.devopnessClient) {
            core.setFailed("DEVOPNESS_CLIENT is not initialized");
            return null;
        }

        core.info(
            `Deploying application: ${applicationId} for branch: ${this.prBranchName}`
        );

        try {
            const applicationPipelines =
                await this.devopnessClient.pipelines.listPipelinesByResourceType(
                    applicationId,
                    "application"
                );

            if (applicationPipelines.status !== 200) {
                core.setFailed(
                    `Failed to get application pipelines. Status code: ${applicationPipelines.status}`
                );
                return null;
            }

            const deployPipeline = applicationPipelines.data.find(
                (pipeline) => pipeline.operation === "deploy"
            );

            if (!deployPipeline) {
                core.setFailed("Deploy pipeline not found for application");
                return null;
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

            if (action.status !== 201) {
                core.setFailed(
                    `Failed to deploy application. Status code: ${action.status}`
                );
                return null;
            }
            core.info(
                `Deployment started successfully. Action ID: ${action.data.id}, URL: ${action.data.url_web_permalink}`
            );
            return {
                id: action.data.id,
                url: action.data.url_web_permalink,
            };
        } catch (error: any) {
            core.setFailed(`Failed to deploy application: ${error.message}`);
            return null;
        }
    }

    async deleteApplication(applicationId: number): Promise<void> {
        core.debug(`Deleting application ID: ${applicationId}`);
        if (!this.devopnessClient) {
            core.setFailed("DEVOPNESS_CLIENT is not initialized.");
            return;
        }

        core.info(`Deleting application with ID ${applicationId}.`);

        try {
            const req =
                await this.devopnessClient.applications.deleteApplication(
                    applicationId
                );

            if (req.status !== 204) {
                core.setFailed(
                    `Failed to delete application. Status code: ${req.status}`
                );
                return;
            }

            core.info(`Application ID ${applicationId} deleted successfully.`);
        } catch (error: any) {
            core.setFailed(
                `Failed to delete application ID ${applicationId}: ${error.message}`
            );
        }
    }

    async deleteVirtualHost(virtualHostId: number): Promise<void> {
        core.debug(`Deleting virtual host ID: ${virtualHostId}`);
        if (!this.devopnessClient) {
            core.setFailed("DEVOPNESS_CLIENT is not initialized.");
            return;
        }

        core.info(`Deleting virtual host with ID ${virtualHostId}.`);

        try {
            const req =
                await this.devopnessClient.virtualHosts.deleteVirtualHost(
                    virtualHostId
                );

            if (req.status !== 204) {
                core.setFailed(
                    `Failed to delete virtual host. Status code: ${req.status}`
                );
                return;
            }
            core.info(`Virtual host ID ${virtualHostId} deleted successfully.`);
        } catch (error: any) {
            core.setFailed(
                `Failed to delete virtual host ID ${virtualHostId}: ${error.message}`
            );
        }
    }

    async getServer(): Promise<{ ip_address: string } | null> {
        core.debug(`Getting server details for server ID: ${this.serverId}`);
        if (!this.devopnessClient) {
            core.setFailed("DEVOPNESS_CLIENT is not initialized.");
            return null;
        }

        try {
            const server = await this.devopnessClient.servers.getServer(
                this.serverId
            );

            if (server.status !== 200) {
                core.setFailed(
                    `Failed to get server. Status code: ${server.status}`
                );
                return null;
            }

            return server.data;
        } catch (error: any) {
            core.setFailed(`Failed to get server: ${error.message}`);
            return null;
        }
    }

    async watchAction(actionId: number, timeoutMinutes = 30): Promise<void> {
        core.info(
            `Watching action ${actionId}... Timeout: ${timeoutMinutes} minutes.`
        );
        const startTime = Date.now();
        const timeoutMs = timeoutMinutes * 60 * 1000;

        while (Date.now() - startTime < timeoutMs) {
            try {
                const { data: action } =
                    await this.devopnessClient.actions.getAction(actionId);

                if (action.status === "completed") {
                    core.info(`Action ${actionId} completed.`);
                    return;
                }

                if (["failed", "skipped"].includes(action.status)) {
                    throw new Error(
                        `Action ${actionId} failed with status: ${action.status}`
                    );
                }

                core.info(
                    `Action ${actionId} status: ${action.status}. Waiting 30 seconds...`
                );
                await sleep(30_000);
            } catch (error: any) {
                core.warning(
                    `Error while watching action ${actionId}: ${error.message}. Retrying in 30 seconds...`
                );
                await sleep(30_000);
            }
        }

        const { data: finalAction } =
            await this.devopnessClient.actions.getAction(actionId);

        if (finalAction.status !== "completed") {
            throw new Error(
                `Action ${actionId} timed out after ${timeoutMinutes} minutes. Final status: ${finalAction.status}`
            );
        }

        await Promise.all(
            finalAction.children.map(async (child) => {
                try {
                    await this.watchAction(child.id, timeoutMinutes);
                } catch (error) {
                    core.error(`Child action ${child.id} failed: ${error}`);
                }
            })
        );
    }

    getPort(): number | null {
        core.debug("Finding available port...");
        const usedPorts = new Set<number>();
        for (const key in this.database) {
            if (this.database[key]?.virtual_host?.port) {
                usedPorts.add(this.database[key].virtual_host.port);
            }
        }

        for (let port = 9000; port <= 9500; port++) {
            if (!usedPorts.has(port)) {
                core.debug(`Available port found: ${port}`);
                return port;
            }
        }

        core.warning("No available port found in the range 9000-9500.");
        return null;
    }

    async handleOpenPullRequest(): Promise<void> {
        core.info(
            `Handling pull request opened event for PR number: ${this.prNumber}`
        );

        const comment = await this.createPreviewComment();
        if (!comment) return;
        this.updateDatabaseEntry(this.prNumber, { comment: comment });

        const application = await this.createApplication();
        if (!application) return;
        this.updateDatabaseEntry(this.prNumber, { application: application });

        const virtualHost = await this.createVirtualHost(application.id);
        if (!virtualHost) return;
        this.updateDatabaseEntry(this.prNumber, { virtual_host: virtualHost });

        await this.updatePreviewCommentDeploymentStart(
            comment.id,
            application,
            virtualHost
        );

        const deployment = await this.deployApplication(application.id);
        if (!deployment) return;

        this.updateDatabaseEntry(this.prNumber, { deploy: deployment });
        await this.syncDatabase();

        await this.updatePreviewCommentDeploymentInProgress(
            comment.id,
            application,
            virtualHost,
            deployment
        );

        try {
            await this.watchAction(deployment.id);
        } catch (error: any) {
            core.setFailed(`Deployment watch failed: ${error.message}`);
            await this.updatePreviewCommentDeploymentFailed(
                comment.id,
                application,
                virtualHost,
                deployment,
                error.message
            );
            return;
        }

        const server = await this.getServer();
        if (!server) return;

        this.updateDatabaseEntry(this.prNumber, {
            preview_url: `http://${server.ip_address}:${virtualHost.port}/`,
        });
        await this.syncDatabase();

        await this.updatePreviewCommentDeploymentSuccess(
            comment.id,
            application,
            virtualHost,
            deployment,
            this.database[this.prNumber].preview_url
        );

        core.info(
            `Preview environment setup completed for PR number: ${this.prNumber}`
        );
    }

    async handleSyncPullRequest(): Promise<void> {
        core.info(
            `Handling pull request synchronized event for PR number: ${this.prNumber}`
        );

        const dbEntry = this.getDatabaseEntry(this.prNumber);
        if (!dbEntry || !dbEntry.comment.id) {
            core.warning(
                `No existing preview environment found for PR number: ${this.prNumber} to synchronize.`
            );
            core.warning(
                `This might happen if the 'opened' event was missed or the database is inconsistent.`
            );
            core.warning(
                `Skipping synchronization for this 'synchronize' event.`
            );
            return;
        }

        const commentId = dbEntry.comment.id;

        await this.updatePreviewCommentSynchronizing(commentId);

        const application = dbEntry.application;
        if (!application || !application.id) {
            core.setFailed(
                `Application data not found in database for PR number: ${this.prNumber} during synchronize.`
            );
            return;
        }

        const virtualHost = dbEntry.virtual_host;
        if (!virtualHost || !virtualHost.id) {
            core.setFailed(
                `Virtual host data not found in database for PR number: ${this.prNumber} during synchronize.`
            );
            return;
        }

        const deployment = await this.deployApplication(application.id);
        if (!deployment) return;
        this.updateDatabaseEntry(this.prNumber, { deploy: deployment });
        await this.syncDatabase();

        await this.updatePreviewCommentDeploymentInProgress(
            commentId,
            application,
            virtualHost,
            deployment
        );

        try {
            await this.watchAction(deployment.id);
        } catch (error: any) {
            core.setFailed(
                `Deployment watch failed during synchronize: ${error.message}`
            );
            await this.updatePreviewCommentDeploymentFailed(
                commentId,
                application,
                virtualHost,
                deployment,
                error.message
            );
            return;
        }

        await this.syncDatabase();

        await this.updatePreviewCommentDeploymentSuccess(
            commentId,
            application,
            virtualHost,
            deployment,
            dbEntry.preview_url
        );

        core.info(
            `Preview environment synchronization completed for PR number: ${this.prNumber}`
        );
    }

    async handleClosePullRequest(): Promise<void> {
        core.info(
            `Handling pull request closed event for PR number: ${this.prNumber}`
        );
        const dbEntry = this.getDatabaseEntry(this.prNumber);
        const commentId = dbEntry?.comment.id;

        if (!commentId) {
            core.info(
                `No comment ID found for PR number: ${this.prNumber}. Skipping resource cleanup comment update.`
            );
        } else {
            await this.updatePreviewCommentCleaningUp(commentId);
        }

        const application = dbEntry?.application;
        if (application) {
            await this.deleteApplication(application.id);
        } else {
            core.info("No application to delete for this PR.");
        }

        const virtualHost = dbEntry?.virtual_host;
        if (virtualHost) {
            await this.deleteVirtualHost(virtualHost.id);
        } else {
            core.info("No virtual host to delete for this PR.");
        }

        delete this.database[this.prNumber];
        await this.syncDatabase();

        if (commentId) {
            await this.updatePreviewCommentCleanedUp(commentId);
        }
        core.info(
            `Preview environment cleanup completed for PR number: ${this.prNumber}`
        );
    }

    private async createPreviewComment(): Promise<CommentResource | null> {
        core.debug("Creating initial preview comment on PR");
        try {
            const issueComment = await this.octokit!.rest.issues.createComment({
                owner: this.context!.repo.owner,
                repo: this.context!.repo.repo,
                issue_number: this.prNumber,
                body: "🚀 Preparing your preview environment...\n\n",
            });
            return {
                id: issueComment.data.id,
                content: issueComment.data.body as string,
            };
        } catch (error: any) {
            core.error(`Failed to create preview comment: ${error.message}`);
            return null;
        }
    }

    private async updateCommentBody(
        commentId: number,
        body: string
    ): Promise<void> {
        core.debug(`Updating comment ${commentId} with body: ${body}`);
        try {
            await this.octokit!.rest.issues.updateComment({
                owner: this.context!.repo.owner,
                repo: this.context!.repo.repo,
                comment_id: commentId,
                body: body,
            });
        } catch (error: any) {
            core.error(
                `Failed to update comment ${commentId}: ${error.message}`
            );
        }
    }

    private async updatePreviewCommentDeploymentStart(
        commentId: number,
        application: ApplicationResource,
        virtualHost: VirtualHostResource
    ): Promise<void> {
        const body = `✅ Preview environment initialized

**Application:** [${application.id}](${application.url})
**Virtual Host:** [${virtualHost.id}](${virtualHost.url})

⚡ Deployment Starting...
`;
        await this.updateCommentBody(commentId, body);
    }

    private async updatePreviewCommentDeploymentInProgress(
        commentId: number,
        application: ApplicationResource,
        virtualHost: VirtualHostResource,
        deployment: DeployResource
    ): Promise<void> {
        const body = `✅ Preview environment initialized

**Application:** [${application.id}](${application.url})
**Virtual Host:** [${virtualHost.id}](${virtualHost.url})

🚢 Deployment in Progress

**Deployment ID:** ${deployment.id} - [View details](${deployment.url})

🔍 Monitoring every 30 seconds...
`;
        await this.updateCommentBody(commentId, body);
    }

    private async updatePreviewCommentDeploymentFailed(
        commentId: number,
        application: ApplicationResource,
        virtualHost: VirtualHostResource,
        deployment: DeployResource,
        errorMessage: string
    ): Promise<void> {
        const body = `❌ Preview environment initialization **Failed**

**Application:** [${application.id}](${application.url})
**Virtual Host:** [${virtualHost.id}](${virtualHost.url})

🚢 Deployment Failed

**Deployment ID:** ${deployment.id} - [View details](${deployment.url})

**Error:** ${errorMessage}

Please check the Deployment logs in Devopness for more details.
`;
        await this.updateCommentBody(commentId, body);
    }

    private async updatePreviewCommentDeploymentSuccess(
        commentId: number,
        application: ApplicationResource,
        virtualHost: VirtualHostResource,
        deployment: DeployResource,
        previewUrl: string
    ): Promise<void> {
        const body = `🎉 Preview Environment Ready!

**Application:** [${application.id}](${application.url})
**Virtual Host:** [${virtualHost.id}](${virtualHost.url})

🚢 Deployment Completed

**Deployment ID:** ${deployment.id} - [View details](${deployment.url})

Access the **Application Preview** in ${previewUrl}`;
        await this.updateCommentBody(commentId, body);
    }

    private async updatePreviewCommentSynchronizing(
        commentId: number
    ): Promise<void> {
        const body = `🔄 Synchronizing Preview Environment...`;
        await this.updateCommentBody(commentId, body);
    }

    private async updatePreviewCommentCleaningUp(
        commentId: number
    ): Promise<void> {
        await this.updateCommentBody(
            commentId,
            `🧹 Cleaning Up Preview Environment...`
        );
    }

    private async updatePreviewCommentCleanedUp(
        commentId: number
    ): Promise<void> {
        await this.updateCommentBody(
            commentId,
            `🧹 Preview environment cleaned up.`
        );
    }

    private getDatabaseEntry(prNumber: number): DatabaseEntry | undefined {
        return this.database[prNumber];
    }

    private updateDatabaseEntry(
        prNumber: number,
        data: Partial<DatabaseEntry>
    ): void {
        this.database[prNumber] = { ...this.database[prNumber], ...data };
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
        await manager.handleOpenPullRequest();
    } else if (action === "synchronize") {
        await manager.handleSyncPullRequest();
    } else if (action === "closed") {
        await manager.handleClosePullRequest();
    } else {
        core.warning(
            `No action configured for pull request event action: ${action}`
        );
    }
}

run();
