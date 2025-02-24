import * as core from "@actions/core";
import * as github from "@actions/github";

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

    const data = `Diegiwg.`;
    const filePath = "output.txt";

    const branch = context.ref.replace("refs/heads/", "");
    console.log(`Branch: ${branch}`);

    const refResponse = await octokit.rest.git.getRef({
        owner: context.repo.owner,
        repo: context.repo.repo,
        ref: `heads/${branch}`,
    });

    const latestCommitSha = refResponse.data.object.sha;
    console.log(`Latest Commit SHA: ${latestCommitSha}`);

    const blobResponse = await octokit.rest.git.createBlob({
        owner: context.repo.owner,
        repo: context.repo.repo,
        content: data,
        encoding: "utf-8",
    });

    const blobSha = blobResponse.data.sha;
    console.log(`Blob SHA: ${blobSha}`);

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
    console.log(`Tree SHA: ${treeSha}`);

    const commitResponse = await octokit.rest.git.createCommit({
        owner: context.repo.owner,
        repo: context.repo.repo,
        message: "feat: Add output.txt file",
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
    console.log(`Commit SHA: ${commitSha}`);

    await octokit.rest.git.updateRef({
        owner: context.repo.owner,
        repo: context.repo.repo,
        ref: `heads/${branch}`,
        sha: commitSha,
    });

    console.log(`Successfully committed file ${filePath} to branch ${branch}`);
}

run();
