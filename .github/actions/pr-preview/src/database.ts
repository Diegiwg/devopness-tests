import * as core from "@actions/core";

import { DevopnessApiClient } from "@devopness/sdk-js";

export interface ApplicationResource {
    id: number;
    url: string;
}

export interface CommentResource {
    id: number;
    content: string;
}

export interface DeployResource {
    id: number;
    url: string;
}

export interface VirtualHostResource {
    id: number;
    port: number;
    url: string;
}

export interface DatabaseEntry {
    branch_name: string;
    application: ApplicationResource;
    comment: CommentResource;
    deploy: DeployResource;
    virtual_host: VirtualHostResource;
    preview_url: string;
}

export type Database = Record<string, DatabaseEntry>;

export function getDatabaseEntry(
    database: Database,
    prNumber: number
): DatabaseEntry | undefined {
    return database[prNumber];
}

export function updateDatabaseEntry(
    database: Database,
    prNumber: number,
    data: Partial<DatabaseEntry>,
): void {
    database[prNumber] = { ...database[prNumber], ...data };
}

export async function loadDatabase(
    databaseFileId: number,
    devopnessClient: DevopnessApiClient
): Promise<Database | null> {
    core.debug("Reading database file...");
    if (!devopnessClient) {
        core.setFailed("DEVOPNESS_CLIENT is not initialized");
        return null;
    }

    try {
        const file = await devopnessClient.variables.getVariable(
            databaseFileId
        );

        if (file.status !== 200) {
            core.setFailed(
                `Failed to read database file. Status code: ${file.status}`
            );
            return null;
        }

        core.debug("Database file read successfully.");
        if (file.data.value) {
            return JSON.parse(file.data.value as string);
        } else {
            return {};
        }
    } catch (error: any) {
        core.setFailed(`Failed to read database file: ${error.message}`);
    }

    return null;
}

export async function syncDatabase(
    database: Database,
    databaseFileId: number,
    devopnessClient: DevopnessApiClient,
    prNumber: number
) {
    core.debug("Syncing database file...");
    if (!devopnessClient) {
        core.setFailed("DEVOPNESS_CLIENT is not initialized");
        return;
    }

    if (database[prNumber] && database[prNumber].comment) {
        database[prNumber].comment.content = "";
    }

    const fileContent = JSON.stringify(database);

    try {
        const file = await devopnessClient.variables.getVariable(
            databaseFileId
        );

        if (file.status !== 200) {
            core.setFailed(
                `Failed to read database file before update. Status code: ${file.status}`
            );
            return;
        }

        const res = await devopnessClient.variables.updateVariable(
            databaseFileId,
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

export function getPort(database: Database): number | null {
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
    return null;
}
