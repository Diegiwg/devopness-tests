import * as core from "@actions/core";

import { DevopnessApiClient } from "@devopness/sdk-js";

import { Database, VirtualHostResource } from "./database";
import { getPort, getServer } from "./utils";

export async function createVirtualHost(
    devopnessClient: DevopnessApiClient,
    database: Database,
    data: {
        applicationId: number;
        devopnessAPPUrl: string;
        environmentId: number;
        projectId: number;
        serverId: number;
    }
): Promise<VirtualHostResource> {
    core.debug(
        `Creating virtual host for application ID: ${data.applicationId}`
    );

    if (!devopnessClient) {
        core.setFailed("DEVOPNESS_CLIENT is not initialized");
        process.exit(1);
    }

    const port = getPort(database);

    if (!port) {
        core.setFailed("No available virtual host port found");
        process.exit(1);
    }

    try {
        const server = await getServer(devopnessClient, data.serverId);
        if (!server) {
            process.exit(1);
        }

        const virtualHost =
            await devopnessClient.environments.virtualHosts.addEnvironmentVirtualHost(
                data.environmentId,
                {
                    type: "ip-based",
                    name: `${server.ip_address}:${port}`,
                    application_id: data.applicationId,
                }
            );

        if (virtualHost.status !== 201) {
            core.setFailed(
                `Failed to create virtual host. Status code: ${virtualHost.status}`
            );
            process.exit(1);
        }
        core.info(
            `Virtual host created successfully. ID: ${virtualHost.data.id}, Port: ${port}, URL: ${data.devopnessAPPUrl}/projects/${data.projectId}/environments/${data.environmentId}/virtual-hosts/${virtualHost.data.id}`
        );
        return {
            id: virtualHost.data.id,
            port: port,
            url: `${data.devopnessAPPUrl}/projects/${data.projectId}/environments/${data.environmentId}/virtual-hosts/${virtualHost.data.id}`,
        };
    } catch (error: any) {
        core.setFailed(`Failed to create virtual host: ${error.message}`);
        process.exit(1);
    }
}

export async function deleteVirtualHost(
    devopnessClient: DevopnessApiClient,
    virtualHostId: number
): Promise<void> {
    core.debug(`Deleting virtual host ID: ${virtualHostId}`);

    if (!devopnessClient) {
        core.setFailed("DEVOPNESS_CLIENT is not initialized.");
        process.exit(1);
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
            process.exit(1);
        }

        core.info(`Virtual host ID ${virtualHostId} deleted successfully.`);
    } catch (error: any) {
        core.setFailed(
            `Failed to delete virtual host ID ${virtualHostId}: ${error.message}`
        );
        process.exit(1);
    }
}
