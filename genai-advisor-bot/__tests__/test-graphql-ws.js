import {createClient} from "graphql-ws";
import WebSocket from "ws";

function encodeObjBase64(obj) {
    return Buffer.from(JSON.stringify(obj)).toString('base64');
}

function createClientWithCustomHeader(wsUri, hostname, jwtToken) {
    let graphqlSocket;
    return createClient({
        url: wsUri,
        webSocketImpl: class extends WebSocket {
            constructor(url, protocols) {
                const base64EncodedHeader = encodeObjBase64({
                    host: hostname,
                    Authorization: jwtToken,
                });
                const base64EncodedPayload = encodeObjBase64({});
                const connectionUrl = wsUri + "?header=" + base64EncodedHeader + "&payload=" + base64EncodedPayload;
                super(connectionUrl, "graphql-ws");
            }
        },
        lazy: false,
        // onNonLazyError: (errorOrCloseEvent) => {
        //     console.log("onNonLazyError() - errorOrCloseEvent = ", errorOrCloseEvent);
        // },
        jsonMessageReviver: (key, value) => {
            console.log("jsonMessageReviver() - key = ", key);
            console.log("jsonMessageReviver() - value = ", value);
            if (value === "ka") {
                return "ping";
            }
            return value;
        },
        jsonMessageReplacer: (key, value) => {
            console.log("jsonMessageReplacer() - key = ", key);
            console.log("jsonMessageReplacer() - value = ", value);
            if (value === "ping" || value === "pong") {
                return "ka";
            }
            return value;
        },
        on: {
            connecting: (isRetry) => {
                console.log("on connecting, isRetry = ", isRetry);
            },
            connected: (socket, payload, wasRetry) => {
                graphqlSocket = socket;
                console.log("on connected");
                console.log("socket = ", socket._protocol);
                console.log("payload = ", payload);
                console.log("wasRetry = ", wasRetry);
            },
            closed: (event) => {
                console.log("on closed, event = ", event);
            },
            error: (error) => {
                console.log("on error, error = ", error);
            },
            message: (message) => {
                console.log("on message, message = ", message);
            },
            opened: (socket) => {
                console.log("on opened, socket._protocol = ", socket._protocol);
            },
            ping: (received, payload) => {
                console.log("on ping");
                console.log("received = ", received);
                console.log("payload = ", payload);
                // graphqlSocket.send("pong")
                // socket.pong();
            },
            pong: (received, payload) => {
                console.log("on pong");
                console.log("received = ", received);
                console.log("payload = ", payload);
            }
        }
    });
}

async function test_graphqlWs(wsUri, hostname, jwtToken) {
    const graphqlWsClient = createClientWithCustomHeader(wsUri, hostname, jwtToken);

    const subscriptionQuery = `
        subscription MySubscription {
            receiveMessages(sessionId: "0871ef0b-e48a-44eb-a394-04173d62689b") {
                data
                sessionId
                userId
            }
        }
    `;
    graphqlWsClient.subscribe({
        query: subscriptionQuery,
    }, (event) => {
        console.log(even)
    });

    const subscription = graphqlWsClient.iterate({
        query: subscriptionQuery,
    });

    for await (const event of subscription) {
        console.log(event);
        break;
    }

    // const observable = graphqlWsClient.subscribe({query: subscriptionQuery}, {
    //     // Optionally, you can provide headers or other options here
    // });
    //
    // observable.subscribe({
    //     next: (data) => {
    //         console.log('Received data:', data);
    //     },
    //     error: (error) => {
    //         console.error('Error occurred:', error);
    //     },
    //     complete: () => {
    //         console.log('Subscription completed');
    //     },
    // });
    //
    // console.log("observable: ", observable);

    // (async () => {
    //     const subscription = graphqlWsClient.iterate({
    //         query: 'subscription { greetings }',
    //     });
    //     for await (const event of subscription) {
    //         console.log(event);
    //         break;
    //     }
    // })().catch(error => console.log(error));
}

export {test_graphqlWs};
