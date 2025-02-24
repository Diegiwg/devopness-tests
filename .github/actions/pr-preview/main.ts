import * as core from "@actions/core";
import * as github from "@actions/github";
import type { GitHub } from "@actions/github/lib/utils";
import type { Context } from "@actions/github/lib/context";

import * as fs from "fs";

var GITHUB_CONTEXT: Context | null = null;
var GITHUB_OCTOKIT: InstanceType<typeof GitHub> | null = null;

async function loadContext(githubToken: string) {
    const context = github.context;
    const octokit = github.getOctokit(githubToken);

    GITHUB_CONTEXT = context;
    GITHUB_OCTOKIT = octokit;
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

    console.log(`Successfully committed file ${filePath} to branch ${branch}`);
}

function readDatabase(filePath: string) {
    const exists = fs.existsSync(filePath);
    if (!exists) {
        console.log(`Database file ${filePath} does not exist`);
        return {};
    }

    const fileContent = fs.readFileSync(filePath, "utf-8");

    try {
        const database = JSON.parse(fileContent);
        return database;
    } catch (error) {
        console.log(`Database file ${filePath} is not valid JSON`);
        return {};
    }
}

function syncDatabase(filePath: string, database: any) {
    const fileContent = JSON.stringify(database, null, 4);

    commitFile(filePath, fileContent, "pr-preview", "chore: sync database");

    console.log(`Successfully updated database file ${filePath}`);
}

async function createApplication(branchName: string) {
    console.log(`[PLACEHOLDER] Creating application for branch: ${branchName}`);
    // Implement application creation logic here
    return {
        applicationId: `app-${branchName}`,
        applicationUrl: `http://app-${branchName}.example.com`,
    }; // Placeholder return
}

async function createVirtualHost() {
    console.log(`[PLACEHOLDER] Creating virtual host`);
    // Implement virtual host creation logic here, including port allocation
    return {
        virtualHostId: "vh-123",
        virtualHostUrl: "http://vh-123.example.com",
    }; // Placeholder return
}

async function deployApplication(applicationId: string, branchName: string) {
    console.log(
        `[PLACEHOLDER] Deploying application: ${applicationId} for branch: ${branchName}`
    );
    // Implement application deployment logic
    return {
        deploymentId: `deploy-${applicationId}`,
        deploymentUrl: `http://deploy-${applicationId}.example.com`,
    }; // Placeholder return
}

async function watchDeployment(deploymentId: string) {
    console.log(`[PLACEHOLDER] Watching deployment: ${deploymentId}`);
    // Implement deployment monitoring logic
    return {
        deploymentStatus: "success",
        accessUrl: `http://${deploymentId}.preview.example.com`,
    }; // Placeholder return
}

async function run() {
    const githubToken = core.getInput("token", { required: true });
    await loadContext(githubToken);

    const dbPath = core.getInput("database_path", { required: true });
    console.log(`Database Path: ${dbPath}`);

    const database = readDatabase(dbPath);

    const eventName = GITHUB_CONTEXT?.eventName;
    const payload = GITHUB_CONTEXT?.payload;

    if (!eventName || !payload) {
        core.setFailed("The event name or payload is not available");
        return;
    }

    // get current event type
    // get the current pr for events pr:opened, pr:synchronized, pr:closed
    // if the pr is opened, add the pr to the database - implement this in a separete function
    // comment on the pr with 'comment::pr-preview-initiated'
    // save the comment id in the database {[prNumber]: "comment_id": {commentId}}
    // create the application with the branch_name of the pr
    // create the virtual host with the most lower port avaible
    // save the application and virtual host in the database {[prNumber]: "applicationID": {application}, "virtualHostID": {virtualHost}}
    // update comment with link to applicatin and virtual host
    // initialize the application:deploy with the branch_name
    // update comment with link to deploy
    // watch the deploy util the end
    // update comment with statys of deploy and link to access the application
    // if the pr is synchronized, update the pr in the database - not implement yet
    // if the pr is closed, remove the pr from the database - not implement yet

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

    if (action === "opened") {
        console.log(
            `Handling pull request opened event for PR number: ${prNumber}`
        );

        if (!database[prNumber]) {
            database[prNumber] = {};
        }

        database[prNumber].pr_branch_name = prBranchName;
        database[prNumber].pr_status = "preview_initiated"; // Add status for tracking

        const issueComment = await GITHUB_OCTOKIT!.rest.issues.createComment({
            owner: GITHUB_CONTEXT!.repo.owner,
            repo: GITHUB_CONTEXT!.repo.repo,
            issue_number: prNumber,
            body: "Preview environment initialization started...",
        });

        const commentId = issueComment.data.id;

        database[prNumber].comment_id = commentId;
        syncDatabase(dbPath, database);

        const application = await createApplication(prBranchName);
        database[prNumber].application = application;

        const virtualHost = await createVirtualHost();
        database[prNumber].virtualHost = virtualHost;

        syncDatabase(dbPath, database);

        let updatedCommentBody = `Preview environment initialized.\n\n`;
        updatedCommentBody += `**Application:** [${application.applicationId}](${application.applicationUrl})\n`;
        updatedCommentBody += `**Virtual Host:** [${virtualHost.virtualHostId}](${virtualHost.virtualHostUrl})\n\n`;
        updatedCommentBody += `Deployment in progress...`;

        await GITHUB_OCTOKIT!.rest.issues.updateComment({
            owner: GITHUB_CONTEXT!.repo.owner,
            repo: GITHUB_CONTEXT!.repo.repo,
            comment_id: commentId,
            body: updatedCommentBody,
        });

        const deployment = await deployApplication(
            application.applicationId,
            prBranchName
        );

        database[prNumber].deployment = deployment;

        syncDatabase(dbPath, database);

        updatedCommentBody += `\n\n**Deployment:** [${deployment.deploymentId}](${deployment.deploymentUrl})\n`;
        updatedCommentBody += `\n\nWatching deployment...`;
        await GITHUB_OCTOKIT!.rest.issues.updateComment({
            owner: GITHUB_CONTEXT!.repo.owner,
            repo: GITHUB_CONTEXT!.repo.repo,
            comment_id: commentId,
            body: updatedCommentBody,
        });

        const deploymentResult = await watchDeployment(deployment.deploymentId);
        database[prNumber].deployment_status =
            deploymentResult.deploymentStatus;
        database[prNumber].access_url = deploymentResult.accessUrl;

        syncDatabase(dbPath, database);

        updatedCommentBody += `\n\n**Deployment Status:** ${deploymentResult.deploymentStatus}\n`;
        if (deploymentResult.deploymentStatus === "success") {
            updatedCommentBody += `**Access Application:** [${application.applicationId}-preview](${deploymentResult.accessUrl})\n`;
        } else {
            updatedCommentBody += `**Deployment Failed.** Check logs for details.\n`;
        }

        await GITHUB_OCTOKIT!.rest.issues.updateComment({
            owner: GITHUB_CONTEXT!.repo.owner,
            repo: GITHUB_CONTEXT!.repo.repo,
            comment_id: commentId,
            body: updatedCommentBody,
        });

        console.log(
            `Preview environment setup completed for PR number: ${prNumber}`
        );
    }

    if (action === "synchronize") {
        console.log(
            `Handling pull request synchronized event for PR number: ${prNumber} - Not implemented yet`
        );
        // TODO: Implement synchronize logic
    }

    if (action === "closed") {
        console.log(
            `Handling pull request closed event for PR number: ${prNumber} - Not implemented yet`
        );
        // TODO: Implement closed logic
    }

    syncDatabase(dbPath, database);
}

run();
