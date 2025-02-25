import * as core from "@actions/core";
import type { GitHub } from "@actions/github/lib/utils";
import type { Context } from "@actions/github/lib/context";

import type {
    ApplicationResource,
    CommentResource,
    DeployResource,
    VirtualHostResource,
} from "./database";

export async function createPreviewComment(
    context: Context,
    octokit: InstanceType<typeof GitHub>,
    prNumber: number
): Promise<CommentResource> {
    core.debug("Creating initial preview comment on PR");

    try {
        const issueComment = await octokit!.rest.issues.createComment({
            owner: context!.repo.owner,
            repo: context!.repo.repo,
            issue_number: prNumber,
            body: "🚀 Preparing your preview environment...\n\n",
        });

        return {
            id: issueComment.data.id,
            content: issueComment.data.body as string,
        };
    } catch (error: any) {
        core.setFailed(`Failed to create preview comment: ${error.message}`);
        process.exit(1);
    }
}

export async function updateCommentBody(
    context: Context,
    octokit: InstanceType<typeof GitHub>,
    commentId: number,
    body: string
): Promise<void> {
    core.debug(`Updating comment ${commentId} with body: ${body}`);

    try {
        await octokit!.rest.issues.updateComment({
            owner: context!.repo.owner,
            repo: context!.repo.repo,
            comment_id: commentId,
            body: body,
        });
    } catch (error: any) {
        core.setFailed(
            `Failed to update comment ${commentId}: ${error.message}`
        );
        process.exit(1);
    }
}

export async function updatePreviewCommentDeploymentStart(
    context: Context,
    octokit: InstanceType<typeof GitHub>,
    commentId: number,
    data: {
        application: ApplicationResource;
        virtualHost: VirtualHostResource;
    }
): Promise<void> {
    const body = `✅ Preview environment initialized

**Application:** [${data.application.id}](${data.application.url})
**Virtual Host:** [${data.virtualHost.id}](${data.virtualHost.url})

⚡ Deployment Starting...
`;

    await updateCommentBody(context, octokit, commentId, body);
}

export async function updatePreviewCommentDeploymentInProgress(
    context: Context,
    octokit: InstanceType<typeof GitHub>,
    commentId: number,
    data: {
        application: ApplicationResource;
        virtualHost: VirtualHostResource;
        deployment: DeployResource;
    }
): Promise<void> {
    const body = `✅ Preview environment initialized

**Application:** [${data.application.id}](${data.application.url})
**Virtual Host:** [${data.virtualHost.id}](${data.virtualHost.url})

🚢 Deployment in Progress

**Deployment ID:** ${data.deployment.id} - [View details](${data.deployment.url})

🔍 Monitoring every 30 seconds...
`;

    await updateCommentBody(context, octokit, commentId, body);
}

export async function updatePreviewCommentDeploymentFailed(
    context: Context,
    octokit: InstanceType<typeof GitHub>,
    commentId: number,
    errorMessage: string,
    data: {
        application: ApplicationResource;
        virtualHost: VirtualHostResource;
        deployment: DeployResource;
    }
): Promise<void> {
    const body = `❌ Preview environment initialization **Failed**

**Application:** [${data.application.id}](${data.application.url})
**Virtual Host:** [${data.virtualHost.id}](${data.virtualHost.url})

🚢 Deployment Failed

**Deployment ID:** ${data.deployment.id} - [View details](${data.deployment.url})

**Error:** ${errorMessage}

Please check the Deployment logs in Devopness for more details.
`;

    await updateCommentBody(context, octokit, commentId, body);
}

export async function updatePreviewCommentDeploymentSuccess(
    context: Context,
    octokit: InstanceType<typeof GitHub>,
    commentId: number,
    previewUrl: string,
    data: {
        application: ApplicationResource;
        virtualHost: VirtualHostResource;
        deployment: DeployResource;
    }
): Promise<void> {
    const body = `🎉 Preview Environment Ready!

**Application:** [${data.application.id}](${data.application.url})
**Virtual Host:** [${data.virtualHost.id}](${data.virtualHost.url})

🚢 Deployment Completed

**Deployment ID:** ${data.deployment.id} - [View details](${data.deployment.url})

Access the **Application Preview** in ${previewUrl}`;

    await updateCommentBody(context, octokit, commentId, body);
}

export async function updatePreviewCommentSynchronizing(
    context: Context,
    octokit: InstanceType<typeof GitHub>,
    commentId: number
): Promise<void> {
    const body = `🔄 Synchronizing Preview Environment...`;

    await updateCommentBody(context, octokit, commentId, body);
}

export async function updatePreviewCommentCleaningUp(
    context: Context,
    octokit: InstanceType<typeof GitHub>,
    commentId: number
): Promise<void> {
    await updateCommentBody(
        context,
        octokit,
        commentId,
        `🧹 Cleaning Up Preview Environment...`
    );
}

export async function updatePreviewCommentCleanedUp(
    context: Context,
    octokit: InstanceType<typeof GitHub>,
    commentId: number
): Promise<void> {
    await updateCommentBody(
        context,
        octokit,
        commentId,
        `🧹 Preview environment cleaned up.`
    );
}
