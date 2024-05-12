import {getGraphqlApiDefinition, getCognitoUser, region} from "./config.mjs";
import {getIdToken} from "./cognito.mjs"
import {GraphQlClient} from "./graphql.mjs";


export default class ChatbotClient {
    constructor(config) {
        this.config = config;
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

    async send(sessionId, text, config) {
        if (!this.initialized) {
            await this.initClient();
        }
        if (config) {
            await this.gqlClient.sendQuery(
                createMessageSendQuery(text, sessionId, config.modelName, config.provider, config.workspaceId)
            );
        } else {
            await this.gqlClient.sendQuery(
                createMessageSendQuery(text, sessionId, this.config.modelName, this.config.provider, this.config.workspaceId)
            );
        }
    }

    async subscribeChatbotReceiveMsg(sessionId, handleQqlData) {
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
        await this.gqlClient.subscribe(sessionId, query, handleQqlData);
    }
}


function createMessageSendQuery(text, sessionId, modelName, provider, workspaceId) {
    return {
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
