"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@actions/core");
function request(host, path, method, token, data) {
    return __awaiter(this, void 0, void 0, function* () {
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
        const response = yield fetch(url, {
            method,
            headers,
            body,
        });
        return {
            status: response.status,
            body: yield response.json(),
        };
    });
}
function login(host, email, password) {
    return __awaiter(this, void 0, void 0, function* () {
        const { status, body } = (yield request(host, "/auth/login", "POST", undefined, {
            email,
            password,
        }));
        if (status !== 200) {
            (0, core_1.setFailed)(`Login failed: ${JSON.stringify(body)}`);
            return;
        }
        (0, core_1.setOutput)("devopness_token", body.access_token);
    });
}
function projectList(host, token) {
    return __awaiter(this, void 0, void 0, function* () {
        const { status, body } = (yield request(host, "/projects", "GET", token));
        if (status !== 200) {
            (0, core_1.setFailed)(`Project list failed: ${JSON.stringify(body)}`);
            return;
        }
        (0, core_1.setOutput)("projects", body.projects);
    });
}
(() => __awaiter(void 0, void 0, void 0, function* () {
    const host = (0, core_1.getInput)("devopness_host");
    const operation = (0, core_1.getInput)("devopness_operation");
    switch (operation) {
        case "login":
            const email = (0, core_1.getInput)("login_email");
            const password = (0, core_1.getInput)("login_password");
            if (!email) {
                (0, core_1.setFailed)("login_email is required for login operation");
                return;
            }
            if (!password) {
                (0, core_1.setFailed)("login_password is required for login operation");
                return;
            }
            yield login(host, email, password);
            break;
        case "project_list":
            const token = (0, core_1.getInput)("devopness_token");
            if (!token) {
                (0, core_1.setFailed)("devopness_token is required for project_list operation");
                return;
            }
            yield projectList(host, token);
            break;
        default:
            (0, core_1.setFailed)(`Unknown operation: ${operation}`);
            break;
    }
}))();
