"use strict";
// Copyright 2021 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
Object.defineProperty(exports, "__esModule", { value: true });
exports.MissingCredentialsError = exports.KeepAliveIntervalLapsedError = exports.AppSyncClientClosingError = exports.GraphQlError = exports.ConnectionError = exports.generateRetryStrategy = exports.AppSyncClient = exports.ResponseTimeoutError = void 0;
const stream_1 = require("stream");
const util_1 = require("util");
const url_1 = require("url");
const signature_v4_1 = require("@smithy/signature-v4");
const sha256_js_1 = require("@aws-crypto/sha256-js");
const util_buffer_from_1 = require("@smithy/util-buffer-from");
const https_1 = require("./https");
const https_2 = require("https");
const WebSocket = require("ws");
var https_3 = require("./https");
Object.defineProperty(exports, "ResponseTimeoutError", { enumerable: true, get: function () { return https_3.ResponseTimeoutError; } });
function isGraphQlResultWithErrors(result) {
    return !!(result.errors &&
        result.errors.length);
}
class AppSyncClient {
    constructor(props) {
        var _a, _b;
        this.lastSubscriptionId = 0;
        this.establishedSubscriptionIds = new Set();
        this.subscribeAsync = (0, util_1.promisify)(this.subscribe);
        this.subscriptionCallbacks = {};
        this.graphqlUri = new url_1.URL(props.graphQlUrl);
        this.region = (_a = props.apiRegion) !== null && _a !== void 0 ? _a : this.graphqlUri.hostname.split(".")[2];
        this.realtimeUri = new url_1.URL((_b = props.realtimeUrl) !== null && _b !== void 0 ? _b : `wss://${this.graphqlUri.hostname.split(".")[0]}.appsync-realtime-api.${this.region}.amazonaws.com/graphql`);
        this.keepAliveAgent = new https_2.Agent({
            keepAlive: true,
        });
        let credentials = props.credentials;
        if (!credentials) {
            try {
                credentials =
                    // eslint-disable-next-line @typescript-eslint/no-var-requires
                    require("@aws-sdk/credential-provider-node").defaultProvider();
            }
            catch (_c) {
                throw new MissingCredentialsError(`No credentials provided. You should either provide credentials, or install "@aws-sdk/credential-provider-node"`);
            }
        }
        this.signer = new signature_v4_1.SignatureV4({
            service: "appsync",
            region: this.region,
            credentials: credentials,
            sha256: sha256_js_1.Sha256,
        });
    }
    getNewSubscriptionId() {
        return (++this.lastSubscriptionId % Number.MAX_SAFE_INTEGER).toString();
    }
    close() {
        this.closeWebSocket(new AppSyncClientClosingError("AppSync client has been closed"));
        this.closeKeepAliveAgent();
    }
    closeKeepAliveAgent() {
        this.keepAliveAgent.destroy();
    }
    closeAllSubscriptions(err) {
        Object.values(this.subscriptionCallbacks).forEach(({ unsubscribe }) => unsubscribe(err));
    }
    closeWebSocket(err) {
        this.closeAllSubscriptions(err);
        if (this.ws) {
            this.ws.terminate();
        }
        if (this.scheduledKeepAliveCheck) {
            clearTimeout(this.scheduledKeepAliveCheck);
        }
    }
    async sign(body, isConnectionAttempt = false) {
        return this.signer.sign({
            headers: {
                accept: "application/json, text/javascript",
                "content-encoding": "amz-1.0",
                "content-type": "application/json; charset=UTF-8",
                host: this.graphqlUri.hostname,
            },
            hostname: this.graphqlUri.hostname,
            method: "POST",
            path: isConnectionAttempt
                ? this.graphqlUri.pathname + "/connect"
                : this.graphqlUri.pathname,
            protocol: this.graphqlUri.protocol,
            body,
        });
    }
    scheduleKeepAliveCheck() {
        if (this.scheduledKeepAliveCheck) {
            clearTimeout(this.scheduledKeepAliveCheck);
        }
        this.scheduledKeepAliveCheck = setTimeout(() => this.closeWebSocket(new KeepAliveIntervalLapsedError(`Connection has become stale (did not receive a keep-alive message for ${this.connectionTimeoutMs} ms.)`)), this.connectionTimeoutMs);
    }
    async handleMessage(event) {
        const parsed = JSON.parse(event.data.toString());
        if (event.data) {
            if (parsed.type === "connection_error") {
                this.failedToConnect(new ConnectionError(extractGraphQlErrorMessage(parsed.payload)));
            }
            else if (parsed.type === "connection_ack") {
                this.connected(parsed.payload.connectionTimeoutMs);
            }
            else if (parsed.type === "error") {
                const subscriptionId = parsed.id;
                this.subscriptionCallbacks[subscriptionId].error(GraphQlError.fromResultWithError(parsed.payload));
            }
            else if (parsed.type === "start_ack") {
                const subscriptionId = parsed.id;
                this.subscriptionCallbacks[subscriptionId].subscribed();
            }
            else if (parsed.type === "ka") {
                this.scheduleKeepAliveCheck();
            }
            else if (parsed.type === "data") {
                const subscriptionId = parsed.id;
                this.subscriptionCallbacks[subscriptionId].data(parsed.payload);
            }
            else if (parsed.type === "complete") {
                const subscriptionId = parsed.id;
                this.subscriptionCallbacks[subscriptionId].unsubscribed();
            }
        }
    }
    async connect() {
        if (this.connecting) {
            await this.connecting.catch(() => {
            });
        }
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            return this.ws;
        }
        // eslint-disable-next-line no-async-promise-executor
        this.connecting = new Promise(async (resolve, reject) => {
            try {
                const connectionAuth = await this.sign("{}", true);
                const connectionUrl = new url_1.URL(`?header=${(0, util_buffer_from_1.fromString)(JSON.stringify(connectionAuth.headers)).toString("base64")}&payload=${(0, util_buffer_from_1.fromString)(JSON.stringify("{}")).toString("base64")}`, this.realtimeUri);
                const ws = (this.ws = new WebSocket(connectionUrl.toString(), [
                    "graphql-ws",
                ]));
                this.connected = (connectionTimeoutMs) => {
                    this.connectionTimeoutMs = connectionTimeoutMs;
                    this.scheduleKeepAliveCheck();
                    resolve(ws);
                };
                this.failedToConnect = reject;
                ws.onerror = reject;
                ws.onopen = () => {
                    ws.send(JSON.stringify({ type: "connection_init" }), (err) => {
                        if (err)
                            reject(err);
                    });
                };
                ws.onmessage = this.handleMessage.bind(this);
                ws.onclose = () => {
                    const error = new Error("Socket to AppSync closed prematurely");
                    reject(error);
                    this.closeAllSubscriptions(error);
                };
            }
            catch (err) {
                reject(err);
            }
        }).finally(() => delete this.connecting);
        return this.connecting;
    }
    async post(props, jwtToken) {
        var _a, _b, _c, _d;
        const graphql = JSON.stringify({
            query: props.query,
            variables: (_a = props.variables) !== null && _a !== void 0 ? _a : {},
        });
        // eslint-disable-next-line no-constant-condition
        const responseTimeout = (_c = (_b = props.options) === null || _b === void 0 ? void 0 : _b.responseTimeout) !== null && _c !== void 0 ? _c : 3000;
        function* attempts() {
            var _a, _b;
            yield { responseTimeout }; // 1st attempt
            yield* (_b = (_a = props.options) === null || _a === void 0 ? void 0 : _a.retryStrategy) !== null && _b !== void 0 ? _b : generateRetryStrategy({
                retries: 2,
                baseResponseTimeout: responseTimeout * 1.3,
                responseTimeoutFactor: 2.5,
                delayFactor: 4,
            }); // retries
        }
        const errors = [];
        for (const attempt of attempts()) {
            if (errors.length) {
                const lastError = errors[errors.length - 1];
                console.log(`[GraphQL Attempt ${errors.length}] ${lastError.message}`, {
                    lastError,
                    graphql,
                });
            }
            try {
                return await this._post(graphql, (_d = attempt.responseTimeout) !== null && _d !== void 0 ? _d : responseTimeout, jwtToken !== null && jwtToken !== void 0 ? jwtToken : undefined);
            }
            catch (err) {
                if (err instanceof https_1.NonRetryableFetchError ||
                    err instanceof GraphQlError) {
                    throw err;
                }
                errors.push(err);
            }
        }
        throw errors[errors.length - 1];
    }
    async _post(graphql, responseTimeout, jwtToken) {
        let request;
        if (jwtToken === undefined) {
            request = await this.sign(graphql);
        }
        else {
            request = {
                headers: {
                    'content-type': 'application/json',
                    'aws_appsync_region': this.region,
                    'aws_appsync_authenticationType': "AMAZON_COGNITO_USER_POOLS",
                    Authorization: jwtToken,
                }
            };
        }
        const result = await (0, https_1.fetchJson)(this.graphqlUri.toString(), {
            headers: request.headers,
            method: "POST",
            responseTimeout,
            agent: this.keepAliveAgent,
        }, Buffer.from(graphql));
        if (isGraphQlResultWithErrors(result)) {
            throw GraphQlError.fromResultWithError(result);
        }
        return result;
    }
    subscribe(props, jwtToken, subscriptionId, subscriptionReadyCallback) {
        if (subscriptionId === undefined)
            subscriptionId = this.getNewSubscriptionId();
        const readable = this.createReadableStream(subscriptionId);
        this.subscriptionCallbacks[subscriptionId] = {
            data: (result) => {
                if (isGraphQlResultWithErrors(result)) {
                    readable.destroy(GraphQlError.fromResultWithError(result));
                }
                else {
                    readable.push(result);
                }
            },
            unsubscribe: readable.destroy.bind(readable),
        };
        this.appSyncSubscribe({
            ...props,
            subscriptionId: subscriptionId,
            jwtToken: jwtToken,
        })
            .then(() => subscriptionReadyCallback === null || subscriptionReadyCallback === void 0 ? void 0 : subscriptionReadyCallback(null, readable))
            .catch((err) => {
            readable.destroy();
            subscriptionReadyCallback === null || subscriptionReadyCallback === void 0 ? void 0 : subscriptionReadyCallback(err, null);
        });
        return readable;
    }
    async appSyncSubscribe(props) {
        var _a, _b;
        const subscriptionEstablishedTimeout = (_a = props.subscriptionEstablishedTimeout) !== null && _a !== void 0 ? _a : 5000;
        const ws = await this.connect();
        const graphql = JSON.stringify({
            query: props.query,
            variables: (_b = props.variables) !== null && _b !== void 0 ? _b : {},
        });
        let request;
        if (props.jwtToken === undefined) {
            request = await this.sign(graphql);
        }
        else {
            request = {
                headers: {
                    host: this.graphqlUri.hostname,
                    Authorization: props.jwtToken,
                }
            };
        }
        return new Promise((resolve, reject) => {
            setTimeout(() => reject(new Error(`Timeout while establishing AppSync subscription ${props.subscriptionId} (after ${subscriptionEstablishedTimeout} ms.)`)), subscriptionEstablishedTimeout);
            this.subscriptionCallbacks[props.subscriptionId].subscribed = () => {
                this.establishedSubscriptionIds.add(props.subscriptionId);
                resolve();
            };
            this.subscriptionCallbacks[props.subscriptionId].error = reject;
            ws.send(JSON.stringify({
                id: props.subscriptionId,
                payload: {
                    data: graphql,
                    extensions: {
                        authorization: request.headers,
                    },
                },
                type: "start",
            }), (err) => {
                if (err)
                    reject(err);
            });
        });
    }
    createReadableStream(subscriptionId) {
        const appSyncClient = this;
        return new stream_1.Readable({
            objectMode: true,
            destroy: function (err, cb) {
                if (err) {
                    this.emit("error", err);
                }
                else {
                    this.push(null); // This will end pipelines etc. cleanly
                }
                appSyncClient
                    .unsubscribe(subscriptionId)
                    .then(() => cb(null))
                    .catch(cb);
            },
            read: () => {
            },
        });
    }
    cleanUpAfterSubscription(subscriptionId) {
        delete this.subscriptionCallbacks[subscriptionId];
        this.establishedSubscriptionIds.delete(subscriptionId);
        if (Object.keys(this.subscriptionCallbacks).length === 0) {
            this.closeWebSocket();
        }
    }
    async unsubscribe(subscriptionId) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.cleanUpAfterSubscription(subscriptionId);
            return;
        }
        if (!this.establishedSubscriptionIds.has(subscriptionId)) {
            this.cleanUpAfterSubscription(subscriptionId);
            return;
        }
        const ws = this.ws;
        await new Promise((resolve, reject) => {
            this.subscriptionCallbacks[subscriptionId].unsubscribed = () => {
                this.cleanUpAfterSubscription(subscriptionId);
                resolve();
            };
            this.subscriptionCallbacks[subscriptionId].error = reject;
            ws.send(JSON.stringify({
                type: "stop",
                id: subscriptionId,
            }), (err) => {
                if (err)
                    reject(err);
            });
        });
    }
}
exports.AppSyncClient = AppSyncClient;
function extractGraphQlErrorMessage(result) {
    if (result.errors.length === 1) {
        return result.errors[0].message.replace(/\s+/g, " ");
    }
    return JSON.stringify(result.errors).replace(/\s+/g, " ");
}
function* generateRetryStrategy(options) {
    var _a, _b, _c, _d, _e;
    const baseDelay = (_a = options === null || options === void 0 ? void 0 : options.baseDelay) !== null && _a !== void 0 ? _a : 50;
    const delayFactor = (_b = options === null || options === void 0 ? void 0 : options.delayFactor) !== null && _b !== void 0 ? _b : 2;
    const baseResponseTimeout = (_c = options === null || options === void 0 ? void 0 : options.baseResponseTimeout) !== null && _c !== void 0 ? _c : 300;
    const responseTimeoutFactor = (_d = options === null || options === void 0 ? void 0 : options.responseTimeoutFactor) !== null && _d !== void 0 ? _d : 1.5;
    const retries = (_e = options === null || options === void 0 ? void 0 : options.retries) !== null && _e !== void 0 ? _e : 3;
    for (let i = 0; i < retries; i++) {
        const delay = baseDelay * delayFactor ** i;
        yield {
            delay: delay + (Math.random() * delay) / 4, // Add jitter of max 25% of delay
            responseTimeout: baseResponseTimeout * responseTimeoutFactor ** i,
        };
    }
}
exports.generateRetryStrategy = generateRetryStrategy;
class ConnectionError extends Error {
}
exports.ConnectionError = ConnectionError;
class GraphQlError extends Error {
    static fromResultWithError(result) {
        return new GraphQlError(extractGraphQlErrorMessage(result));
    }
}
exports.GraphQlError = GraphQlError;
class AppSyncClientClosingError extends Error {
}
exports.AppSyncClientClosingError = AppSyncClientClosingError;
class KeepAliveIntervalLapsedError extends Error {
}
exports.KeepAliveIntervalLapsedError = KeepAliveIntervalLapsedError;
class MissingCredentialsError extends Error {
}
exports.MissingCredentialsError = MissingCredentialsError;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwc3luYy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImFwcHN5bmMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLG1GQUFtRjtBQUNuRixFQUFFO0FBQ0Ysa0VBQWtFO0FBQ2xFLG1FQUFtRTtBQUNuRSwwQ0FBMEM7QUFDMUMsRUFBRTtBQUNGLGlEQUFpRDtBQUNqRCxFQUFFO0FBQ0Ysc0VBQXNFO0FBQ3RFLG9FQUFvRTtBQUNwRSwyRUFBMkU7QUFDM0Usc0VBQXNFO0FBQ3RFLGlDQUFpQzs7O0FBRWpDLG1DQUFnQztBQUNoQywrQkFBK0I7QUFDL0IsNkJBQXdCO0FBQ3hCLHVEQUFpRDtBQUNqRCxxREFBNkM7QUFDN0MsK0RBQW9EO0FBRXBELG1DQUEwRDtBQUMxRCxpQ0FBNEI7QUFDNUIsZ0NBQWlDO0FBRWpDLGlDQUE2QztBQUFyQyw2R0FBQSxvQkFBb0IsT0FBQTtBQWE1QixTQUFTLHlCQUF5QixDQUM5QixNQUEwQjtJQUUxQixPQUFPLENBQUMsQ0FBQyxDQUNKLE1BQWtDLENBQUMsTUFBTTtRQUN6QyxNQUFrQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQ3BELENBQUM7QUFDTixDQUFDO0FBY0QsTUFBYSxhQUFhO0lBMkJ0QixZQUFZLEtBS1g7O1FBckJPLHVCQUFrQixHQUFHLENBQUMsQ0FBQztRQUN2QiwrQkFBMEIsR0FBRyxJQUFJLEdBQUcsRUFBVSxDQUFDO1FBQ2hELG1CQUFjLEdBQUcsSUFBQSxnQkFBUyxFQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUUxQywwQkFBcUIsR0FRekIsRUFBRSxDQUFDO1FBVUgsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLFNBQUcsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDNUMsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFBLEtBQUssQ0FBQyxTQUFTLG1DQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFD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LEtBQUssR0FBRyxTQUFTLEdBQUcsV0FBVyxJQUFJLENBQUMsQ0FBQztRQUMzQyxNQUFNO1lBQ0YsS0FBSyxFQUFFLEtBQUssR0FBRyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLEVBQUUsaUNBQWlDO1lBQzdFLGVBQWUsRUFBRSxtQkFBbUIsR0FBRyxxQkFBcUIsSUFBSSxDQUFDO1NBQ3BFLENBQUM7SUFDTixDQUFDO0FBQ0wsQ0FBQztBQW5CRCxzREFtQkM7QUFFRCxNQUFhLGVBQWdCLFNBQVEsS0FBSztDQUN6QztBQURELDBDQUNDO0FBRUQsTUFBYSxZQUFhLFNBQVEsS0FBSztJQUNuQyxNQUFNLENBQUMsbUJBQW1CLENBQUMsTUFBK0I7UUFDdEQsT0FBTyxJQUFJLFlBQVksQ0FBQywwQkFBMEIsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0lBQ2hFLENBQUM7Q0FDSjtBQUpELG9DQUlDO0FBRUQsTUFBYSx5QkFBMEIsU0FBUSxLQUFLO0NBQ25EO0FBREQsOERBQ0M7QUFFRCxNQUFhLDRCQUE2QixTQUFRLEtBQUs7Q0FDdEQ7QUFERCxvRUFDQztBQUVELE1BQWEsdUJBQXdCLFNBQVEsS0FBSztDQUNqRDtBQURELDBEQUNDIiwic291cmNlc0NvbnRlbnQiOlsiLy8gQ29weXJpZ2h0IDIwMjEgQW1hem9uIFdlYiBTZXJ2aWNlcywgSW5jLiBvciBpdHMgYWZmaWxpYXRlcy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbi8vXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4vL1xuLy8gICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuLy9cbi8vIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbi8vIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbi8vIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuLy8gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuLy8gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG5cbmltcG9ydCB7UmVhZGFibGV9IGZyb20gXCJzdHJlYW1cIjtcbmltcG9ydCB7cHJvbWlzaWZ5fSBmcm9tIFwidXRpbFwiO1xuaW1wb3J0IHtVUkx9IGZyb20gXCJ1cmxcIjtcbmltcG9ydCB7U2lnbmF0dXJlVjR9IGZyb20gXCJAc21pdGh5L3NpZ25hdHVyZS12NFwiO1xuaW1wb3J0IHtTaGEyNTZ9IGZyb20gXCJAYXdzLWNyeXB0by9zaGEyNTYtanNcIjtcbmltcG9ydCB7ZnJvbVN0cmluZ30gZnJvbSBcIkBzbWl0aHkvdXRpbC1idWZmZXItZnJvbVwiO1xuaW1wb3J0IHtBd3NDcmVkZW50aWFsSWRlbnRpdHksIFByb3ZpZGVyfSBmcm9tIFwiQGF3cy1zZGsvdHlwZXNcIjtcbmltcG9ydCB7ZmV0Y2hKc29uLCBOb25SZXRyeWFibGVGZXRjaEVycm9yfSBmcm9tIFwiLi9odHRwc1wiO1xuaW1wb3J0IHtBZ2VudH0gZnJvbSBcImh0dHBzXCI7XG5pbXBvcnQgV2ViU29ja2V0ID0gcmVxdWlyZShcIndzXCIpO1xuXG5leHBvcnQge1Jlc3BvbnNlVGltZW91dEVycm9yfSBmcm9tIFwiLi9odHRwc1wiO1xuXG5leHBvcnQgdHlwZSBUeXBlZFJlYWRhYmxlPFQ+ID0gUmVhZGFibGUgJiB7XG4gICAgcmVhZDogKCkgPT4gVDtcbiAgICBbU3ltYm9sLmFzeW5jSXRlcmF0b3JdOiAoKSA9PiBBc3luY0l0ZXJhdG9yPFQ+O1xufTtcblxuZXhwb3J0IHR5cGUgR3JhcGhRTFJlc3VsdDxUPiA9XG4gICAgfCBHcmFwaFFsUmVzdWx0V2l0aERhdGE8VD5cbiAgICB8IEdyYXBoUWxSZXN1bHRXaXRoRXJyb3JzO1xudHlwZSBHcmFwaFFsUmVzdWx0V2l0aEVycm9ycyA9IHsgZXJyb3JzOiB7IG1lc3NhZ2U6IHN0cmluZyB9W10gfTtcbnR5cGUgR3JhcGhRbFJlc3VsdFdpdGhEYXRhPFQ+ID0geyBkYXRhOiBUIH07XG5cbmZ1bmN0aW9uIGlzR3JhcGhRbFJlc3VsdFdpdGhFcnJvcnMoXG4gICAgcmVzdWx0OiBHcmFwaFFMUmVzdWx0PGFueT5cbik6IHJlc3VsdCBpcyBHcmFwaFFsUmVzdWx0V2l0aEVycm9ycyB7XG4gICAgcmV0dXJuICEhKFxuICAgICAgICAocmVzdWx0IGFzIEdyYXBoUWxSZXN1bHRXaXRoRXJyb3JzKS5lcnJvcnMgJiZcbiAgICAgICAgKHJlc3VsdCBhcyBHcmFwaFFsUmVzdWx0V2l0aEVycm9ycykuZXJyb3JzLmxlbmd0aFxuICAgICk7XG59XG5cbmludGVyZmFjZSBSZXRyeSB7XG4gICAgZGVsYXk/OiBudW1iZXI7XG4gICAgcmVzcG9uc2VUaW1lb3V0PzogbnVtYmVyO1xufVxuXG50eXBlIFJldHJ5U3RyYXRlZ3kgPSBJdGVyYWJsZTxSZXRyeT47XG5cbmV4cG9ydCBpbnRlcmZhY2UgUG9zdE9wdGlvbnMge1xuICAgIHJlc3BvbnNlVGltZW91dD86IG51bWJlcjtcbiAgICByZXRyeVN0cmF0ZWd5PzogUmV0cnlTdHJhdGVneTtcbn1cblxuZXhwb3J0IGNsYXNzIEFwcFN5bmNDbGllbnQge1xuICAgIGdyYXBocWxVcmk6IFVSTDtcbiAgICByZWFsdGltZVVyaTogVVJMO1xuICAgIHJlZ2lvbjogc3RyaW5nO1xuICAgIHByaXZhdGUgc2lnbmVyOiBTaWduYXR1cmVWNDtcbiAgICBwcml2YXRlIHdzPzogV2ViU29ja2V0O1xuICAgIHByaXZhdGUgY29ubmVjdGVkPzogKGNvbm5lY3Rpb25UaW1lb3V0TXM6IG51bWJlcikgPT4gdm9pZDtcbiAgICBwcml2YXRlIGZhaWxlZFRvQ29ubmVjdD86IChlcnI6IEVycm9yKSA9PiB2b2lkO1xuICAgIHByaXZhdGUgY29ubmVjdGluZz86IFByb21pc2U8V2ViU29ja2V0PjtcbiAgICBwcml2YXRlIGNvbm5lY3Rpb25UaW1lb3V0TXM/OiBudW1iZXI7XG4gICAgcHJpdmF0ZSBzY2hlZHVsZWRLZWVwQWxpdmVDaGVjaz86IE5vZGVKUy5UaW1lb3V0O1xuICAgIHByaXZhdGUgbGFzdFN1YnNjcmlwdGlvbklkID0gMDtcbiAgICBwcml2YXRlIGVzdGFibGlzaGVkU3Vic2NyaXB0aW9uSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgcHVibGljIHN1YnNjcmliZUFzeW5jID0gcHJvbWlzaWZ5KHRoaXMuc3Vic2NyaWJlKTtcblxuICAgIHByaXZhdGUgc3Vic2NyaXB0aW9uQ2FsbGJhY2tzOiB7XG4gICAgICAgIFtzdWJzY3JpcHRpb25JZDogc3RyaW5nXToge1xuICAgICAgICAgICAgZGF0YTogKHBheWxvYWQ6IGFueSkgPT4gdm9pZDtcbiAgICAgICAgICAgIGVycm9yPzogKGVycjogRXJyb3IpID0+IHZvaWQ7XG4gICAgICAgICAgICBzdWJzY3JpYmVkPzogKCkgPT4gdm9pZDtcbiAgICAgICAgICAgIHVuc3Vic2NyaWJlOiAoZXJyPzogRXJyb3IpID0+IHZvaWQ7XG4gICAgICAgICAgICB1bnN1YnNjcmliZWQ/OiAoKSA9PiB2b2lkO1xuICAgICAgICB9O1xuICAgIH0gPSB7fTtcblxuICAgIHByaXZhdGUga2VlcEFsaXZlQWdlbnQ6IEFnZW50O1xuXG4gICAgY29uc3RydWN0b3IocHJvcHM6IHtcbiAgICAgICAgZ3JhcGhRbFVybDogc3RyaW5nO1xuICAgICAgICByZWFsdGltZVVybD86IHN0cmluZztcbiAgICAgICAgYXBpUmVnaW9uPzogc3RyaW5nO1xuICAgICAgICBjcmVkZW50aWFscz86IEF3c0NyZWRlbnRpYWxJZGVudGl0eSB8IFByb3ZpZGVyPEF3c0NyZWRlbnRpYWxJZGVudGl0eT47XG4gICAgfSkge1xuICAgICAgICB0aGlzLmdyYXBocWxVcmkgPSBuZXcgVVJMKHByb3BzLmdyYXBoUWxVcmwpO1xuICAgICAgICB0aGlzLnJlZ2lvbiA9IHByb3BzLmFwaVJlZ2lvbiA/PyB0aGlzLmdyYXBocWxVcmkuaG9zdG5hbWUuc3BsaXQoXCIuXCIpWzJdO1xuICAgICAgICB0aGlzLnJlYWx0aW1lVXJpID0gbmV3IFVSTChcbiAgICAgICAgICAgIHByb3BzLnJlYWx0aW1lVXJsID8/XG4gICAgICAgICAgICBgd3NzOi8vJHt0aGlzLmdyYXBocWxVcmkuaG9zdG5hbWUuc3BsaXQoXCIuXCIpWzBdfS5hcHBzeW5jLXJlYWx0aW1lLWFwaS4ke1xuICAgICAgICAgICAgICAgIHRoaXMucmVnaW9uXG4gICAgICAgICAgICB9LmFtYXpvbmF3cy5jb20vZ3JhcGhxbGBcbiAgICAgICAgKTtcblxuICAgICAgICB0aGlzLmtlZXBBbGl2ZUFnZW50ID0gbmV3IEFnZW50KHtcbiAgICAgICAgICAgIGtlZXBBbGl2ZTogdHJ1ZSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbGV0IGNyZWRlbnRpYWxzID0gcHJvcHMuY3JlZGVudGlhbHM7XG4gICAgICAgIGlmICghY3JlZGVudGlhbHMpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY3JlZGVudGlhbHMgPVxuICAgICAgICAgICAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLXZhci1yZXF1aXJlc1xuICAgICAgICAgICAgICAgICAgICByZXF1aXJlKFwiQGF3cy1zZGsvY3JlZGVudGlhbC1wcm92aWRlci1ub2RlXCIpLmRlZmF1bHRQcm92aWRlcigpO1xuICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IE1pc3NpbmdDcmVkZW50aWFsc0Vycm9yKFxuICAgICAgICAgICAgICAgICAgICBgTm8gY3JlZGVudGlhbHMgcHJvdmlkZWQuIFlvdSBzaG91bGQgZWl0aGVyIHByb3ZpZGUgY3JlZGVudGlhbHMsIG9yIGluc3RhbGwgXCJAYXdzLXNkay9jcmVkZW50aWFsLXByb3ZpZGVyLW5vZGVcImBcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5zaWduZXIgPSBuZXcgU2lnbmF0dXJlVjQoe1xuICAgICAgICAgICAgc2VydmljZTogXCJhcHBzeW5jXCIsXG4gICAgICAgICAgICByZWdpb246IHRoaXMucmVnaW9uLFxuICAgICAgICAgICAgY3JlZGVudGlhbHM6IGNyZWRlbnRpYWxzISxcbiAgICAgICAgICAgIHNoYTI1NjogU2hhMjU2LFxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGdldE5ld1N1YnNjcmlwdGlvbklkKCkge1xuICAgICAgICByZXR1cm4gKCsrdGhpcy5sYXN0U3Vic2NyaXB0aW9uSWQgJSBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUikudG9TdHJpbmcoKTtcbiAgICB9XG5cbiAgICBjbG9zZSgpIHtcbiAgICAgICAgdGhpcy5jbG9zZVdlYlNvY2tldChcbiAgICAgICAgICAgIG5ldyBBcHBTeW5jQ2xpZW50Q2xvc2luZ0Vycm9yKFwiQXBwU3luYyBjbGllbnQgaGFzIGJlZW4gY2xvc2VkXCIpXG4gICAgICAgICk7XG4gICAgICAgIHRoaXMuY2xvc2VLZWVwQWxpdmVBZ2VudCgpO1xuICAgIH1cblxuICAgIHByaXZhdGUgY2xvc2VLZWVwQWxpdmVBZ2VudCgpIHtcbiAgICAgICAgdGhpcy5rZWVwQWxpdmVBZ2VudC5kZXN0cm95KCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBjbG9zZUFsbFN1YnNjcmlwdGlvbnMoZXJyPzogRXJyb3IpIHtcbiAgICAgICAgT2JqZWN0LnZhbHVlcyh0aGlzLnN1YnNjcmlwdGlvbkNhbGxiYWNrcykuZm9yRWFjaCgoe3Vuc3Vic2NyaWJlfSkgPT5cbiAgICAgICAgICAgIHVuc3Vic2NyaWJlKGVycilcbiAgICAgICAgKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGNsb3NlV2ViU29ja2V0KGVycj86IEVycm9yKSB7XG4gICAgICAgIHRoaXMuY2xvc2VBbGxTdWJzY3JpcHRpb25zKGVycik7XG4gICAgICAgIGlmICh0aGlzLndzKSB7XG4gICAgICAgICAgICB0aGlzLndzLnRlcm1pbmF0ZSgpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLnNjaGVkdWxlZEtlZXBBbGl2ZUNoZWNrKSB7XG4gICAgICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5zY2hlZHVsZWRLZWVwQWxpdmVDaGVjayk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHNpZ24oYm9keTogc3RyaW5nLCBpc0Nvbm5lY3Rpb25BdHRlbXB0ID0gZmFsc2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2lnbmVyLnNpZ24oe1xuICAgICAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICAgICAgIGFjY2VwdDogXCJhcHBsaWNhdGlvbi9qc29uLCB0ZXh0L2phdmFzY3JpcHRcIixcbiAgICAgICAgICAgICAgICBcImNvbnRlbnQtZW5jb2RpbmdcIjogXCJhbXotMS4wXCIsXG4gICAgICAgICAgICAgICAgXCJjb250ZW50LXR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uOyBjaGFyc2V0PVVURi04XCIsXG4gICAgICAgICAgICAgICAgaG9zdDogdGhpcy5ncmFwaHFsVXJpLmhvc3RuYW1lLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGhvc3RuYW1lOiB0aGlzLmdyYXBocWxVcmkuaG9zdG5hbWUsXG4gICAgICAgICAgICBtZXRob2Q6IFwiUE9TVFwiLFxuICAgICAgICAgICAgcGF0aDogaXNDb25uZWN0aW9uQXR0ZW1wdFxuICAgICAgICAgICAgICAgID8gdGhpcy5ncmFwaHFsVXJpLnBhdGhuYW1lICsgXCIvY29ubmVjdFwiXG4gICAgICAgICAgICAgICAgOiB0aGlzLmdyYXBocWxVcmkucGF0aG5hbWUsXG4gICAgICAgICAgICBwcm90b2NvbDogdGhpcy5ncmFwaHFsVXJpLnByb3RvY29sLFxuICAgICAgICAgICAgYm9keSxcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBzY2hlZHVsZUtlZXBBbGl2ZUNoZWNrKCkge1xuICAgICAgICBpZiAodGhpcy5zY2hlZHVsZWRLZWVwQWxpdmVDaGVjaykge1xuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMuc2NoZWR1bGVkS2VlcEFsaXZlQ2hlY2spO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuc2NoZWR1bGVkS2VlcEFsaXZlQ2hlY2sgPSBzZXRUaW1lb3V0KFxuICAgICAgICAgICAgKCkgPT5cbiAgICAgICAgICAgICAgICB0aGlzLmNsb3NlV2ViU29ja2V0KFxuICAgICAgICAgICAgICAgICAgICBuZXcgS2VlcEFsaXZlSW50ZXJ2YWxMYXBzZWRFcnJvcihcbiAgICAgICAgICAgICAgICAgICAgICAgIGBDb25uZWN0aW9uIGhhcyBiZWNvbWUgc3RhbGUgKGRpZCBub3QgcmVjZWl2ZSBhIGtlZXAtYWxpdmUgbWVzc2FnZSBmb3IgJHt0aGlzLmNvbm5lY3Rpb25UaW1lb3V0TXN9IG1zLilgXG4gICAgICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgdGhpcy5jb25uZWN0aW9uVGltZW91dE1zXG4gICAgICAgICk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBoYW5kbGVNZXNzYWdlKGV2ZW50OiBXZWJTb2NrZXQuTWVzc2FnZUV2ZW50KSB7XG4gICAgICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UoZXZlbnQuZGF0YS50b1N0cmluZygpKTtcbiAgICAgICAgaWYgKGV2ZW50LmRhdGEpIHtcbiAgICAgICAgICAgIGlmIChwYXJzZWQudHlwZSA9PT0gXCJjb25uZWN0aW9uX2Vycm9yXCIpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmZhaWxlZFRvQ29ubmVjdCEoXG4gICAgICAgICAgICAgICAgICAgIG5ldyBDb25uZWN0aW9uRXJyb3IoZXh0cmFjdEdyYXBoUWxFcnJvck1lc3NhZ2UocGFyc2VkLnBheWxvYWQpKVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHBhcnNlZC50eXBlID09PSBcImNvbm5lY3Rpb25fYWNrXCIpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmNvbm5lY3RlZCEocGFyc2VkLnBheWxvYWQhLmNvbm5lY3Rpb25UaW1lb3V0TXMpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwYXJzZWQudHlwZSA9PT0gXCJlcnJvclwiKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc3Vic2NyaXB0aW9uSWQgPSBwYXJzZWQuaWQ7XG4gICAgICAgICAgICAgICAgdGhpcy5zdWJzY3JpcHRpb25DYWxsYmFja3Nbc3Vic2NyaXB0aW9uSWRdLmVycm9yIShcbiAgICAgICAgICAgICAgICAgICAgR3JhcGhRbEVycm9yLmZyb21SZXN1bHRXaXRoRXJyb3IocGFyc2VkLnBheWxvYWQpXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocGFyc2VkLnR5cGUgPT09IFwic3RhcnRfYWNrXCIpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBzdWJzY3JpcHRpb25JZCA9IHBhcnNlZC5pZDtcbiAgICAgICAgICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbkNhbGxiYWNrc1tzdWJzY3JpcHRpb25JZF0uc3Vic2NyaWJlZCEoKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocGFyc2VkLnR5cGUgPT09IFwia2FcIikge1xuICAgICAgICAgICAgICAgIHRoaXMuc2NoZWR1bGVLZWVwQWxpdmVDaGVjaygpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwYXJzZWQudHlwZSA9PT0gXCJkYXRhXCIpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBzdWJzY3JpcHRpb25JZCA9IHBhcnNlZC5pZDtcbiAgICAgICAgICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbkNhbGxiYWNrc1tzdWJzY3JpcHRpb25JZF0uZGF0YShwYXJzZWQucGF5bG9hZCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHBhcnNlZC50eXBlID09PSBcImNvbXBsZXRlXCIpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBzdWJzY3JpcHRpb25JZCA9IHBhcnNlZC5pZDtcbiAgICAgICAgICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbkNhbGxiYWNrc1tzdWJzY3JpcHRpb25JZF0udW5zdWJzY3JpYmVkISgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIGFzeW5jIGNvbm5lY3QoKSB7XG4gICAgICAgIGlmICh0aGlzLmNvbm5lY3RpbmcpIHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuY29ubmVjdGluZy5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy53cyAmJiB0aGlzLndzLnJlYWR5U3RhdGUgPT09IFdlYlNvY2tldC5PUEVOKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy53cztcbiAgICAgICAgfVxuICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tYXN5bmMtcHJvbWlzZS1leGVjdXRvclxuICAgICAgICB0aGlzLmNvbm5lY3RpbmcgPSBuZXcgUHJvbWlzZTxXZWJTb2NrZXQ+KGFzeW5jIChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgY29ubmVjdGlvbkF1dGggPSBhd2FpdCB0aGlzLnNpZ24oXCJ7fVwiLCB0cnVlKTtcbiAgICAgICAgICAgICAgICBjb25zdCBjb25uZWN0aW9uVXJsID0gbmV3IFVSTChcbiAgICAgICAgICAgICAgICAgICAgYD9oZWFkZXI9JHtmcm9tU3RyaW5nKFxuICAgICAgICAgICAgICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkoY29ubmVjdGlvbkF1dGguaGVhZGVycylcbiAgICAgICAgICAgICAgICAgICAgKS50b1N0cmluZyhcImJhc2U2NFwiKX0mcGF5bG9hZD0ke2Zyb21TdHJpbmcoXG4gICAgICAgICAgICAgICAgICAgICAgICBKU09OLnN0cmluZ2lmeShcInt9XCIpXG4gICAgICAgICAgICAgICAgICAgICkudG9TdHJpbmcoXCJiYXNlNjRcIil9YCxcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5yZWFsdGltZVVyaVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgY29uc3Qgd3MgPSAodGhpcy53cyA9IG5ldyBXZWJTb2NrZXQoY29ubmVjdGlvblVybC50b1N0cmluZygpLCBbXG4gICAgICAgICAgICAgICAgICAgIFwiZ3JhcGhxbC13c1wiLFxuICAgICAgICAgICAgICAgIF0pKTtcbiAgICAgICAgICAgICAgICB0aGlzLmNvbm5lY3RlZCA9IChjb25uZWN0aW9uVGltZW91dE1zKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY29ubmVjdGlvblRpbWVvdXRNcyA9IGNvbm5lY3Rpb25UaW1lb3V0TXM7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2NoZWR1bGVLZWVwQWxpdmVDaGVjaygpO1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHdzKTtcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIHRoaXMuZmFpbGVkVG9Db25uZWN0ID0gcmVqZWN0O1xuICAgICAgICAgICAgICAgIHdzLm9uZXJyb3IgPSByZWplY3Q7XG4gICAgICAgICAgICAgICAgd3Mub25vcGVuID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB3cy5zZW5kKEpTT04uc3RyaW5naWZ5KHt0eXBlOiBcImNvbm5lY3Rpb25faW5pdFwifSksIChlcnIpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChlcnIpIHJlamVjdChlcnIpO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIHdzLm9ubWVzc2FnZSA9IHRoaXMuaGFuZGxlTWVzc2FnZS5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgICAgIHdzLm9uY2xvc2UgPSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGVycm9yID0gbmV3IEVycm9yKFwiU29ja2V0IHRvIEFwcFN5bmMgY2xvc2VkIHByZW1hdHVyZWx5XCIpO1xuICAgICAgICAgICAgICAgICAgICByZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmNsb3NlQWxsU3Vic2NyaXB0aW9ucyhlcnJvcik7XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgICAgIHJlamVjdChlcnIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KS5maW5hbGx5KCgpID0+IGRlbGV0ZSB0aGlzLmNvbm5lY3RpbmcpO1xuICAgICAgICByZXR1cm4gdGhpcy5jb25uZWN0aW5nO1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBwb3N0PFQgPSBhbnk+KHByb3BzOiB7XG4gICAgICAgIHF1ZXJ5OiBzdHJpbmc7XG4gICAgICAgIHZhcmlhYmxlcz86IHsgW2tleTogc3RyaW5nXTogYW55IH07XG4gICAgICAgIG9wdGlvbnM/OiBQb3N0T3B0aW9ucztcbiAgICB9LCBqd3RUb2tlbj86IHN0cmluZykge1xuICAgICAgICBjb25zdCBncmFwaHFsID0gSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgcXVlcnk6IHByb3BzLnF1ZXJ5LFxuICAgICAgICAgICAgdmFyaWFibGVzOiBwcm9wcy52YXJpYWJsZXMgPz8ge30sXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zdGFudC1jb25kaXRpb25cbiAgICAgICAgY29uc3QgcmVzcG9uc2VUaW1lb3V0ID0gcHJvcHMub3B0aW9ucz8ucmVzcG9uc2VUaW1lb3V0ID8/IDMwMDA7XG5cbiAgICAgICAgZnVuY3Rpb24qIGF0dGVtcHRzKCk6IFJldHJ5U3RyYXRlZ3kge1xuICAgICAgICAgICAgeWllbGQge3Jlc3BvbnNlVGltZW91dH07IC8vIDFzdCBhdHRlbXB0XG4gICAgICAgICAgICB5aWVsZCogcHJvcHMub3B0aW9ucz8ucmV0cnlTdHJhdGVneSA/P1xuICAgICAgICAgICAgZ2VuZXJhdGVSZXRyeVN0cmF0ZWd5KHtcbiAgICAgICAgICAgICAgICByZXRyaWVzOiAyLFxuICAgICAgICAgICAgICAgIGJhc2VSZXNwb25zZVRpbWVvdXQ6IHJlc3BvbnNlVGltZW91dCAqIDEuMyxcbiAgICAgICAgICAgICAgICByZXNwb25zZVRpbWVvdXRGYWN0b3I6IDIuNSxcbiAgICAgICAgICAgICAgICBkZWxheUZhY3RvcjogNCxcbiAgICAgICAgICAgIH0pOyAvLyByZXRyaWVzXG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBlcnJvcnM6IEVycm9yW10gPSBbXTtcbiAgICAgICAgZm9yIChjb25zdCBhdHRlbXB0IG9mIGF0dGVtcHRzKCkpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcnMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgbGFzdEVycm9yID0gZXJyb3JzW2Vycm9ycy5sZW5ndGggLSAxXTtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgW0dyYXBoUUwgQXR0ZW1wdCAke2Vycm9ycy5sZW5ndGh9XSAke2xhc3RFcnJvci5tZXNzYWdlfWAsIHtcbiAgICAgICAgICAgICAgICAgICAgbGFzdEVycm9yLFxuICAgICAgICAgICAgICAgICAgICBncmFwaHFsLFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5fcG9zdDxHcmFwaFFsUmVzdWx0V2l0aERhdGE8VD4+KFxuICAgICAgICAgICAgICAgICAgICBncmFwaHFsLFxuICAgICAgICAgICAgICAgICAgICBhdHRlbXB0LnJlc3BvbnNlVGltZW91dCA/PyByZXNwb25zZVRpbWVvdXQsXG4gICAgICAgICAgICAgICAgICAgIGp3dFRva2VuID8/IHVuZGVmaW5lZFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgICAgIGVyciBpbnN0YW5jZW9mIE5vblJldHJ5YWJsZUZldGNoRXJyb3IgfHxcbiAgICAgICAgICAgICAgICAgICAgZXJyIGluc3RhbmNlb2YgR3JhcGhRbEVycm9yXG4gICAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZXJyb3JzLnB1c2goZXJyIGFzIEVycm9yKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRocm93IGVycm9yc1tlcnJvcnMubGVuZ3RoIC0gMV07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBfcG9zdDxUIGV4dGVuZHMgR3JhcGhRbFJlc3VsdFdpdGhEYXRhPGFueT4+KFxuICAgICAgICBncmFwaHFsOiBzdHJpbmcsXG4gICAgICAgIHJlc3BvbnNlVGltZW91dDogbnVtYmVyLFxuICAgICAgICBqd3RUb2tlbj86IHN0cmluZ1xuICAgICkge1xuICAgICAgICBsZXQgcmVxdWVzdDtcbiAgICAgICAgaWYgKGp3dFRva2VuID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJlcXVlc3QgPSBhd2FpdCB0aGlzLnNpZ24oZ3JhcGhxbCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXF1ZXN0ID0ge1xuICAgICAgICAgICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAgICAgICAgICAgJ2NvbnRlbnQtdHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAgICAgICAgICAgJ2F3c19hcHBzeW5jX3JlZ2lvbic6IHRoaXMucmVnaW9uLFxuICAgICAgICAgICAgICAgICAgICAnYXdzX2FwcHN5bmNfYXV0aGVudGljYXRpb25UeXBlJzogXCJBTUFaT05fQ09HTklUT19VU0VSX1BPT0xTXCIsXG4gICAgICAgICAgICAgICAgICAgIEF1dGhvcml6YXRpb246IGp3dFRva2VuLFxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZmV0Y2hKc29uPFQ+KFxuICAgICAgICAgICAgdGhpcy5ncmFwaHFsVXJpLnRvU3RyaW5nKCksXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgaGVhZGVyczogcmVxdWVzdC5oZWFkZXJzLFxuICAgICAgICAgICAgICAgIG1ldGhvZDogXCJQT1NUXCIsXG4gICAgICAgICAgICAgICAgcmVzcG9uc2VUaW1lb3V0LFxuICAgICAgICAgICAgICAgIGFnZW50OiB0aGlzLmtlZXBBbGl2ZUFnZW50LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIEJ1ZmZlci5mcm9tKGdyYXBocWwpXG4gICAgICAgICk7XG4gICAgICAgIGlmIChpc0dyYXBoUWxSZXN1bHRXaXRoRXJyb3JzKHJlc3VsdCkpIHtcbiAgICAgICAgICAgIHRocm93IEdyYXBoUWxFcnJvci5mcm9tUmVzdWx0V2l0aEVycm9yKHJlc3VsdCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICBwdWJsaWMgc3Vic2NyaWJlPFQgPSBhbnk+KFxuICAgICAgICBwcm9wczoge1xuICAgICAgICAgICAgcXVlcnk6IHN0cmluZztcbiAgICAgICAgICAgIHZhcmlhYmxlcz86IHsgW2tleTogc3RyaW5nXTogYW55IH07XG4gICAgICAgIH0sXG4gICAgICAgIGp3dFRva2VuPzogc3RyaW5nLFxuICAgICAgICBzdWJzY3JpcHRpb25JZD86IHN0cmluZyxcbiAgICAgICAgc3Vic2NyaXB0aW9uUmVhZHlDYWxsYmFjaz86IChcbiAgICAgICAgICAgIGVycjogRXJyb3IgfCBudWxsLFxuICAgICAgICAgICAgcmVhZGFibGU6IFR5cGVkUmVhZGFibGU8R3JhcGhRbFJlc3VsdFdpdGhEYXRhPFQ+PlxuICAgICAgICApID0+IHZvaWQsXG4gICAgKSB7XG4gICAgICAgIGlmIChzdWJzY3JpcHRpb25JZCA9PT0gdW5kZWZpbmVkKSBzdWJzY3JpcHRpb25JZCA9IHRoaXMuZ2V0TmV3U3Vic2NyaXB0aW9uSWQoKTtcbiAgICAgICAgY29uc3QgcmVhZGFibGUgPSB0aGlzLmNyZWF0ZVJlYWRhYmxlU3RyZWFtKHN1YnNjcmlwdGlvbklkKSBhcyBUeXBlZFJlYWRhYmxlPFxuICAgICAgICAgICAgR3JhcGhRbFJlc3VsdFdpdGhEYXRhPFQ+XG4gICAgICAgID47XG4gICAgICAgIHRoaXMuc3Vic2NyaXB0aW9uQ2FsbGJhY2tzW3N1YnNjcmlwdGlvbklkXSA9IHtcbiAgICAgICAgICAgIGRhdGE6IChyZXN1bHQ6IEdyYXBoUUxSZXN1bHQ8VD4pID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoaXNHcmFwaFFsUmVzdWx0V2l0aEVycm9ycyhyZXN1bHQpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlYWRhYmxlLmRlc3Ryb3koR3JhcGhRbEVycm9yLmZyb21SZXN1bHRXaXRoRXJyb3IocmVzdWx0KSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVhZGFibGUucHVzaChyZXN1bHQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB1bnN1YnNjcmliZTogcmVhZGFibGUuZGVzdHJveS5iaW5kKHJlYWRhYmxlKSxcbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5hcHBTeW5jU3Vic2NyaWJlKHtcbiAgICAgICAgICAgIC4uLnByb3BzLFxuICAgICAgICAgICAgc3Vic2NyaXB0aW9uSWQ6IHN1YnNjcmlwdGlvbklkLFxuICAgICAgICAgICAgand0VG9rZW46IGp3dFRva2VuLFxuICAgICAgICB9KVxuICAgICAgICAgICAgLnRoZW4oKCkgPT4gc3Vic2NyaXB0aW9uUmVhZHlDYWxsYmFjaz8uKG51bGwsIHJlYWRhYmxlKSlcbiAgICAgICAgICAgIC5jYXRjaCgoZXJyKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVhZGFibGUuZGVzdHJveSgpO1xuICAgICAgICAgICAgICAgIHN1YnNjcmlwdGlvblJlYWR5Q2FsbGJhY2s/LihlcnIsIG51bGwgYXMgYW55KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcmVhZGFibGU7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBhcHBTeW5jU3Vic2NyaWJlKHByb3BzOiB7XG4gICAgICAgIHF1ZXJ5OiBzdHJpbmc7XG4gICAgICAgIHZhcmlhYmxlcz86IHsgW2tleTogc3RyaW5nXTogYW55IH07XG4gICAgICAgIHN1YnNjcmlwdGlvbkVzdGFibGlzaGVkVGltZW91dD86IG51bWJlcjtcbiAgICAgICAgc3Vic2NyaXB0aW9uSWQ6IHN0cmluZztcbiAgICAgICAgand0VG9rZW4/OiBzdHJpbmc7XG4gICAgfSkge1xuICAgICAgICBjb25zdCBzdWJzY3JpcHRpb25Fc3RhYmxpc2hlZFRpbWVvdXQgPVxuICAgICAgICAgICAgcHJvcHMuc3Vic2NyaXB0aW9uRXN0YWJsaXNoZWRUaW1lb3V0ID8/IDUwMDA7XG4gICAgICAgIGNvbnN0IHdzID0gYXdhaXQgdGhpcy5jb25uZWN0KCk7XG4gICAgICAgIGNvbnN0IGdyYXBocWwgPSBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBxdWVyeTogcHJvcHMucXVlcnksXG4gICAgICAgICAgICB2YXJpYWJsZXM6IHByb3BzLnZhcmlhYmxlcyA/PyB7fSxcbiAgICAgICAgfSk7XG4gICAgICAgIGxldCByZXF1ZXN0O1xuICAgICAgICBpZiAocHJvcHMuand0VG9rZW4gPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmVxdWVzdCA9IGF3YWl0IHRoaXMuc2lnbihncmFwaHFsKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlcXVlc3QgPSB7XG4gICAgICAgICAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICAgICAgICAgICBob3N0OiB0aGlzLmdyYXBocWxVcmkuaG9zdG5hbWUsXG4gICAgICAgICAgICAgICAgICAgIEF1dGhvcml6YXRpb246IHByb3BzLmp3dFRva2VuLFxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIHNldFRpbWVvdXQoXG4gICAgICAgICAgICAgICAgKCkgPT5cbiAgICAgICAgICAgICAgICAgICAgcmVqZWN0KFxuICAgICAgICAgICAgICAgICAgICAgICAgbmV3IEVycm9yKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGBUaW1lb3V0IHdoaWxlIGVzdGFibGlzaGluZyBBcHBTeW5jIHN1YnNjcmlwdGlvbiAke3Byb3BzLnN1YnNjcmlwdGlvbklkfSAoYWZ0ZXIgJHtzdWJzY3JpcHRpb25Fc3RhYmxpc2hlZFRpbWVvdXR9IG1zLilgXG4gICAgICAgICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgICAgICksXG4gICAgICAgICAgICAgICAgc3Vic2NyaXB0aW9uRXN0YWJsaXNoZWRUaW1lb3V0XG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgdGhpcy5zdWJzY3JpcHRpb25DYWxsYmFja3NbcHJvcHMuc3Vic2NyaXB0aW9uSWRdLnN1YnNjcmliZWQgPSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5lc3RhYmxpc2hlZFN1YnNjcmlwdGlvbklkcy5hZGQocHJvcHMuc3Vic2NyaXB0aW9uSWQpO1xuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbkNhbGxiYWNrc1twcm9wcy5zdWJzY3JpcHRpb25JZF0uZXJyb3IgPSByZWplY3Q7XG4gICAgICAgICAgICB3cy5zZW5kKFxuICAgICAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgICAgICAgICAgaWQ6IHByb3BzLnN1YnNjcmlwdGlvbklkLFxuICAgICAgICAgICAgICAgICAgICBwYXlsb2FkOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiBncmFwaHFsLFxuICAgICAgICAgICAgICAgICAgICAgICAgZXh0ZW5zaW9uczoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGF1dGhvcml6YXRpb246IHJlcXVlc3QuaGVhZGVycyxcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IFwic3RhcnRcIixcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICAoZXJyKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChlcnIpIHJlamVjdChlcnIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgY3JlYXRlUmVhZGFibGVTdHJlYW0oc3Vic2NyaXB0aW9uSWQ6IHN0cmluZykge1xuICAgICAgICBjb25zdCBhcHBTeW5jQ2xpZW50ID0gdGhpcztcbiAgICAgICAgcmV0dXJuIG5ldyBSZWFkYWJsZSh7XG4gICAgICAgICAgICBvYmplY3RNb2RlOiB0cnVlLFxuICAgICAgICAgICAgZGVzdHJveTogZnVuY3Rpb24gKGVyciwgY2IpIHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZW1pdChcImVycm9yXCIsIGVycik7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wdXNoKG51bGwpOyAvLyBUaGlzIHdpbGwgZW5kIHBpcGVsaW5lcyBldGMuIGNsZWFubHlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYXBwU3luY0NsaWVudFxuICAgICAgICAgICAgICAgICAgICAudW5zdWJzY3JpYmUoc3Vic2NyaXB0aW9uSWQpXG4gICAgICAgICAgICAgICAgICAgIC50aGVuKCgpID0+IGNiKG51bGwpKVxuICAgICAgICAgICAgICAgICAgICAuY2F0Y2goY2IpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHJlYWQ6ICgpID0+IHtcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgY2xlYW5VcEFmdGVyU3Vic2NyaXB0aW9uKHN1YnNjcmlwdGlvbklkOiBzdHJpbmcpIHtcbiAgICAgICAgZGVsZXRlIHRoaXMuc3Vic2NyaXB0aW9uQ2FsbGJhY2tzW3N1YnNjcmlwdGlvbklkXTtcbiAgICAgICAgdGhpcy5lc3RhYmxpc2hlZFN1YnNjcmlwdGlvbklkcy5kZWxldGUoc3Vic2NyaXB0aW9uSWQpO1xuICAgICAgICBpZiAoT2JqZWN0LmtleXModGhpcy5zdWJzY3JpcHRpb25DYWxsYmFja3MpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgdGhpcy5jbG9zZVdlYlNvY2tldCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyB1bnN1YnNjcmliZShzdWJzY3JpcHRpb25JZDogc3RyaW5nKSB7XG4gICAgICAgIGlmICghdGhpcy53cyB8fCB0aGlzLndzLnJlYWR5U3RhdGUgIT09IFdlYlNvY2tldC5PUEVOKSB7XG4gICAgICAgICAgICB0aGlzLmNsZWFuVXBBZnRlclN1YnNjcmlwdGlvbihzdWJzY3JpcHRpb25JZCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCF0aGlzLmVzdGFibGlzaGVkU3Vic2NyaXB0aW9uSWRzLmhhcyhzdWJzY3JpcHRpb25JZCkpIHtcbiAgICAgICAgICAgIHRoaXMuY2xlYW5VcEFmdGVyU3Vic2NyaXB0aW9uKHN1YnNjcmlwdGlvbklkKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB3cyA9IHRoaXMud3M7XG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIHRoaXMuc3Vic2NyaXB0aW9uQ2FsbGJhY2tzW3N1YnNjcmlwdGlvbklkXS51bnN1YnNjcmliZWQgPSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5jbGVhblVwQWZ0ZXJTdWJzY3JpcHRpb24oc3Vic2NyaXB0aW9uSWQpO1xuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbkNhbGxiYWNrc1tzdWJzY3JpcHRpb25JZF0uZXJyb3IgPSByZWplY3Q7XG4gICAgICAgICAgICB3cy5zZW5kKFxuICAgICAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogXCJzdG9wXCIsXG4gICAgICAgICAgICAgICAgICAgIGlkOiBzdWJzY3JpcHRpb25JZCxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICAoZXJyKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChlcnIpIHJlamVjdChlcnIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICk7XG4gICAgICAgIH0pO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZXh0cmFjdEdyYXBoUWxFcnJvck1lc3NhZ2UocmVzdWx0OiBHcmFwaFFsUmVzdWx0V2l0aEVycm9ycykge1xuICAgIGlmIChyZXN1bHQuZXJyb3JzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICByZXR1cm4gcmVzdWx0LmVycm9yc1swXS5tZXNzYWdlLnJlcGxhY2UoL1xccysvZywgXCIgXCIpO1xuICAgIH1cbiAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkocmVzdWx0LmVycm9ycykucmVwbGFjZSgvXFxzKy9nLCBcIiBcIik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiogZ2VuZXJhdGVSZXRyeVN0cmF0ZWd5KG9wdGlvbnM/OiB7XG4gICAgcmV0cmllczogbnVtYmVyO1xuICAgIGJhc2VSZXNwb25zZVRpbWVvdXQ/OiBudW1iZXI7XG4gICAgcmVzcG9uc2VUaW1lb3V0RmFjdG9yPzogbnVtYmVyO1xuICAgIGJhc2VEZWxheT86IG51bWJlcjtcbiAgICBkZWxheUZhY3Rvcj86IG51bWJlcjtcbn0pOiBSZXRyeVN0cmF0ZWd5IHtcbiAgICBjb25zdCBiYXNlRGVsYXkgPSBvcHRpb25zPy5iYXNlRGVsYXkgPz8gNTA7XG4gICAgY29uc3QgZGVsYXlGYWN0b3IgPSBvcHRpb25zPy5kZWxheUZhY3RvciA/PyAyO1xuICAgIGNvbnN0IGJhc2VSZXNwb25zZVRpbWVvdXQgPSBvcHRpb25zPy5iYXNlUmVzcG9uc2VUaW1lb3V0ID8/IDMwMDtcbiAgICBjb25zdCByZXNwb25zZVRpbWVvdXRGYWN0b3IgPSBvcHRpb25zPy5yZXNwb25zZVRpbWVvdXRGYWN0b3IgPz8gMS41O1xuICAgIGNvbnN0IHJldHJpZXMgPSBvcHRpb25zPy5yZXRyaWVzID8/IDM7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCByZXRyaWVzOyBpKyspIHtcbiAgICAgICAgY29uc3QgZGVsYXkgPSBiYXNlRGVsYXkgKiBkZWxheUZhY3RvciAqKiBpO1xuICAgICAgICB5aWVsZCB7XG4gICAgICAgICAgICBkZWxheTogZGVsYXkgKyAoTWF0aC5yYW5kb20oKSAqIGRlbGF5KSAvIDQsIC8vIEFkZCBqaXR0ZXIgb2YgbWF4IDI1JSBvZiBkZWxheVxuICAgICAgICAgICAgcmVzcG9uc2VUaW1lb3V0OiBiYXNlUmVzcG9uc2VUaW1lb3V0ICogcmVzcG9uc2VUaW1lb3V0RmFjdG9yICoqIGksXG4gICAgICAgIH07XG4gICAgfVxufVxuXG5leHBvcnQgY2xhc3MgQ29ubmVjdGlvbkVycm9yIGV4dGVuZHMgRXJyb3Ige1xufVxuXG5leHBvcnQgY2xhc3MgR3JhcGhRbEVycm9yIGV4dGVuZHMgRXJyb3Ige1xuICAgIHN0YXRpYyBmcm9tUmVzdWx0V2l0aEVycm9yKHJlc3VsdDogR3JhcGhRbFJlc3VsdFdpdGhFcnJvcnMpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBHcmFwaFFsRXJyb3IoZXh0cmFjdEdyYXBoUWxFcnJvck1lc3NhZ2UocmVzdWx0KSk7XG4gICAgfVxufVxuXG5leHBvcnQgY2xhc3MgQXBwU3luY0NsaWVudENsb3NpbmdFcnJvciBleHRlbmRzIEVycm9yIHtcbn1cblxuZXhwb3J0IGNsYXNzIEtlZXBBbGl2ZUludGVydmFsTGFwc2VkRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG59XG5cbmV4cG9ydCBjbGFzcyBNaXNzaW5nQ3JlZGVudGlhbHNFcnJvciBleHRlbmRzIEVycm9yIHtcbn1cbiJdfQ==