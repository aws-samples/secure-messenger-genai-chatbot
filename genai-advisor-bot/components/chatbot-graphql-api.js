const {getCognitoUser, getGraphqlApiDefinition, region} = require("./config.js");
const {getIdToken} = require("./cognito.js");
const {AppSyncClient} = require("./appsync.js");


class ChatbotClient {
    constructor(config) {
        this.config = config;
        this.appSyncClient = null;
        this.initPromise = this.initialize();
    }

    async initialize() {
        const definition = await getGraphqlApiDefinition();
        this.appSyncClient = new AppSyncClient({
            graphQlUrl: definition.uris.GRAPHQL,
            realtimeUrl: definition.uris.REALTIME,
            apiRegion: region,
        });
        this.idToken = await getIdToken(await getCognitoUser());
    }

    async ready() {
        await this.initPromise;
        return this;
    }

    async send(text, sessionId, config) {
        return await this.sendMessage(
            text,
            sessionId,
            config === undefined ? this.config : config
        );
    }

    post(gqlQuery) {
        return this.appSyncClient.post(gqlQuery, this.idToken)
    }


    listModels() {
        return this.post({
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

    listWorkspaces() {
        return this.post({
            query: `
            query MyQuery {
                listWorkspaces {
                    id
                    name
                }
            }
        `,
        });
    }

    async* responseMessagesListener(sessionId) {
        const subscriptionRequest = this.appSyncClient.subscribeAsync({
            query: `
            subscription MySubscription {
                receiveMessages(sessionId: "${sessionId}") {
                    data
                }
            }
        `,
        }, this.idToken, sessionId);
        const subscription = await subscriptionRequest;
        for await (const msg of subscription) {
            yield msg.data;
        }
    }

    sendMessage(text, sessionId, {modelName, provider, workspaceId}) {
        return this.post({
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


module.exports = {
    ChatbotClient
};
