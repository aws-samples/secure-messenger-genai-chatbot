import {openWebsocket} from "./websocket.mjs";
import fetch from "node-fetch";

class GraphQlClient {
    constructor(region, wsUri, gqlUri, hostname, jwtToken) {
        this.region = region;
        this.wsUri = wsUri;
        this.gqlUri = gqlUri;
        this.hostname = hostname;
        this.jwtToken = jwtToken;
    }

    async initWebsocket() {
        this.websocket = await openWebsocket(
            this.wsUri, this.hostname, this.jwtToken, dispatchMessage);
    }

    async initGraphqlSubscription() {
        await this.initWebsocket();
        this.websocket.send(JSON.stringify({
            type: "connection_init",
        }));
    }

    async subscribe(sessionId, query, handleQqlData) {
        if (handleQqlData) gqlMsgHandlers.data = handleQqlData;
        await this.initGraphqlSubscription();
        this.websocket.send(createSubscriptionRegistrationMsg(sessionId, query, this.hostname, this.jwtToken));
    }

    async sendQuery(query) {
        fetch(this.gqlUri, {
            method: 'POST',
            body: JSON.stringify(query),
            headers: {
                'content-type': 'application/json',
                'aws_appsync_region': this.region,
                'aws_appsync_authenticationType': "AMAZON_COGNITO_USER_POOLS",
                Authorization: this.jwtToken,
            }
        })
            .then((res) => {
                console.log("first resolve, res.json() = ", res.json());
            })
            .then((result) => console.log("second resolve, result = ", result));
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
}

function handleKa() {
    console.log("GraphQL - ka received.");
}

function handleStartAck() {
    console.log("GraphQL - start_ack received.");
}

function handleError(message) {
    console.log("GraphQL - error received.");
    console.error("error: ", JSON.stringify(message, null, 4));
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
