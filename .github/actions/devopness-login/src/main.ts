import { getInput, setFailed, setOutput } from "@actions/core";

async function request(
    host: string,
    path: string,
    method: "GET" | "POST" | "PUT" | "DELETE",
    token?: string,
    data?: object
): Promise<{ status: number; body: string }> {
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

async function login(host: string, email: string, password: string) {
    const { status, body } = (await request(
        host,
        "/users/login",
        "POST",
        undefined,
        {
            email,
            password,
        }
    )) as { status: number; body: string };

    if (status !== 200) {
        setFailed(`Login failed: ${body}`);
        return;
    }

    const bodyParsed = JSON.parse(body) as {
        access_token: string;
    };

    setOutput("devopness_token", bodyParsed.access_token);
}

async function run() {
    const host = getInput("host");
    const email = getInput("email");
    const password = getInput("password");

    if (!host) {
        setFailed("host is required");
        return;
    }

    if (!email) {
        setFailed("email is required");
        return;
    }

    if (!password) {
        setFailed("password is required");
        return;
    }

    await login(host, email, password);
}

run();
