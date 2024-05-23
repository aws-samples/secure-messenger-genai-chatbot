import {describe, it, expect, jest} from '@jest/globals';


describe("Cognito user authentication - invalid credentials", () => {

    it("attempts to authenticate with invalid credentials", async () => {
        const mockConfigModule = jest.requireActual("../components/config.js");
        const mockGetCognitoUser = jest.fn().mockReturnValue({
            userPoolWebClientId: "invalidPoolId",
            user: "invalidUserId",
            password: "invalidPassword"
        })
        jest.mock("../components/config.js", () => {
            return {
                ...mockConfigModule,
                getCognitoUser: mockGetCognitoUser,
            };
        });
        const {ChatbotClient} = require("../components/chatbot-graphql-api.js");
        try {
            const chatbotClient = await new ChatbotClient({
                modelName: "anthropic.claude-v2",
                provider: "bedrock",
                workspaceId: "",
            }).ready();
            expect(chatbotClient).toBeUndefined();
        } catch (error) {
            expect(error.name).toEqual("ResourceNotFoundException");
        }
    });

});
