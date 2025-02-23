const core = require("@actions/core");

/**
 *
 * @param {string} host
 * @param {string} path
 * @param {"GET" | "POST" | "PUT" | "DELETE"} method
 * @param {?string} token
 * @param {?string} data
 * @returns {Promise<{ status: number; body: string }>}
 */
async function request(host, path, method, token, data) {
    const url = `https://${host}${path}`;
    const headers = {
        "Content-Type": "application/json",
    };

    let body = "";
    if (data) {
        body = JSON.stringify(data);
    }

    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
        method,
        headers,
        body,
    });

    return {
        status: response.status,
        body: await response.text(),
    };
}

/**
 *
 * @param {string} host
 * @param {string} email
 * @param {string} password
 * @returns {Promise<void>}
 */
async function login(host, email, password) {
    const { status, body } = await request(
        host,
        "/users/login",
        "POST",
        undefined,
        {
            email,
            password,
        }
    );

    if (status !== 200) {
        core.setFailed(`Login failed: ${body}`);
        return;
    }

    const bodyParsed = JSON.parse(body);
    core.setOutput("devopness_token", bodyParsed.access_token);
}

async function run() {
    const host = core.getInput("host");
    const email = core.getInput("email");
    const password = core.getInput("password");

    if (!host) {
        core.setFailed("host is required");
        return;
    }

    if (!email) {
        core.setFailed("email is required");
        return;
    }

    if (!password) {
        core.setFailed("password is required");
        return;
    }

    await login(host, email, password);
}

run();
