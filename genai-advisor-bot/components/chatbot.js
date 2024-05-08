import {getGraphqlApiDefinition, getCognitoUser, region} from "./config.js";
import {getIdToken} from "./cognito.js"
import {GraphQlClient} from "./graphql.js";


class ChatbotClient {
    constructor() {
        this.graphqlApiDefinition = null;
        this.idToken = null;
        this.gqlClient = null;
        this.initialized = false;
    }

    async initClient() {
        this.graphqlApiDefinition = await getGraphqlApiDefinition();
        this.idToken = await getIdToken(await getCognitoUser());
        this.gqlClient = new GraphQlClient(
            region,
            this.graphqlApiDefinition.uris.REALTIME,
            this.graphqlApiDefinition.uris.GRAPHQL,
            this.graphqlApiDefinition.dns.GRAPHQL,
            this.idToken,
        );
        this.initialized = true;
    }

    async send(sessionId, text) {
        if (!this.initialized) {
            await this.initClient();
        }
        await this.gqlClient.sendQuery(
            createRequest(text, "anthropic.claude-v2", "bedrock", sessionId, "")
        );
    }

    async subscribeChatbotReceiveMsg(sessionId) {
        if (!this.initialized) {
            await this.initClient();
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

function createRequest(text, modelName, provider, sessionId, workspaceId) {
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
