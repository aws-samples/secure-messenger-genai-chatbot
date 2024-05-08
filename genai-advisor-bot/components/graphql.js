import {openWebsocket} from "./websocket.js";
import fetch from "node-fetch";

class GraphQlClient {
    constructor(wsUri, hostname, jwtToken) {
        this.wsUri = wsUri;
        this.hostname = hostname;
        this.jwtToken = jwtToken;
        this.websocket = null;
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

function handleData() {
    console.log("GraphQL - data received.");
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

async function runQuery() {
    fetch(graphqlApiDefinition.uris.GRAPHQL, {
        method: 'POST',
        body: JSON.stringify({
            query: `
                query MyQuery {
                    listWorkspaces {
                        name
                    }
                }
            `,
            variables: {},
        }),
        headers: {
            'content-type': 'application/json',
            'aws_appsync_region': region,
            'aws_appsync_authenticationType': "AMAZON_COGNITO_USER_POOLS",
            Authorization: idToken,
        }
    }).then(async (data) => {
        console.log(JSON.stringify(await data.json(), null, 4));
    });
}

export {GraphQlClient};
