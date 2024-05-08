import WebSocket from "ws";


function encodeObjBase64(obj) {
    return Buffer.from(JSON.stringify(obj)).toString('base64');
}

async function openWebsocket(wsUri, hostname, jwtToken, dispatchMessage) {
    return new Promise((resolve, reject) => {
        const base64EncodedHeader = encodeObjBase64({
            host: hostname,
            Authorization: jwtToken,
        });
        const base64EncodedPayload = encodeObjBase64({});
        const connectionUrl = wsUri + "?header=" + base64EncodedHeader + "&payload=" + base64EncodedPayload;
        const webSocket = new WebSocket(
            connectionUrl, "graphql-ws"
        );
        webSocket.onopen = (event) => {
            console.log("Websocket - socket is open.");
            resolve(webSocket);
        };
        webSocket.onerror = (error) => {
            console.log("Websocket - error");
            console.log("error: ", JSON.stringify(error, null, 4));
            reject(error);
        };
        webSocket.onclose = (event) => {
            console.log("Websocket - socket closed.");
        };
        webSocket.onmessage = (event) => {
            console.log("Websocket - message received.");
            dispatchMessage(JSON.parse(event.data));
        };
    });
}

export {openWebsocket};
