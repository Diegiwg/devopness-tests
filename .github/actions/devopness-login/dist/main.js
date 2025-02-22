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
            body: yield response.text(),
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
            (0, core_1.setFailed)(`Login failed: ${body}`);
            return;
        }
        const bodyParsed = JSON.parse(body);
        (0, core_1.setOutput)("devopness_token", bodyParsed.access_token);
    });
}
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        const host = (0, core_1.getInput)("host");
        const email = (0, core_1.getInput)("email");
        const password = (0, core_1.getInput)("password");
        if (!host) {
            (0, core_1.setFailed)("host is required");
            return;
        }
        if (!email) {
            (0, core_1.setFailed)("email is required");
            return;
        }
        if (!password) {
            (0, core_1.setFailed)("password is required");
            return;
        }
        yield login(host, email, password);
    });
}
run();
