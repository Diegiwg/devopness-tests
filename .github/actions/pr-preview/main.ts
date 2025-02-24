import * as core from "@actions/core";
import * as github from "@actions/github";
import type { GitHub } from "@actions/github/lib/utils";
import type { Context } from "@actions/github/lib/context";

import * as fs from "fs";

import { DevopnessApiClient } from "@devopness/sdk-js";

var GITHUB_CONTEXT: Context | null = null;
var GITHUB_OCTOKIT: InstanceType<typeof GitHub> | null = null;

var DEVOPNESS_CLIENT: DevopnessApiClient | null = null;
var DEVOPNESS_REFRESH_TOKEN: string | null = null;

type Database = {
    [key: string]: {
        branch_name: string;

        application: {
            id: number;
            url: string;
        };

        comment: {
            id: number;
            content: string;
        };

        deploy: {
            id: number;
            status: string;
            url: string;
        };

        virtual_host: {
            id: number;
            url: string;
        };

        preview_url: string;
    };
};

async function loadContext(
    githubToken: string,
    devopnessEmail: string,
    devopnessPassword: string
) {
    const context = github.context;
    const octokit = github.getOctokit(githubToken);

    GITHUB_CONTEXT = context;
    GITHUB_OCTOKIT = octokit;
    DEVOPNESS_CLIENT = new DevopnessApiClient({
        baseURL: "https://dev-api.devopness.com",
    });

    const login = await DEVOPNESS_CLIENT.users.loginUser({
        email: devopnessEmail,
        password: devopnessPassword,
    });

    if (login.status != 200) {
        core.setFailed("Failed to login to Devopness");
        return;
    }

    DEVOPNESS_CLIENT.accessToken = login.data.access_token;
    DEVOPNESS_REFRESH_TOKEN = login.data.refresh_token;
}

async function commitFile(
    filePath: string,
    fileContent: string,
    commitBranch: string,
    commitMessage: string
) {
    if (GITHUB_OCTOKIT === null || GITHUB_CONTEXT === null) {
        core.setFailed("GITHUB_OCTOKIT or GITHUB_CONTEXT is not initialized");
        return;
    }

    const branch = commitBranch;

    const refResponse = await GITHUB_OCTOKIT.rest.git.getRef({
        owner: GITHUB_CONTEXT.repo.owner,
        repo: GITHUB_CONTEXT.repo.repo,
        ref: `heads/${branch}`,
    });

    const latestCommitSha = refResponse.data.object.sha;

    const blobResponse = await GITHUB_OCTOKIT.rest.git.createBlob({
        owner: GITHUB_CONTEXT.repo.owner,
        repo: GITHUB_CONTEXT.repo.repo,
        content: fileContent,
        encoding: "utf-8",
    });

    const blobSha = blobResponse.data.sha;

    const treeResponse = await GITHUB_OCTOKIT.rest.git.createTree({
        owner: GITHUB_CONTEXT.repo.owner,
        repo: GITHUB_CONTEXT.repo.repo,
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

    const commitResponse = await GITHUB_OCTOKIT.rest.git.createCommit({
        owner: GITHUB_CONTEXT.repo.owner,
        repo: GITHUB_CONTEXT.repo.repo,
        message: commitMessage,
        tree: treeSha,
        parents: [latestCommitSha],
        author: {
            name: GITHUB_CONTEXT.actor,
            email: `${GITHUB_CONTEXT.actor}@users.noreply.github.com`,
        },
        committer: {
            name: GITHUB_CONTEXT.actor,
            email: `${GITHUB_CONTEXT.actor}@users.noreply.github.com`,
        },
    });

    const commitSha = commitResponse.data.sha;

    await GITHUB_OCTOKIT.rest.git.updateRef({
        owner: GITHUB_CONTEXT.repo.owner,
        repo: GITHUB_CONTEXT.repo.repo,
        ref: `heads/${branch}`,
        sha: commitSha,
    });

    core.info(`Successfully committed file ${filePath} to branch ${branch}`);
}

function readDatabase(filePath: string) {
    const exists = fs.existsSync(filePath);
    if (!exists) {
        core.info(`Database file ${filePath} does not exist`);
        return {};
    }

    const fileContent = fs.readFileSync(filePath, "utf-8");

    try {
        const database = JSON.parse(fileContent);
        return database;
    } catch (error) {
        core.info(`Database file ${filePath} is not valid JSON`);
        return {};
    }
}

async function readDatabaseFromURL(url: string): Promise<Database> {
    const response = await fetch(url);

    try {
        const database = await response.json();

        core.info(`Database file '${url}' is valid JSON`);

        return database;
    } catch (error) {
        core.info(`Database file '${url}' is not valid JSON`);
        return {};
    }
}

async function syncDatabase(filePath: string, database: any) {
    const fileContent = JSON.stringify(database, null, 4);

    await commitFile(
        filePath,
        fileContent,
        "pr-preview",
        "chore: sync database"
    );

    core.info(`Successfully updated database file ${filePath}`);
}

/**
 * Create a new application in the given environment with the specified
 * credential, repository, name, programming language, engine version, and
 * default branch.
 *
 * @param environmentId The ID of the environment where the application will
 * be created.
 * @param credentialId The ID of the credential to use for the application.
 * @param prNumber The number of the pull request that triggered this
 * deployment.
 * @param branchName The name of the branch that triggered this deployment.
 *
 * @returns The ID of the newly created application.
 */
async function createApplication(
    environmentId: number,
    credentialId: number,
    prNumber: number,
    branchName: string
) {
    if (!DEVOPNESS_CLIENT) {
        core.setFailed("DEVOPNESS_CLIENT is not initialized");
        return;
    }

    const application =
        await DEVOPNESS_CLIENT.environments.applications.addEnvironmentApplication(
            environmentId,
            {
                credential_id: credentialId,
                repository: "Diegiwg/devopness-tests",
                name: `pr-${prNumber}-preview`,
                programming_language: "html",
                engine_version: "none",
                framework: "none",
                default_branch: branchName,
            }
        );

    if (application.status != 201) {
        core.setFailed("Failed to create application");
        return;
    }

    return {
        id: application.data.id,
        url: `https://dev-app.devopness.com/environments/${environmentId}/applications/${application.data.id}`,
    };
}

async function createVirtualHost() {
    core.info(`[PLACEHOLDER] Creating virtual host`);
    // Implement virtual host creation logic here, including port allocation
    return {
        id: 0,
        url: "http://vh-123.example.com",
    }; // Placeholder return
}

async function deployApplication(applicationId: number, branchName: string) {
    core.info(
        `[PLACEHOLDER] Deploying application: ${applicationId} for branch: ${branchName}`
    );
    // Implement application deployment logic
    return {
        id: 0,
        status: "queued",
        url: "#abc",
    }; // Placeholder return
}

async function deleteApplication(applicationId: number) {
    core.info(`Deleting application with ID ${applicationId}.`);

    if (!DEVOPNESS_CLIENT) {
        core.setFailed("DEVOPNESS_CLIENT is not initialized.");
        return;
    }

    const req = await DEVOPNESS_CLIENT.applications.deleteApplication(
        applicationId
    );

    if (req.status != 204) {
        core.setFailed("Failed to delete application.");
        return;
    }

    core.info("Application deleted successfully.");
}

async function deleteVirtualHost(virtualHostId: number) {
    core.info(`[PLACEHOLDER] Deleting virtual host: ${virtualHostId}`);
    // Implement virtual host deletion logic
}

async function watchDeployment(deploymentId: number) {
    core.info(`[PLACEHOLDER] Watching deployment: ${deploymentId}`);
    // Implement deployment monitoring logic
    return {
        deploymentStatus: "success",
        accessUrl: `http://${deploymentId}.preview.example.com`,
    }; // Placeholder return
}

async function openPullRequest(
    prNumber: number,
    database: Database,
    environmentId: number,
    credentialId: number,
    prBranchName: string,
    databaseFilePath: string
) {
    core.info(`Handling pull request opened event for PR number: ${prNumber}`);

    const issueComment = await GITHUB_OCTOKIT!.rest.issues.createComment({
        owner: GITHUB_CONTEXT!.repo.owner,
        repo: GITHUB_CONTEXT!.repo.repo,
        issue_number: prNumber,
        body: "Preview environment initialization started...",
    });

    const commentId = issueComment.data.id;

    database[prNumber].comment.id = commentId;

    const application = await createApplication(
        environmentId,
        credentialId,
        prNumber,
        prBranchName
    );

    if (!application) {
        core.setFailed("Failed to create application");
        return;
    }

    database[prNumber].application = application;

    const virtualHost = await createVirtualHost();
    database[prNumber].virtual_host = virtualHost;

    let updatedCommentBody = `Preview environment initialized.\n\n`;
    updatedCommentBody += `**Application:** [${application?.id}](${application?.url})\n`;
    updatedCommentBody += `**Virtual Host:** [${virtualHost.id}](${virtualHost.url})\n\n`;
    updatedCommentBody += `Deployment in progress...`;

    await GITHUB_OCTOKIT!.rest.issues.updateComment({
        owner: GITHUB_CONTEXT!.repo.owner,
        repo: GITHUB_CONTEXT!.repo.repo,
        comment_id: commentId,
        body: updatedCommentBody,
    });

    const deployment = await deployApplication(application.id, prBranchName);

    database[prNumber].deploy = deployment;

    await syncDatabase(databaseFilePath, database);

    updatedCommentBody += `\n\n**Deployment:** [${deployment.id}](${deployment.url})\n`;
    updatedCommentBody += `\n\nWatching deployment...`;
    await GITHUB_OCTOKIT!.rest.issues.updateComment({
        owner: GITHUB_CONTEXT!.repo.owner,
        repo: GITHUB_CONTEXT!.repo.repo,
        comment_id: commentId,
        body: updatedCommentBody,
    });

    const deploymentResult = await watchDeployment(deployment.id);
    database[prNumber].deploy.status = deploymentResult.deploymentStatus;
    database[prNumber].preview_url = deploymentResult.accessUrl;

    await syncDatabase(databaseFilePath, database);

    updatedCommentBody += `\n\n**Deployment Status:** ${deploymentResult.deploymentStatus}\n`;
    if (deploymentResult.deploymentStatus === "success") {
        updatedCommentBody += `**Access Application:** [${application.id}-preview](${deploymentResult.accessUrl})\n`;
    } else {
        updatedCommentBody += `**Deployment Failed.** Check logs for details.\n`;
    }

    await GITHUB_OCTOKIT!.rest.issues.updateComment({
        owner: GITHUB_CONTEXT!.repo.owner,
        repo: GITHUB_CONTEXT!.repo.repo,
        comment_id: commentId,
        body: updatedCommentBody,
    });

    core.info(`Preview environment setup completed for PR number: ${prNumber}`);
}

async function run() {
    const githubToken = core.getInput("token", { required: true });

    const devopnessEmail = core.getInput("email", { required: true });
    const devopnessPassword = core.getInput("password", { required: true });

    const projectId = Number(core.getInput("project_id", { required: true }));

    const environmentId = Number(
        core.getInput("environment_id", { required: true })
    );

    const credentialId = Number(
        core.getInput("credential_id", { required: true })
    );

    const databaseFilePath = core.getInput("database_path", { required: true });

    await loadContext(githubToken, devopnessEmail, devopnessPassword);

    const database = await readDatabaseFromURL(
        "https://raw.githubusercontent.com/Diegiwg/devopness-tests/refs/heads/pr-preview/database.json"
    );

    core.info(`Database file read successfully from URL.`);
    console.log(database);

    const eventName = GITHUB_CONTEXT?.eventName;
    const payload = GITHUB_CONTEXT?.payload;

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

    const prNumber = pullRequest.number;
    const prBranchName = pullRequest.head.ref;
    const action = payload.action;

    if (!database[prNumber]) {
        database[prNumber] = {
            branch_name: prBranchName,
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
                status: "",
                url: "",
            },
            virtual_host: {
                id: 0,
                url: "",
            },
            preview_url: "",
        };
    }

    if (action === "opened") {
        await openPullRequest(
            prNumber,
            database,
            environmentId,
            credentialId,
            prBranchName,
            databaseFilePath
        );
    }

    if (action === "synchronize") {
        core.info(
            `Handling pull request synchronized event for PR number: ${prNumber} - Not implemented yet`
        );
        // TODO: Implement synchronize logic
    }

    if (action === "closed") {
        const commentId = database[prNumber].comment.id;
        if (!commentId) {
            core.info(
                `No comment ID found for PR number: ${prNumber}. Skipping deletion of resources.`
            );
            return;
        }

        await GITHUB_OCTOKIT!.rest.issues.updateComment({
            owner: GITHUB_CONTEXT!.repo.owner,
            repo: GITHUB_CONTEXT!.repo.repo,
            comment_id: commentId,
            body: `Preview environment cleanup in progress...`,
        });

        const application = database[prNumber].application;
        if (application) {
            await deleteApplication(application.id);
        } else {
            core.info("No application to delete.");
        }

        const virtualHost = database[prNumber].virtual_host;
        if (virtualHost) {
            await deleteVirtualHost(virtualHost.id);
        } else {
            core.info("No virtual host to delete.");
        }

        delete database[prNumber];
        await syncDatabase(databaseFilePath, database);

        await GITHUB_OCTOKIT!.rest.issues.updateComment({
            owner: GITHUB_CONTEXT!.repo.owner,
            repo: GITHUB_CONTEXT!.repo.repo,
            comment_id: commentId,
            body: `Preview environment cleaned up.`,
        });
    }
}

run();
