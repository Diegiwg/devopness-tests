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
        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }
        const response = yield fetch(url, {
            method,
            headers,
            body: data,
        });
        return {
            status: response.status,
            body: yield response.text(),
        };
    });
}
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        const host = (0, core_1.getInput)("host");
        const path = (0, core_1.getInput)("path");
        const method = (0, core_1.getInput)("method");
        const token = (0, core_1.getInput)("token");
        const data = (0, core_1.getInput)("data");
        if (!host) {
            (0, core_1.setFailed)("host is required");
            return;
        }
        if (!path) {
            (0, core_1.setFailed)("path is required");
            return;
        }
        if (!method) {
            (0, core_1.setFailed)("method is required");
            return;
        }
        const { status, body } = yield request(host, path, method, token, data);
        (0, core_1.setOutput)("status", status);
        (0, core_1.setOutput)("response", body);
    });
}
run();
