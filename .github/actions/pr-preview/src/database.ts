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

export async function loadDatabase(
    devopnessClient: DevopnessApiClient,
    databaseFileId: number
) {
    core.debug("Reading database file...");

    if (!devopnessClient) {
        core.setFailed("DEVOPNESS_CLIENT is not initialized");
        process.exit(1);
    }

    try {
        const file = await devopnessClient.variables.getVariable(
            databaseFileId
        );

        if (file.status !== 200) {
            core.setFailed(
                `Failed to read database file. Status code: ${file.status}`
            );
            process.exit(1);
        }

        core.debug("Database file read successfully.");
        if (file.data.value) {
            const database = JSON.parse(file.data.value as string);
            return database;
        } else {
            return {};
        }
    } catch (error: any) {
        core.setFailed(`Failed to read database file: ${error.message}`);
        process.exit(1);
    }
}

export async function syncDatabase(
    devopnessClient: DevopnessApiClient,
    databaseFileId: number,
    database: Database,
    prNumber: number
) {
    core.debug("Syncing database file...");

    if (!devopnessClient) {
        core.setFailed("DEVOPNESS_CLIENT is not initialized");
        process.exit(1);
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
            process.exit(1);
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
            process.exit(1);
        }

        core.debug("Database file synced successfully.");
    } catch (error: any) {
        core.setFailed(`Failed to sync database file: ${error.message}`);
        process.exit(1);
    }
}
