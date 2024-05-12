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
    graphqlUri;
    realtimeUri;
    region;
    signer;
    ws;
    connected;
    failedToConnect;
    connecting;
    connectionTimeoutMs;
    scheduledKeepAliveCheck;
    lastSubscriptionId = 0;
    establishedSubscriptionIds = new Set();
    subscribeAsync = (0, util_1.promisify)(this.subscribe);
    subscriptionCallbacks = {};
    keepAliveAgent;
    constructor(props) {
        this.graphqlUri = new url_1.URL(props.graphQlUrl);
        this.region = props.apiRegion ?? this.graphqlUri.hostname.split(".")[2];
        this.realtimeUri = new url_1.URL(props.realtimeUrl ??
            `wss://${this.graphqlUri.hostname.split(".")[0]}.appsync-realtime-api.${this.region}.amazonaws.com/graphql`);
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
            catch {
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
        const graphql = JSON.stringify({
            query: props.query,
            variables: props.variables ?? {},
        });
        // eslint-disable-next-line no-constant-condition
        const responseTimeout = props.options?.responseTimeout ?? 3000;
        function* attempts() {
            yield { responseTimeout }; // 1st attempt
            yield* props.options?.retryStrategy ??
                generateRetryStrategy({
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
                return await this._post(graphql, attempt.responseTimeout ?? responseTimeout, jwtToken ?? undefined);
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
            .then(() => subscriptionReadyCallback?.(null, readable))
            .catch((err) => {
            readable.destroy();
            subscriptionReadyCallback?.(err, null);
        });
        return readable;
    }
    async appSyncSubscribe(props) {
        const subscriptionEstablishedTimeout = props.subscriptionEstablishedTimeout ?? 5000;
        const ws = await this.connect();
        const graphql = JSON.stringify({
            query: props.query,
            variables: props.variables ?? {},
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
    const baseDelay = options?.baseDelay ?? 50;
    const delayFactor = options?.delayFactor ?? 2;
    const baseResponseTimeout = options?.baseResponseTimeout ?? 300;
    const responseTimeoutFactor = options?.responseTimeoutFactor ?? 1.5;
    const retries = options?.retries ?? 3;
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
