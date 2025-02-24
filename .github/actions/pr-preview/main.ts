import * as core from "@actions/core";
import * as github from "@actions/github";
import type { GitHub } from "@actions/github/lib/utils";

async function openGithubContext(githubToken: string) {
    const context = github.context;
    const octokit = github.getOctokit(githubToken);

    return { context, octokit };
}

async function writeFile(
    filePath: string,
    fileContent: string,
    commitMessage: string,
    context: any,
    octokit: InstanceType<typeof GitHub>
) {
    const branch = context.ref.replace("refs/heads/", "");

    const refResponse = await octokit.rest.git.getRef({
        owner: context.repo.owner,
        repo: context.repo.repo,
        ref: `heads/${branch}`,
    });

    const latestCommitSha = refResponse.data.object.sha;

    const blobResponse = await octokit.rest.git.createBlob({
        owner: context.repo.owner,
        repo: context.repo.repo,
        content: fileContent,
        encoding: "utf-8",
    });

    const blobSha = blobResponse.data.sha;

    const treeResponse = await octokit.rest.git.createTree({
        owner: context.repo.owner,
        repo: context.repo.repo,
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

    const commitResponse = await octokit.rest.git.createCommit({
        owner: context.repo.owner,
        repo: context.repo.repo,
        message: commitMessage,
        tree: treeSha,
        parents: [latestCommitSha],
        author: {
            name: context.actor,
            email: `${context.actor}@users.noreply.github.com`,
        },
        committer: {
            name: context.actor,
            email: `${context.actor}@users.noreply.github.com`,
        },
    });

    const commitSha = commitResponse.data.sha;

    await octokit.rest.git.updateRef({
        owner: context.repo.owner,
        repo: context.repo.repo,
        ref: `heads/${branch}`,
        sha: commitSha,
    });

    console.log(`Successfully committed file ${filePath} to branch ${branch}`);
}

async function run() {
    const githubToken = core.getInput("token", { required: true });
    const { context, octokit } = await openGithubContext(githubToken);

    const dbPath = core.getInput("database_path", { required: true });
    console.log(`Database Path: ${dbPath}`);

    const fileContent = `{}`;
    const filePath = ".github/actions/pr-preview/db.json";

    writeFile(filePath, fileContent, "Update database", context, octokit);
}

run();
