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
        if (requestOptions === null || requestOptions === void 0 ? void 0 : requestOptions.responseTimeout) {
            responseTimeout = setTimeout(() => done(new ResponseTimeoutError(uri, `Response time-out (after ${requestOptions.responseTimeout} ms.)`)), requestOptions.responseTimeout);
        }
        function done(error) {
            var _a;
            if (responseTimeout)
                clearTimeout(responseTimeout);
            if (!error)
                return;
            (_a = req.socket) === null || _a === void 0 ? void 0 : _a.emit("agentRemove");
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
    var _a, _b;
    if (res.statusCode == 429) {
        throw new FetchError(uri, "Too many requests");
    }
    else if (res.statusCode !== 200) {
        throw new NonRetryableFetchError(uri, `Status code is ${res.statusCode}, expected 200`);
    }
    const match = (_a = res.headers["content-type"]) === null || _a === void 0 ? void 0 : _a.match(/^(?<contentType>application\/json)\s*(;(\s*)charset=(?<charSet>.+))?/i);
    if (((_b = match === null || match === void 0 ? void 0 : match.groups) === null || _b === void 0 ? void 0 : _b.contentType) !== "application/json") {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaHR0cHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJodHRwcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsbUZBQW1GO0FBQ25GLEVBQUU7QUFDRixrRUFBa0U7QUFDbEUsbUVBQW1FO0FBQ25FLDBDQUEwQztBQUMxQyxFQUFFO0FBQ0YsaURBQWlEO0FBQ2pELEVBQUU7QUFDRixzRUFBc0U7QUFDdEUsb0VBQW9FO0FBQ3BFLDJFQUEyRTtBQUMzRSxzRUFBc0U7QUFDdEUsaUNBQWlDOzs7QUFFakMsaUNBQWdEO0FBQ2hELCtCQUErRTtBQUMvRSxtQ0FBNEM7QUFNNUM7Ozs7O0dBS0c7QUFDSSxLQUFLLFVBQVUsU0FBUyxDQUM3QixHQUFXLEVBQ1gsY0FBb0MsRUFDcEMsSUFBYTtJQUViLElBQUksZUFBK0IsQ0FBQztJQUNwQyxPQUFPLElBQUksT0FBTyxDQUFhLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFO1FBQ2pELE1BQU0sRUFBRSxHQUFHLEdBQUcsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLGVBQVksQ0FBQyxDQUFDLENBQUMsY0FBVyxDQUFDO1FBQ2hFLE1BQU0sR0FBRyxHQUFHLEVBQUUsQ0FDWixHQUFHLEVBQ0g7WUFDRSxNQUFNLEVBQUUsS0FBSztZQUNiLEdBQUcsY0FBYztTQUNsQixFQUNELENBQUMsR0FBRyxFQUFFLEVBQUU7WUFDTixJQUFJLGtCQUFrQixHQUFHLENBQUMsR0FBVyxFQUFFLEVBQUUsQ0FDdkMsT0FBTyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUN0QyxJQUFJLENBQUM7Z0JBQ0gsb0NBQW9DO2dCQUNwQyxhQUFhLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1lBQzFCLENBQUM7WUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO2dCQUNiLGtCQUFrQixHQUFHLENBQUMsR0FBVyxFQUFFLEVBQUU7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QUFDLENBQUM7WUFDckIsQ0FBQztRQUNILENBQUM7UUFDRCxLQUFLLEVBQUUsQ0FBQyxJQUFJLEVBQUUsRUFBRTtZQUNkLElBQUksQ0FBQztnQkFDSCxRQUFRLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO2dCQUNoQyxJQUFJLEVBQUUsQ0FBQztZQUNULENBQUM7WUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO2dCQUNiLElBQUksQ0FBQyxHQUFZLENBQUMsQ0FBQztZQUNyQixDQUFDO1FBQ0gsQ0FBQztLQUNGLENBQUMsQ0FBQztBQUNMLENBQUMsQ0FBQztBQUVGLE1BQWEsVUFBVyxTQUFRLEtBQUs7SUFDbkMsWUFBWSxHQUFXLEVBQUUsR0FBUTtRQUMvQixLQUFLLENBQUMsbUJBQW1CLEdBQUcsS0FBSyxHQUFHLEVBQUUsQ0FBQyxDQUFDO0lBQzFDLENBQUM7Q0FDRjtBQUpELGdDQUlDO0FBRUQsTUFBYSxzQkFBdUIsU0FBUSxVQUFVO0NBQUc7QUFBekQsd0RBQXlEO0FBRXpELE1BQWEsb0JBQXFCLFNBQVEsVUFBVTtDQUFHO0FBQXZELG9EQUF1RCIsInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCAyMDIxIEFtYXpvbiBXZWIgU2VydmljZXMsIEluYy4gb3IgaXRzIGFmZmlsaWF0ZXMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4vL1xuLy8gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbi8vIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbi8vIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuLy9cbi8vICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbi8vXG4vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4vLyBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbi8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbi8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuXG5pbXBvcnQgeyByZXF1ZXN0IGFzIGh0dHBzUmVxdWVzdCB9IGZyb20gXCJodHRwc1wiO1xuaW1wb3J0IHsgcmVxdWVzdCBhcyBodHRwUmVxdWVzdCwgSW5jb21pbmdNZXNzYWdlLCBSZXF1ZXN0T3B0aW9ucyB9IGZyb20gXCJodHRwXCI7XG5pbXBvcnQgeyBXcml0YWJsZSwgcGlwZWxpbmUgfSBmcm9tIFwic3RyZWFtXCI7XG5cbnR5cGUgRmV0Y2hSZXF1ZXN0T3B0aW9ucyA9IFJlcXVlc3RPcHRpb25zICYge1xuICByZXNwb25zZVRpbWVvdXQ/OiBudW1iZXI7XG59O1xuXG4vKipcbiAqIEV4ZWN1dGUgYSBIVFRQUyByZXF1ZXN0XG4gKiBAcGFyYW0gdXJpIC0gVGhlIFVSSVxuICogQHBhcmFtIHJlcXVlc3RPcHRpb25zIC0gVGhlIFJlcXVlc3RPcHRpb25zIHRvIHVzZVxuICogQHBhcmFtIGRhdGEgLSBEYXRhIHRvIHNlbmQgdG8gdGhlIFVSSSAoZS5nLiBQT1NUIGRhdGEpXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBmZXRjaEpzb248UmVzdWx0VHlwZSA9IHt9PihcbiAgdXJpOiBzdHJpbmcsXG4gIHJlcXVlc3RPcHRpb25zPzogRmV0Y2hSZXF1ZXN0T3B0aW9ucyxcbiAgZGF0YT86IEJ1ZmZlclxuKSB7XG4gIGxldCByZXNwb25zZVRpbWVvdXQ6IE5vZGVKUy5UaW1lb3V0O1xuICByZXR1cm4gbmV3IFByb21pc2U8UmVzdWx0VHlwZT4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNvbnN0IGZuID0gdXJpLnN0YXJ0c1dpdGgoXCJodHRwc1wiKSA/IGh0dHBzUmVxdWVzdCA6IGh0dHBSZXF1ZXN0O1xuICAgIGNvbnN0IHJlcSA9IGZuKFxuICAgICAgdXJpLFxuICAgICAge1xuICAgICAgICBtZXRob2Q6IFwiR0VUXCIsXG4gICAgICAgIC4uLnJlcXVlc3RPcHRpb25zLFxuICAgICAgfSxcbiAgICAgIChyZXMpID0+IHtcbiAgICAgICAgbGV0IGhhbmRsZVJlc3BvbnNlQm9keSA9IChidWY6IEJ1ZmZlcikgPT5cbiAgICAgICAgICByZXNvbHZlKEpTT04ucGFyc2UoYnVmLnRvU3RyaW5nKCkpKTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAvLyBDaGVjayByZXNwb25zZSBzdGF0dXMgYW5kIGhlYWRlcnNcbiAgICAgICAgICBjaGVja1Jlc3BvbnNlKHJlcywgdXJpKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgaGFuZGxlUmVzcG9uc2VCb2R5ID0gKGJ1ZjogQnVmZmVyKSA9PiB7XG4gICAgICAgICAgICAoZXJyIGFzIEVycm9yKS5tZXNzYWdlICs9IGAgJHtKU09OLnN0cmluZ2lmeShcbiAgICAgICAgICAgICAgYnVmLnRvU3RyaW5nKCkucmVwbGFjZSgvXFxzKy9nLCBcIiBcIilcbiAgICAgICAgICAgICl9YDtcbiAgICAgICAgICAgIGRvbmUoZXJyIGFzIEVycm9yKTtcbiAgICAgICAgICB9O1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2FwdHVyZSByZXNwb25zZSBkYXRhXG4gICAgICAgIHBpcGVsaW5lKFtyZXMsIGNvbGxlY3RCdWZmZXIoaGFuZGxlUmVzcG9uc2VCb2R5KV0sIGRvbmUpO1xuICAgICAgfVxuICAgICk7XG5cbiAgICBpZiAocmVxdWVzdE9wdGlvbnM/LnJlc3BvbnNlVGltZW91dCkge1xuICAgICAgcmVzcG9uc2VUaW1lb3V0ID0gc2V0VGltZW91dChcbiAgICAgICAgKCkgPT5cbiAgICAgICAgICBkb25lKFxuICAgICAgICAgICAgbmV3IFJlc3BvbnNlVGltZW91dEVycm9yKFxuICAgICAgICAgICAgICB1cmksXG4gICAgICAgICAgICAgIGBSZXNwb25zZSB0aW1lLW91dCAoYWZ0ZXIgJHtyZXF1ZXN0T3B0aW9ucy5yZXNwb25zZVRpbWVvdXR9IG1zLilgXG4gICAgICAgICAgICApXG4gICAgICAgICAgKSxcbiAgICAgICAgcmVxdWVzdE9wdGlvbnMucmVzcG9uc2VUaW1lb3V0XG4gICAgICApO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGRvbmUoZXJyb3I/OiBFcnJvciB8IG51bGwpIHtcbiAgICAgIGlmIChyZXNwb25zZVRpbWVvdXQpIGNsZWFyVGltZW91dChyZXNwb25zZVRpbWVvdXQpO1xuICAgICAgaWYgKCFlcnJvcikgcmV0dXJuO1xuICAgICAgcmVxLnNvY2tldD8uZW1pdChcImFnZW50UmVtb3ZlXCIpO1xuICAgICAgcmVxLmRlc3Ryb3koZXJyb3IpO1xuICAgICAgcmVqZWN0KGVycm9yKTtcbiAgICB9XG5cbiAgICAvLyBIYW5kbGUgZXJyb3JzIHdoaWxlIHNlbmRpbmcgcmVxdWVzdFxuICAgIHJlcS5vbihcImVycm9yXCIsIGRvbmUpO1xuXG4gICAgLy8gU2lnbmFsIGVuZCBvZiByZXF1ZXN0IChpbmNsdWRlIG9wdGlvbmFsIGRhdGEpXG4gICAgcmVxLmVuZChkYXRhKTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGNoZWNrUmVzcG9uc2UocmVzOiBJbmNvbWluZ01lc3NhZ2UsIHVyaTogc3RyaW5nKSB7XG4gIGlmIChyZXMuc3RhdHVzQ29kZSA9PSA0MjkpIHtcbiAgICB0aHJvdyBuZXcgRmV0Y2hFcnJvcih1cmksIFwiVG9vIG1hbnkgcmVxdWVzdHNcIik7XG4gIH0gZWxzZSBpZiAocmVzLnN0YXR1c0NvZGUgIT09IDIwMCkge1xuICAgIHRocm93IG5ldyBOb25SZXRyeWFibGVGZXRjaEVycm9yKFxuICAgICAgdXJpLFxuICAgICAgYFN0YXR1cyBjb2RlIGlzICR7cmVzLnN0YXR1c0NvZGV9LCBleHBlY3RlZCAyMDBgXG4gICAgKTtcbiAgfVxuICBjb25zdCBtYXRjaCA9IHJlcy5oZWFkZXJzW1wiY29udGVudC10eXBlXCJdPy5tYXRjaChcbiAgICAvXig/PGNvbnRlbnRUeXBlPmFwcGxpY2F0aW9uXFwvanNvbilcXHMqKDsoXFxzKiljaGFyc2V0PSg/PGNoYXJTZXQ+LispKT8vaVxuICApO1xuICBpZiAobWF0Y2g/Lmdyb3Vwcz8uY29udGVudFR5cGUgIT09IFwiYXBwbGljYXRpb24vanNvblwiKSB7XG4gICAgdGhyb3cgbmV3IE5vblJldHJ5YWJsZUZldGNoRXJyb3IoXG4gICAgICB1cmksXG4gICAgICBgQ29udGVudC10eXBlIGlzIFwiJHtyZXMuaGVhZGVyc1tcImNvbnRlbnQtdHlwZVwiXX1cIiwgZXhwZWN0ZWQgXCJhcHBsaWNhdGlvbi9qc29uXCJgXG4gICAgKTtcbiAgfVxufVxuXG4vKipcbiAqIEN1c3RvbSBOb2RlSlMgd3JpdGVhYmxlIHN0cmVhbSB0aGF0IGNvbGxlY3RzIGNodW5rcyB3cml0dGVuIHRvIGl0IGluIG1lbW9yeSxcbiAqIGFuZCBpbnZva2VzIHRoZSBzdXBwbGllZCBjYWxsYmFjayB3aXRoIHRoZSBjb25jYXRlbmF0ZWQgY2h1bmtzIHVwb24gZmluYWxpemF0aW9uLlxuICpcbiAqIEBwYXJhbSBjYWxsYmFjayAtIFRoZSBjYWxsYmFjayB0byBpbnZva2UgdXBvbiBmaW5hbGl6YXRpb25cbiAqL1xuY29uc3QgY29sbGVjdEJ1ZmZlciA9IChjYWxsYmFjazogKGNvbGxlY3RlZEJ1ZmZlcjogQnVmZmVyKSA9PiB2b2lkKSA9PiB7XG4gIGNvbnN0IGNodW5rcyA9IFtdIGFzIEJ1ZmZlcltdO1xuICByZXR1cm4gbmV3IFdyaXRhYmxlKHtcbiAgICB3cml0ZTogKGNodW5rLCBfZW5jb2RpbmcsIGRvbmUpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNodW5rcy5wdXNoKGNodW5rKTtcbiAgICAgICAgZG9uZSgpO1xuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGRvbmUoZXJyIGFzIEVycm9yKTtcbiAgICAgIH1cbiAgICB9LFxuICAgIGZpbmFsOiAoZG9uZSkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY2FsbGJhY2soQnVmZmVyLmNvbmNhdChjaHVua3MpKTtcbiAgICAgICAgZG9uZSgpO1xuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGRvbmUoZXJyIGFzIEVycm9yKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcbn07XG5cbmV4cG9ydCBjbGFzcyBGZXRjaEVycm9yIGV4dGVuZHMgRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih1cmk6IHN0cmluZywgbXNnOiBhbnkpIHtcbiAgICBzdXBlcihgRmFpbGVkIHRvIGZldGNoICR7dXJpfTogJHttc2d9YCk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIE5vblJldHJ5YWJsZUZldGNoRXJyb3IgZXh0ZW5kcyBGZXRjaEVycm9yIHt9XG5cbmV4cG9ydCBjbGFzcyBSZXNwb25zZVRpbWVvdXRFcnJvciBleHRlbmRzIEZldGNoRXJyb3Ige31cbiJdfQ==