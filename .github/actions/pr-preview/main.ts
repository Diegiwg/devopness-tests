import * as core from "@actions/core";
import * as github from "@actions/github";
import type { GitHub } from "@actions/github/lib/utils";

import * as fs from "fs";

var GITHUB_CONTEXT: any = null;
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
    if (GITHUB_OCTOKIT === null) {
        throw new Error("Octokit not initialized");
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

async function run() {
    const githubToken = core.getInput("token", { required: true });
    await loadContext(githubToken);

    const dbPath = core.getInput("database_path", { required: true });
    console.log(`Database Path: ${dbPath}`);

    const database = readDatabase(dbPath);
    database["test"] = "test";

    syncDatabase(dbPath, database);
}

run();
