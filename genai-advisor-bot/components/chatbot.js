import {getGraphqlApiDefinition, getCognitoUser, region} from "./config.js";
import {getIdToken} from "./cognito.js"
import {GraphQlClient} from "./graphql.js";


class ChatbotClient {
    constructor(config) {
        this.config = config;
        this.graphqlApiDefinition = null;
        this.idToken = null;
        this.gqlClient = null;
        this.initialized = false;
    }

    async initClient(handleQqlData) {
        this.graphqlApiDefinition = await getGraphqlApiDefinition();
        this.idToken = await getIdToken(await getCognitoUser());
        this.gqlClient = new GraphQlClient(
            region,
            this.graphqlApiDefinition.uris.REALTIME,
            this.graphqlApiDefinition.uris.GRAPHQL,
            this.graphqlApiDefinition.dns.GRAPHQL,
            this.idToken,
            handleQqlData
        );
        this.initialized = true;
    }

    async send(sessionId, text, config) {
        if (!this.initialized) {
            await this.initClient();
        }
        if (config) {
            await this.gqlClient.sendQuery(
                createRequest(text, sessionId, config.modelName, config.provider, config.workspaceId)
            );
        } else {
            await this.gqlClient.sendQuery(
                createRequest(text, sessionId, this.config.modelName, this.config.provider, this.config.workspaceId)
            );
        }
    }

    async subscribeChatbotReceiveMsg(sessionId, handleQqlData) {
        if (!this.initialized) {
            await this.initClient(handleQqlData);
        }

        const query = JSON.stringify({
            "query": `subscription MySubscription {
                              receiveMessages(sessionId: "${sessionId}") {
                                  data
                          }
                      }
                    `,
            "variables": {},
        });
        await this.gqlClient.subscribe(sessionId, query);
    }
}

function createRequest(text, sessionId, modelName, provider, workspaceId) {
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

export {ChatbotClient};
