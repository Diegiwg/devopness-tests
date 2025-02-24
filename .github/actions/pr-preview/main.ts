import { Database } from "bun:sqlite";

import * as core from "@actions/core";
import * as github from "@actions/github";

async function openDatabase(dbPath: string) {
    const db = new Database(dbPath, { create: true });
    if (!db) {
        core.setFailed(`Failed to open database at ${dbPath}`);
    }

    return db;
}

async function openGithubContext(githubToken: string) {
    const context = github.context;
    const octokit = github.getOctokit(githubToken);

    return { context, octokit };
}

async function run() {
    const githubToken = core.getInput("token", { required: true });
    const { context, octokit } = await openGithubContext(githubToken);

    const dbPath = core.getInput("database_path", { required: true });
    console.log(`Database Path: ${dbPath}`);

    await openDatabase(dbPath);

    const data = `It was the best of times, it was the worst of times.`;
    const filePath = "output.txt";

    // 1. Get the ref for the branch (usually 'refs/heads/main' or 'refs/heads/master')
    const branch = context.ref.replace("refs/heads/", "");
    const refResponse = await octokit.rest.git.getRef({
        owner: context.repo.owner,
        repo: context.repo.repo,
        ref: `heads/${branch}`,
    });
    const latestCommitSha = refResponse.data.object.sha;

    // 2. Create a new blob with the content of the file
    const blobResponse = await octokit.rest.git.createBlob({
        owner: context.repo.owner,
        repo: context.repo.repo,
        content: data,
        encoding: "utf-8",
    });
    const blobSha = blobResponse.data.sha;

    // 3. Create a new tree with the new blob
    const treeResponse = await octokit.rest.git.createTree({
        owner: context.repo.owner,
        repo: context.repo.repo,
        base_tree: refResponse.data.object.sha, // Use the SHA of the latest commit as the base tree
        tree: [
            {
                path: filePath, // path of the file in the repository
                mode: "100644", // file mode
                type: "blob",
                sha: blobSha,
            },
        ],
    });
    const treeSha = treeResponse.data.sha;

    // 4. Create a new commit
    const commitResponse = await octokit.rest.git.createCommit({
        owner: context.repo.owner,
        repo: context.repo.repo,
        message: "feat: Add output.txt file",
        tree: treeSha,
        parents: [latestCommitSha],
        author: {
            // Use your info or context info
            name: context.actor,
            email: `${context.actor}@users.noreply.github.com`, // Or fetch user email if needed
        },
        committer: {
            // You can use the same as author
            name: context.actor,
            email: `${context.actor}@users.noreply.github.com`,
        },
    });
    const commitSha = commitResponse.data.sha;

    // 5. Update the ref (branch) to point to the new commit
    await octokit.rest.git.updateRef({
        owner: context.repo.owner,
        repo: context.repo.repo,
        ref: `heads/${branch}`, // Specify the branch to update
        sha: commitSha,
    });

    console.log(`Successfully committed file ${filePath} to branch ${branch}`);
}

run();
