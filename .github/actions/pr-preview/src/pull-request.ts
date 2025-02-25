import * as core from "@actions/core";
import type { Context } from "@actions/github/lib/context";
import type { GitHub } from "@actions/github/lib/utils";

import { DevopnessApiClient } from "@devopness/sdk-js";

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
import {
    type Database,
    getDatabaseEntry,
    syncDatabase,
    updateDatabaseEntry,
} from "./database";
import {
    createApplication,
    createVirtualHost,
    deleteApplication,
    deleteVirtualHost,
    deployApplication,
    getServer,
    watchAction,
} from "./devopness";
import { Env } from "./env";

export async function handleOpenPullRequest(
    context: Context,
    octokit: InstanceType<typeof GitHub>,
    database: Database,
    devopnessClient: DevopnessApiClient,
    env: Env
): Promise<void> {
    core.info(
        `Handling pull request opened event for PR number: ${env.prNumber}`
    );

    const comment = await createPreviewComment(context, octokit, env.prNumber);
    if (!comment) return;
    updateDatabaseEntry(database, env.prNumber, { comment: comment });

    const application = await createApplication(devopnessClient, env);
    if (!application) return;
    updateDatabaseEntry(database, env.prNumber, { application: application });

    const virtualHost = await createVirtualHost(devopnessClient, database, env);
    if (!virtualHost) return;
    updateDatabaseEntry(database, env.prNumber, { virtual_host: virtualHost });

    await updatePreviewCommentDeploymentStart(
        context,
        octokit,
        comment.id,
        application,
        virtualHost
    );

    const deployment = await deployApplication(devopnessClient, env);
    if (!deployment) return;

    updateDatabaseEntry(database, env.prNumber, { deploy: deployment });
    await syncDatabase(
        database,
        env.databaseFileId,
        devopnessClient,
        env.prNumber
    );

    await updatePreviewCommentDeploymentInProgress(
        context,
        octokit,
        comment.id,
        application,
        virtualHost,
        deployment
    );

    try {
        await watchAction(devopnessClient, deployment.id);
    } catch (error: any) {
        core.setFailed(`Deployment watch failed: ${error.message}`);
        await updatePreviewCommentDeploymentFailed(
            context,
            octokit,
            comment.id,
            application,
            virtualHost,
            deployment,
            error.message
        );
        return;
    }

    const server = await getServer(devopnessClient, env.serverId);
    if (!server) return;

    updateDatabaseEntry(database, env.prNumber, {
        preview_url: `http://${server.ip_address}:${virtualHost.port}/`,
    });
    await syncDatabase(
        database,
        env.databaseFileId,
        devopnessClient,
        env.prNumber
    );

    await updatePreviewCommentDeploymentSuccess(
        context,
        octokit,
        comment.id,
        application,
        virtualHost,
        deployment,
        database[env.prNumber].preview_url
    );

    core.info(
        `Preview environment setup completed for PR number: ${env.prNumber}`
    );
}

export async function handleSyncPullRequest(
    context: Context,
    octokit: InstanceType<typeof GitHub>,
    database: Database,
    devopnessClient: DevopnessApiClient,
    env: Env
): Promise<void> {
    core.info(
        `Handling pull request synchronized event for PR number: ${env.prNumber}`
    );

    const dbEntry = getDatabaseEntry(database, env.prNumber);
    if (!dbEntry || !dbEntry.comment.id) {
        core.warning(
            `No existing preview environment found for PR number: ${env.prNumber} to synchronize.`
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
            `Application data not found in database for PR number: ${env.prNumber} during synchronize.`
        );
        return;
    }

    const virtualHost = dbEntry.virtual_host;
    if (!virtualHost || !virtualHost.id) {
        core.setFailed(
            `Virtual host data not found in database for PR number: ${env.prNumber} during synchronize.`
        );
        return;
    }

    const deployment = await deployApplication(devopnessClient, env);
    if (!deployment) return;
    updateDatabaseEntry(database, env.prNumber, { deploy: deployment });
    await syncDatabase(
        database,
        env.databaseFileId,
        devopnessClient,
        env.prNumber
    );

    await updatePreviewCommentDeploymentInProgress(
        context,
        octokit,
        commentId,
        application,
        virtualHost,
        deployment
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
            application,
            virtualHost,
            deployment,
            error.message
        );
        return;
    }

    await syncDatabase(
        database,
        env.databaseFileId,
        devopnessClient,
        env.prNumber
    );

    await updatePreviewCommentDeploymentSuccess(
        context,
        octokit,
        commentId,
        application,
        virtualHost,
        deployment,
        dbEntry.preview_url
    );

    core.info(
        `Preview environment synchronization completed for PR number: ${env.prNumber}`
    );
}

export async function handleClosePullRequest(
    context: Context,
    octokit: InstanceType<typeof GitHub>,
    database: Database,
    devopnessClient: DevopnessApiClient,
    env: Env
): Promise<void> {
    core.info(
        `Handling pull request closed event for PR number: ${env.prNumber}`
    );

    const dbEntry = getDatabaseEntry(database, env.prNumber);
    const commentId = dbEntry?.comment.id;

    if (!commentId) {
        core.info(
            `No comment ID found for PR number: ${env.prNumber}. Skipping resource cleanup comment update.`
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

    delete database[env.prNumber];
    await syncDatabase(
        database,
        env.databaseFileId,
        devopnessClient,
        env.prNumber
    );

    if (commentId) {
        await updatePreviewCommentCleanedUp(context, octokit, commentId);
    }

    core.info(
        `Preview environment cleanup completed for PR number: ${env.prNumber}`
    );
}
