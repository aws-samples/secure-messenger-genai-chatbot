import {getCognitoUser, getGraphqlApiDefinition, region} from "./config.mjs";
import {getIdToken} from "./cognito.mjs";
import {AppSyncClient} from "./appsync.js";


const graphqlApiDefinition = await getGraphqlApiDefinition();
const idToken = await getIdToken(await getCognitoUser());
const appSyncClient = new AppSyncClient({
    graphQlUrl: graphqlApiDefinition.uris.GRAPHQL,
    realtimeUrl: graphqlApiDefinition.uris.REALTIME,
    apiRegion: region,
});


export class ChatbotClient {
    constructor(config) {
        this.config = config;
    }

    async send(text, sessionId, config) {
        return sendMessage(
            text,
            sessionId,
            config === undefined ? this.config : config
        )
    }
}


function post(gqlQuery) {
    return appSyncClient.post(gqlQuery, idToken)
        .then((res) => {
            console.log("res.data = ", res.data);
        });
}


export async function listModels() {
    return post({
        query: `
          query MyQuery {
              listModels {
                  inputModalities
                  interface
                  name
                  outputModalities
                  provider
                  ragSupported
                  streaming
              }
            }
        `,
    });
}


export async function listRagEngines() {
    return post({
        query: `
            query MyQuery {
              listRagEngines {
                    enabled
                    id
                    name
              }
            }
        `,
    });
}


export async function listWorkspaces() {
    return post({
        query: `
            query MyQuery {
                listWorkspaces {
                    name
                }
            }
        `,
    });
}


export async function listKendraIndexes() {
    return post({
        query: `
            query MyQuery {
                listKendraIndexes {
                    external
                    id
                    name
                }
            }
        `,
    });
}


export async function* responseMessagesListener(sessionId) {
    const subscriptionRequest = appSyncClient.subscribeAsync({
        query: `
            subscription MySubscription {
                receiveMessages(sessionId: "${sessionId}") {
                    data
                }
            }
        `,
    }, idToken, sessionId);
    const subscription = await subscriptionRequest;
    for await (const msg of subscription) {
        yield msg.data;
    }
}


export async function sendMessage(text, sessionId, {modelName, provider, workspaceId}) {
    return post({
        query: `
            mutation MyMutation($data: String!) {
                sendQuery(data: $data)
            }
        `,
        variables: {
            data: JSON.stringify(
                createQueryData(text, sessionId, modelName, provider, workspaceId)
            ),
        },
    });
}


function createQueryData(text, sessionId, modelName, provider, workspaceId) {
    return {
        "action": "run",
        "modelInterface": "langchain",
        "data": {
            "mode": "chain",
            "text": text,
            "files": [],
            "modelName": modelName,
            "provider": provider,
            "sessionId": sessionId,
            "workspaceId": workspaceId,
            "modelKwargs": {
                "streaming": false, "maxTokens": 512, "temperature": 0.6, "topP": 0.9
            }
        }
    }
}
