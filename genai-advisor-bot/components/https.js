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
exports.ResponseTimeoutError = exports.NonRetryableFetchError = exports.FetchError = exports.fetchJson = void 0;
const https_1 = require("https");
const http_1 = require("http");
const stream_1 = require("stream");
/**
 * Execute a HTTPS request
 * @param uri - The URI
 * @param requestOptions - The RequestOptions to use
 * @param data - Data to send to the URI (e.g. POST data)
 */
async function fetchJson(uri, requestOptions, data) {
    let responseTimeout;
    return new Promise((resolve, reject) => {
        const fn = uri.startsWith("https") ? https_1.request : http_1.request;
        const req = fn(uri, {
            method: "GET",
            ...requestOptions,
        }, (res) => {
            let handleResponseBody = (buf) => resolve(JSON.parse(buf.toString()));
            try {
                // Check response status and headers
                checkResponse(res, uri);
            }
            catch (err) {
                handleResponseBody = (buf) => {
                    err.message += ` ${JSON.stringify(buf.toString().replace(/\s+/g, " "))}`;
                    done(err);
                };
            }
            // Capture response data
            (0, stream_1.pipeline)([res, collectBuffer(handleResponseBody)], done);
        });
        if (requestOptions?.responseTimeout) {
            responseTimeout = setTimeout(() => done(new ResponseTimeoutError(uri, `Response time-out (after ${requestOptions.responseTimeout} ms.)`)), requestOptions.responseTimeout);
        }
        function done(error) {
            if (responseTimeout)
                clearTimeout(responseTimeout);
            if (!error)
                return;
            req.socket?.emit("agentRemove");
            req.destroy(error);
            reject(error);
        }
        // Handle errors while sending request
        req.on("error", done);
        // Signal end of request (include optional data)
        req.end(data);
    });
}
exports.fetchJson = fetchJson;
function checkResponse(res, uri) {
    if (res.statusCode == 429) {
        throw new FetchError(uri, "Too many requests");
    }
    else if (res.statusCode !== 200) {
        throw new NonRetryableFetchError(uri, `Status code is ${res.statusCode}, expected 200`);
    }
    const match = res.headers["content-type"]?.match(/^(?<contentType>application\/json)\s*(;(\s*)charset=(?<charSet>.+))?/i);
    if (match?.groups?.contentType !== "application/json") {
        throw new NonRetryableFetchError(uri, `Content-type is "${res.headers["content-type"]}", expected "application/json"`);
    }
}
/**
 * Custom NodeJS writeable stream that collects chunks written to it in memory,
 * and invokes the supplied callback with the concatenated chunks upon finalization.
 *
 * @param callback - The callback to invoke upon finalization
 */
const collectBuffer = (callback) => {
    const chunks = [];
    return new stream_1.Writable({
        write: (chunk, _encoding, done) => {
            try {
                chunks.push(chunk);
                done();
            }
            catch (err) {
                done(err);
            }
        },
        final: (done) => {
            try {
                callback(Buffer.concat(chunks));
                done();
            }
            catch (err) {
                done(err);
            }
        },
    });
};
class FetchError extends Error {
    constructor(uri, msg) {
        super(`Failed to fetch ${uri}: ${msg}`);
    }
}
exports.FetchError = FetchError;
class NonRetryableFetchError extends FetchError {
}
exports.NonRetryableFetchError = NonRetryableFetchError;
class ResponseTimeoutError extends FetchError {
}
exports.ResponseTimeoutError = ResponseTimeoutError;
