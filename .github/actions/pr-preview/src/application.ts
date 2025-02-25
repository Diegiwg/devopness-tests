import * as core from "@actions/core";

import { DevopnessApiClient } from "@devopness/sdk-js";
import { SourceType } from "@devopness/sdk-js/dist/api/generated/models";

import type { ApplicationResource, DeployResource } from "./database";

export async function createApplication(
    devopnessClient: DevopnessApiClient,
    data: {
        credentialId: number;
        devopnessAPPUrl: string;
        environmentId: number;
        prBranchName: string;
        prNumber: number;
        projectId: number;
        repository: string;
    }
): Promise<ApplicationResource> {
    core.debug(`Creating application for PR number: ${data.prNumber}`);

    if (!devopnessClient) {
        core.setFailed("DEVOPNESS_CLIENT is not initialized");
        process.exit(1);
    }

    try {
        const application =
            await devopnessClient.environments.applications.addEnvironmentApplication(
                data.environmentId,
                {
                    credential_id: data.credentialId,
                    repository: data.repository,
                    name: `pr-${data.prNumber}-preview`,
                    programming_language: "html",
                    engine_version: "none",
                    framework: "none",
                    default_branch: data.prBranchName,
                }
            );

        if (application.status !== 201) {
            core.setFailed(
                `Failed to create application. Status code: ${application.status}`
            );
            process.exit(1);
        }

        core.info(
            `Application created successfully. ID: ${application.data.id}, URL: ${data.devopnessAPPUrl}/projects/${data.projectId}/environments/${data.environmentId}/applications/${application.data.id}`
        );
        return {
            id: application.data.id,
            url: `${data.devopnessAPPUrl}/projects/${data.projectId}/environments/${data.environmentId}/applications/${application.data.id}`,
        };
    } catch (error: any) {
        core.setFailed(`Failed to create application: ${error.message}`);
        process.exit(1);
    }
}

export async function deployApplication(
    devopnessClient: DevopnessApiClient,
    data: {
        applicationId: number;
        prBranchName: string;
        serverId: number;
    }
): Promise<DeployResource> {
    core.debug(
        `Deploying application ID: ${data.applicationId}, branch: ${data.prBranchName}`
    );

    if (!devopnessClient) {
        core.setFailed("DEVOPNESS_CLIENT is not initialized");
        process.exit(1);
    }

    core.info(
        `Deploying application: ${data.applicationId} for branch: ${data.prBranchName}`
    );

    try {
        const applicationPipelines =
            await devopnessClient.pipelines.listPipelinesByResourceType(
                data.applicationId,
                "application"
            );

        if (applicationPipelines.status !== 200) {
            core.setFailed(
                `Failed to get application pipelines. Status code: ${applicationPipelines.status}`
            );
            process.exit(1);
        }

        const deployPipeline = applicationPipelines.data.find(
            (pipeline) => pipeline.operation === "deploy"
        );

        if (!deployPipeline) {
            core.setFailed("Deploy pipeline not found for application");
            process.exit(1);
        }

        const action =
            await devopnessClient.pipelines.actions.addPipelineAction(
                deployPipeline.id,
                {
                    source_type: SourceType.Branch,
                    source_ref: data.prBranchName,
                    servers: [data.serverId],
                }
            );

        if (action.status !== 201) {
            core.setFailed(
                `Failed to deploy application. Status code: ${action.status}`
            );
            process.exit(1);
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
        process.exit(1);
    }
}

export async function deleteApplication(
    devopnessClient: DevopnessApiClient,
    applicationId: number
): Promise<void> {
    core.debug(`Deleting application ID: ${applicationId}`);

    if (!devopnessClient) {
        core.setFailed("DEVOPNESS_CLIENT is not initialized.");
        process.exit(1);
    }

    core.info(`Deleting application with ID ${applicationId}.`);

    try {
        const req = await devopnessClient.applications.deleteApplication(
            applicationId
        );

        if (req.status !== 204) {
            core.setFailed(
                `Failed to delete application. Status code: ${req.status}`
            );
            process.exit(1);
        }

        core.info(`Application ID ${applicationId} deleted successfully.`);
    } catch (error: any) {
        core.setFailed(
            `Failed to delete application ID ${applicationId}: ${error.message}`
        );
        process.exit(1);
    }
}
