import { setTimeout as sleep } from "timers/promises";

import * as core from "@actions/core";
import { DevopnessApiClient } from "@devopness/sdk-js";
import { SourceType } from "@devopness/sdk-js/dist/api/generated/models";

import {
    type ApplicationResource,
    type Database,
    type DeployResource,
    getPort,
    type VirtualHostResource,
} from "./database";
import { Env } from "./env";

export async function createApplication(
    devopnessClient: DevopnessApiClient,
    env: Env
): Promise<ApplicationResource | null> {
    core.debug(`Creating application for PR number: ${env.prNumber}`);

    if (!devopnessClient) {
        core.setFailed("DEVOPNESS_CLIENT is not initialized");
        return null;
    }

    try {
        const application =
            await devopnessClient.environments.applications.addEnvironmentApplication(
                env.environmentId,
                {
                    credential_id: env.credentialId,
                    repository: env.repository,
                    name: `pr-${env.prNumber}-preview`,
                    programming_language: "html",
                    engine_version: "none",
                    framework: "none",
                    default_branch: env.prBranchName,
                }
            );

        if (application.status !== 201) {
            core.setFailed(
                `Failed to create application. Status code: ${application.status}`
            );
            return null;
        }

        core.info(
            `Application created successfully. ID: ${application.data.id}, URL: ${env.devopnessAPPUrl}/projects/${env.projectId}/environments/${env.environmentId}/applications/${application.data.id}`
        );

        env.applicationId = application.data.id;

        return {
            id: application.data.id,
            url: `${env.devopnessAPPUrl}/projects/${env.projectId}/environments/${env.environmentId}/applications/${application.data.id}`,
        };
    } catch (error: any) {
        core.setFailed(`Failed to create application: ${error.message}`);
        return null;
    }
}

export async function createVirtualHost(
    devopnessClient: DevopnessApiClient,
    database: Database,
    env: Env
): Promise<VirtualHostResource | null> {
    core.debug(
        `Creating virtual host for application ID: ${env.applicationId}`
    );

    if (!devopnessClient) {
        core.setFailed("DEVOPNESS_CLIENT is not initialized");
        return null;
    }

    const port = getPort(database);

    if (!port) {
        core.setFailed("No available virtual host port found");
        return null;
    }

    try {
        const server = await getServer(devopnessClient, env.serverId);
        if (!server) {
            return null;
        }

        const virtualHost =
            await devopnessClient.environments.virtualHosts.addEnvironmentVirtualHost(
                env.environmentId,
                {
                    type: "ip-based",
                    name: `${server.ip_address}:${port}`,
                    application_id: env.applicationId,
                }
            );

        if (virtualHost.status !== 201) {
            core.setFailed(
                `Failed to create virtual host. Status code: ${virtualHost.status}`
            );
            return null;
        }
        core.info(
            `Virtual host created successfully. ID: ${virtualHost.data.id}, Port: ${port}, URL: ${env.devopnessAPPUrl}/projects/${env.projectId}/environments/${env.environmentId}/virtual-hosts/${virtualHost.data.id}`
        );
        return {
            id: virtualHost.data.id,
            port: port,
            url: `${env.devopnessAPPUrl}/projects/${env.projectId}/environments/${env.environmentId}/virtual-hosts/${virtualHost.data.id}`,
        };
    } catch (error: any) {
        core.setFailed(`Failed to create virtual host: ${error.message}`);
        return null;
    }
}

export async function deployApplication(
    devopnessClient: DevopnessApiClient,
    env: Env
): Promise<DeployResource | null> {
    core.debug(
        `Deploying application ID: ${env.applicationId}, branch: ${env.prBranchName}`
    );

    if (!devopnessClient) {
        core.setFailed("DEVOPNESS_CLIENT is not initialized");
        return null;
    }

    core.info(
        `Deploying application: ${env.applicationId} for branch: ${env.prBranchName}`
    );

    try {
        const applicationPipelines =
            await devopnessClient.pipelines.listPipelinesByResourceType(
                env.applicationId,
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
            await devopnessClient.pipelines.actions.addPipelineAction(
                deployPipeline.id,
                {
                    source_type: SourceType.Branch,
                    source_ref: env.prBranchName,
                    servers: [env.serverId],
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

export async function deleteApplication(
    devopnessClient: DevopnessApiClient,
    applicationId: number
): Promise<void> {
    core.debug(`Deleting application ID: ${applicationId}`);

    if (!devopnessClient) {
        core.setFailed("DEVOPNESS_CLIENT is not initialized.");
        return;
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
            return;
        }

        core.info(`Application ID ${applicationId} deleted successfully.`);
    } catch (error: any) {
        core.setFailed(
            `Failed to delete application ID ${applicationId}: ${error.message}`
        );
    }
}

export async function deleteVirtualHost(
    devopnessClient: DevopnessApiClient,
    virtualHostId: number
): Promise<void> {
    core.debug(`Deleting virtual host ID: ${virtualHostId}`);

    if (!devopnessClient) {
        core.setFailed("DEVOPNESS_CLIENT is not initialized.");
        return;
    }

    core.info(`Deleting virtual host with ID ${virtualHostId}.`);

    try {
        const req = await devopnessClient.virtualHosts.deleteVirtualHost(
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

export async function getServer(
    devopnessClient: DevopnessApiClient,
    serverId: number
): Promise<{ ip_address: string } | null> {
    core.debug(`Getting server details for server ID: ${serverId}`);

    if (!devopnessClient) {
        core.setFailed("DEVOPNESS_CLIENT is not initialized.");
        return null;
    }

    try {
        const server = await devopnessClient.servers.getServer(serverId);

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

export async function watchAction(
    devopnessClient: DevopnessApiClient,
    actionId: number,
    timeoutMinutes = 30
): Promise<void> {
    core.info(
        `Watching action ${actionId}... Timeout: ${timeoutMinutes} minutes.`
    );
    const startTime = Date.now();
    const timeoutMs = timeoutMinutes * 60 * 1000;

    while (Date.now() - startTime < timeoutMs) {
        try {
            const { data: action } = await devopnessClient.actions.getAction(
                actionId
            );

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

    const { data: finalAction } = await devopnessClient.actions.getAction(
        actionId
    );

    if (finalAction.status !== "completed") {
        throw new Error(
            `Action ${actionId} timed out after ${timeoutMinutes} minutes. Final status: ${finalAction.status}`
        );
    }

    await Promise.all(
        finalAction.children.map((child) =>
            watchAction(devopnessClient, child.id)
        )
    );
}
