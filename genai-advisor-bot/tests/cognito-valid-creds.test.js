import {describe, it, expect} from '@jest/globals';


describe("Cognito user authentication - valid credentials", () => {

    it("authenticates with valid credentials", async () => {
        const ChatbotClient = require("../components/chatbot-graphql-api.js").ChatbotClient;
        const chatbotClient = await new ChatbotClient({
            modelName: "anthropic.claude-v2",
            provider: "bedrock",
            workspaceId: "",
        }).ready();
        expect(chatbotClient.idToken).toEqual(expect.any(String));
        const jwtHeader = JSON.parse(atob(chatbotClient.idToken.split(".")[0]));
        const jwtPayload = JSON.parse(atob(chatbotClient.idToken.split(".")[1]));
        const jwtSignature = chatbotClient.idToken.split(".")[2];
        expect(jwtHeader).toEqual({
            kid: expect.any(String),
            alg: expect.any(String)
        });
        expect(jwtPayload).toMatchObject({
            iss: expect.any(String),
            exp: expect.any(Number),
            sub: expect.any(String),
            aud: expect.any(String)
        });
        expect(jwtSignature).toEqual(expect.any(String));
    });

});
