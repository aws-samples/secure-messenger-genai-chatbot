import {openWebsocket} from "./websocket.mjs";
import fetch from "node-fetch";

class GraphQlClient {
    constructor(region, wsUri, gqlUri, hostname, jwtToken, handleQqlData) {
        this.region = region;
        this.wsUri = wsUri;
        this.gqlUri = gqlUri;
        this.hostname = hostname;
        this.jwtToken = jwtToken;
        this.websocket = null;
        if (handleQqlData) gqlMsgHandlers.data = handleQqlData;
    }

    async initWebsocket() {
        this.websocket = await openWebsocket(
            this.wsUri, this.hostname, this.jwtToken, dispatchMessage);
    }

    async initGraphqlConnection() {
        await this.initWebsocket();
        this.websocket.send(JSON.stringify({
            type: "connection_init",
        }));
    }

    async subscribe(sessionId, query) {
        await this.initGraphqlConnection();
        this.websocket.send(createSubscriptionRegistrationMsg(sessionId, query, this.hostname, this.jwtToken));
    }

    async sendQuery(request) {
        const requestStr = JSON.stringify(request);
        fetch(this.gqlUri, {
            method: 'POST',
            body: JSON.stringify({
                query: `
                    mutation MyMutation($data: String!) {
                        sendQuery(data: $data)
                    }
                `,
                variables: {
                    data: JSON.stringify(request),
                },
            }),
            headers: {
                'content-type': 'application/json',
                'aws_appsync_region': this.region,
                'aws_appsync_authenticationType': "AMAZON_COGNITO_USER_POOLS",
                Authorization: this.jwtToken,
            }
        }).then(async (data) => {
            console.log(JSON.stringify(await data.json(), null, 4));
        });
    }
}

const gqlMsgHandlers = {
    "connection_ack": handleConnectionAck,
    "data": handleData,
    "ka": handleKa,
    "start_ack": handleStartAck,
    "error": handleError,
}

function handleConnectionAck() {
    console.log("GraphQL - connection_ack received");
}

function handleData(data) {
    console.log("GraphQL - data received.");
    console.log("data: ", JSON.stringify(data, null, 4));
}

function handleKa() {
    console.log("GraphQL - ka received.");
}

function handleStartAck() {
    console.log("GraphQL - start_ack received.");
}

function handleError(message) {
    console.log("GraphQL - error received.");
    console.log("error: ", JSON.stringify(message, null, 4));
}

function handleUnknownMessage(message) {
    console.log("GraphQL - unknown message type received.");
    console.log("message type: ", message.type);
}

function dispatchMessage(message) {
    const handler = gqlMsgHandlers[message.type] || handleUnknownMessage;
    handler(message);
}

function createSubscriptionRegistrationMsg(sessionId, query, hostname, jwtToken) {
    return JSON.stringify({
        id: sessionId,
        payload: {
            data: query,
            extensions: {
                authorization: {
                    host: hostname,
                    Authorization: jwtToken,
                }
            }
        },
        type: "start"
    });
}

export {GraphQlClient};
