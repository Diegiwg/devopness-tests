import { getInput, setFailed, setOutput } from "@actions/core";

async function request(
    host: string,
    path: string,
    method: "GET" | "POST" | "PUT" | "DELETE",
    token?: string,
    data?: string
): Promise<{ status: number; body: string }> {
    const url = `https://${host}${path}`;
    const headers = {
        "Content-Type": "application/json",
    };

    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
        method,
        headers,
        body: data,
    });

    return {
        status: response.status,
        body: await response.text(),
    };
}

async function run() {
    const host = getInput("host");
    const path = getInput("path");
    const method = getInput("method") as "GET" | "POST" | "PUT" | "DELETE";
    const token = getInput("token");
    const data = getInput("data");

    if (!host) {
        setFailed("host is required");
        return;
    }

    if (!path) {
        setFailed("path is required");
        return;
    }

    if (!method) {
        setFailed("method is required");
        return;
    }

    const { status, body } = await request(host, path, method, token, data);

    setOutput("status", status);
    setOutput("response", body);
}

run();
