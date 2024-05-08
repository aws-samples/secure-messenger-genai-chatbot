import {getGraphqlApiDefinition, getCognitoUser} from "./config.js";
import {getIdToken} from "./cognito.js"
import {GraphQlClient} from "./graphql.js";


class ChatbotClient {
    constructor() {
        this.graphqlApiDefinition =  null;
        this.idToken =  null;
        this.gqlClient = null;
    }

    async initClient() {
        this.graphqlApiDefinition = await getGraphqlApiDefinition();
        this.idToken = await getIdToken(await getCognitoUser());
        this.gqlClient = new GraphQlClient(
            this.graphqlApiDefinition.uris.REALTIME,
            this.graphqlApiDefinition.dns.GRAPHQL,
            this.idToken,
        );
    }

    async subscribeChatbotReceiveMsg(sessionId) {
        await this.initClient();
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

export {ChatbotClient};
