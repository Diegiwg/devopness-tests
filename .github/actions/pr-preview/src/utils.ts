import * as core from "@actions/core";

import { DevopnessApiClient } from "@devopness/sdk-js";

import { setTimeout as sleep } from "timers/promises";
import type { Database, DatabaseEntry } from "./database";

export function getDatabaseEntry(
    database: Database,
    prNumber: number
): DatabaseEntry | undefined {
    return database[prNumber];
}

export async function getServer(
    devopnessClient: DevopnessApiClient,
    serverId: number
): Promise<{ ip_address: string }> {
    core.debug(`Getting server details for server ID: ${serverId}`);

    if (!devopnessClient) {
        core.setFailed("DEVOPNESS_CLIENT is not initialized.");
        process.exit(1);
    }

    try {
        const server = await devopnessClient.servers.getServer(serverId);

        if (server.status !== 200) {
            core.setFailed(
                `Failed to get server. Status code: ${server.status}`
            );
            process.exit(1);
        }

        return server.data;
    } catch (error: any) {
        core.setFailed(`Failed to get server: ${error.message}`);
        process.exit(1);
    }
}

export function getPort(database: Database): number {
    core.debug("Finding available port...");

    const usedPorts = new Set<number>();
    for (const key in database) {
        if (database[key]?.virtual_host?.port) {
            usedPorts.add(database[key].virtual_host.port);
        }
    }

    for (let port = 9000; port <= 9500; port++) {
        if (!usedPorts.has(port)) {
            core.debug(`Available port found: ${port}`);
            return port;
        }
    }

    core.warning("No available port found in the range 9000-9500.");
    process.exit(1);
}

export async function watchAction(
    devopnessClient: DevopnessApiClient,
    actionId: number,
    retryLimit = 30
): Promise<void> {
    core.info(`Watching action ${actionId}... Retry limit: ${retryLimit}.`);

    let action = await devopnessClient.actions.getAction(actionId);
    if (action.status !== 200) {
        core.setFailed(
            `Failed to get action ${actionId}. Status code: ${action.status}`
        );
        process.exit(1);
    }

    if (action.data.parent) {
        core.info(
            `Action ${actionId} is a child action. Watching parent action ${action.data.parent.id}...`
        );

        await watchAction(devopnessClient, action.data.parent.id, retryLimit);
    }

    let finished: boolean = false;
    let retryCount: number = 1;
    while (!finished && retryCount < retryLimit) {
        const res = await devopnessClient.actions.getAction(actionId);

        if (res.status !== 200) {
            core.setFailed(
                `Failed to get action ${actionId}. Status code: ${res.status}`
            );
            process.exit(1);
        }

        const action = res.data;

        if (action.status === "completed") {
            core.info(
                `[${retryCount}/${retryLimit}] Action ${actionId} completed.`
            );
            finished = true;
            continue;
        }

        if (["failed", "skipped"].includes(action.status)) {
            core.setFailed(
                `Action ${actionId} failed with status: ${action.status}`
            );
            process.exit(1);
        }

        core.info(
            `[${retryCount}/${retryLimit}] Action ${actionId} status: ${action.status}. Waiting 30 seconds...`
        );

        retryCount++;
        await sleep(30_000);
    }

    if (!finished) {
        core.setFailed(
            `Action ${actionId} timed out after ${retryLimit} retries.`
        );
        process.exit(1);
    }

    action = await devopnessClient.actions.getAction(actionId);
    if (action.status !== 200) {
        core.setFailed(
            `Failed to get action ${actionId}. Status code: ${action.status}`
        );
        process.exit(1);
    }

    action.data.children.forEach(async (child) => {
        core.info(
            `Action ${actionId} has child action ${child.id}. Watching child action...`
        );

        await watchAction(devopnessClient, child.id, retryLimit);
    });
}

export function updateDatabaseEntry(
    database: Database,
    prNumber: number,
    data: Partial<DatabaseEntry>
): void {
    database[prNumber] = { ...database[prNumber], ...data };
}
