import * as core from "@actions/core";
import type { GitHub } from "@actions/github/lib/utils";
import type { Context } from "@actions/github/lib/context";

import { DevopnessApiClient } from "@devopness/sdk-js";

import {
    createApplication,
    deleteApplication,
    deployApplication,
} from "./application";
import {
    createPreviewComment,
    updatePreviewCommentCleanedUp,
    updatePreviewCommentCleaningUp,
    updatePreviewCommentDeploymentFailed,
    updatePreviewCommentDeploymentInProgress,
    updatePreviewCommentDeploymentStart,
    updatePreviewCommentDeploymentSuccess,
    updatePreviewCommentSynchronizing,
} from "./comments";
import { type Database, syncDatabase } from "./database";
import {
    getDatabaseEntry,
    getServer,
    updateDatabaseEntry,
    watchAction,
} from "./utils";
import { createVirtualHost, deleteVirtualHost } from "./virtual-host";

export async function handleOpenPullRequest(
    context: Context,
    octokit: InstanceType<typeof GitHub>,
    devopnessClient: DevopnessApiClient,
    database: Database,
    data: {
        credentialId: number;
        databaseFileId: number;
        devopnessAPPUrl: string;
        environmentId: number;
        prBranchName: string;
        prNumber: number;
        projectId: number;
        repository: string;
        serverId: number;
    }
): Promise<void> {
    core.info(
        `Handling pull request opened event for PR number: ${data.prNumber}`
    );

    const comment = await createPreviewComment(context, octokit, data.prNumber);
    if (!comment) return;
    updateDatabaseEntry(database, data.prNumber, { comment: comment });

    const application = await createApplication(devopnessClient, {
        credentialId: data.credentialId,
        devopnessAPPUrl: data.devopnessAPPUrl,
        environmentId: data.environmentId,
        prBranchName: data.prBranchName,
        prNumber: data.prNumber,
        projectId: data.projectId,
        repository: data.repository,
    });
    if (!application) return;
    updateDatabaseEntry(database, data.prNumber, { application: application });

    const virtualHost = await createVirtualHost(devopnessClient, database, {
        applicationId: application.id,
        devopnessAPPUrl: data.devopnessAPPUrl,
        environmentId: data.environmentId,
        projectId: data.projectId,
        serverId: data.serverId,
    });
    if (!virtualHost) return;
    updateDatabaseEntry(database, data.prNumber, { virtual_host: virtualHost });

    await updatePreviewCommentDeploymentStart(context, octokit, comment.id, {
        application,
        virtualHost,
    });

    const deployment = await deployApplication(devopnessClient, {
        applicationId: application.id,
        prBranchName: data.prBranchName,
        serverId: data.serverId,
    });
    if (!deployment) return;

    updateDatabaseEntry(database, data.prNumber, { deploy: deployment });
    await syncDatabase(
        devopnessClient,
        data.databaseFileId,
        database,
        data.prNumber
    );

    await updatePreviewCommentDeploymentInProgress(
        context,
        octokit,
        comment.id,
        { application, virtualHost, deployment }
    );

    try {
        await watchAction(devopnessClient, deployment.id);
    } catch (error: any) {
        core.setFailed(`Deployment watch failed: ${error.message}`);
        await updatePreviewCommentDeploymentFailed(
            context,
            octokit,
            comment.id,
            error.message,
            { application, virtualHost, deployment }
        );
        return;
    }

    const server = await getServer(devopnessClient, data.serverId);
    if (!server) return;

    updateDatabaseEntry(database, data.prNumber, {
        preview_url: `http://${server.ip_address}:${virtualHost.port}/`,
    });
    await syncDatabase(
        devopnessClient,
        data.databaseFileId,
        database,
        data.prNumber
    );

    await updatePreviewCommentDeploymentSuccess(
        context,
        octokit,
        comment.id,
        database[data.prNumber].preview_url,
        { application, virtualHost, deployment }
    );

    core.info(
        `Preview environment setup completed for PR number: ${data.prNumber}`
    );
}

export async function handleSyncPullRequest(
    context: Context,
    octokit: InstanceType<typeof GitHub>,
    devopnessClient: DevopnessApiClient,
    database: Database,
    data: {
        databaseFileId: number;
        prBranchName: string;
        prNumber: number;
        serverId: number;
    }
): Promise<void> {
    core.info(
        `Handling pull request synchronized event for PR number: ${data.prNumber}`
    );

    const dbEntry = getDatabaseEntry(database, data.prNumber);
    if (!dbEntry || !dbEntry.comment.id) {
        core.warning(
            `No existing preview environment found for PR number: ${data.prNumber} to synchronize.`
        );
        core.warning(
            `This might happen if the 'opened' event was missed or the database is inconsistent.`
        );
        core.warning(`Skipping synchronization for this 'synchronize' event.`);
        return;
    }

    const commentId = dbEntry.comment.id;

    await updatePreviewCommentSynchronizing(context, octokit, commentId);

    const application = dbEntry.application;
    if (!application || !application.id) {
        core.setFailed(
            `Application data not found in database for PR number: ${data.prNumber} during synchronize.`
        );
        return;
    }

    const virtualHost = dbEntry.virtual_host;
    if (!virtualHost || !virtualHost.id) {
        core.setFailed(
            `Virtual host data not found in database for PR number: ${data.prNumber} during synchronize.`
        );
        return;
    }

    const deployment = await deployApplication(devopnessClient, {
        applicationId: application.id,
        prBranchName: data.prBranchName,
        serverId: data.serverId,
    });
    if (!deployment) return;
    updateDatabaseEntry(database, data.prNumber, { deploy: deployment });
    await syncDatabase(
        devopnessClient,
        data.databaseFileId,
        database,
        data.prNumber
    );

    await updatePreviewCommentDeploymentInProgress(
        context,
        octokit,
        commentId,
        { application, virtualHost, deployment }
    );

    try {
        await watchAction(devopnessClient, deployment.id);
    } catch (error: any) {
        core.setFailed(
            `Deployment watch failed during synchronize: ${error.message}`
        );
        await updatePreviewCommentDeploymentFailed(
            context,
            octokit,
            commentId,
            error.message,
            { application, virtualHost, deployment }
        );
        return;
    }

    await syncDatabase(
        devopnessClient,
        data.databaseFileId,
        database,
        data.prNumber
    );

    await updatePreviewCommentDeploymentSuccess(
        context,
        octokit,
        commentId,
        dbEntry.preview_url,
        { application, virtualHost, deployment }
    );

    core.info(
        `Preview environment synchronization completed for PR number: ${data.prNumber}`
    );
}

export async function handleClosePullRequest(
    context: Context,
    octokit: InstanceType<typeof GitHub>,
    devopnessClient: DevopnessApiClient,
    database: Database,
    data: {
        databaseFileId: number;
        prNumber: number;
    }
): Promise<void> {
    core.info(
        `Handling pull request closed event for PR number: ${data.prNumber}`
    );
    const dbEntry = getDatabaseEntry(database, data.prNumber);
    const commentId = dbEntry?.comment.id;

    if (!commentId) {
        core.info(
            `No comment ID found for PR number: ${data.prNumber}. Skipping resource cleanup comment update.`
        );
    } else {
        await updatePreviewCommentCleaningUp(context, octokit, commentId);
    }

    const application = dbEntry?.application;
    if (application) {
        await deleteApplication(devopnessClient, application.id);
    } else {
        core.info("No application to delete for this PR.");
    }

    const virtualHost = dbEntry?.virtual_host;
    if (virtualHost) {
        await deleteVirtualHost(devopnessClient, virtualHost.id);
    } else {
        core.info("No virtual host to delete for this PR.");
    }

    delete database[data.prNumber];
    await syncDatabase(
        devopnessClient,
        data.databaseFileId,
        database,
        data.prNumber
    );

    if (commentId) {
        await updatePreviewCommentCleanedUp(context, octokit, commentId);
    }
    core.info(
        `Preview environment cleanup completed for PR number: ${data.prNumber}`
    );
}
