import {describe, it, expect, jest, beforeEach} from '@jest/globals';


describe("communication with LLM chatbot", () => {

    let chatbotClient;
    let uuidv4;

    beforeEach(async () => {
        const {v4: uuidv4Import} = require('uuid');
        uuidv4 = uuidv4Import;
        const {ChatbotClient} = require("../components/chatbot-graphql-api.js");
        chatbotClient = await new ChatbotClient({
            modelName: "anthropic.claude-v2",
            provider: "bedrock",
            workspaceId: "",
        }).ready();
    });

    it("sends a message and waits for a response", async () => {
        const sessionId = uuidv4();
        const myModule = {
            async returnMessageHandler(messageIterator) {
                const message = await messageIterator.next();
                const data = JSON.parse(message.value.receiveMessages.data);
                expect(data.data.sessionId).toEqual(sessionId);
                expect(data.data.content).toContain("Berlin");
                expect(data.data.content).toContain("Germany");
                expect(data.data.content).toContain("capital");
            }
        };

        const returnMessageHandlerSpy = jest.spyOn(myModule, 'returnMessageHandler');
        const responseHandlerPromise = myModule.returnMessageHandler(
            chatbotClient.responseMessagesListener(sessionId)
        );
        const resp = await chatbotClient.send("Where is Berlin?", sessionId);
        expect(resp).toHaveProperty("data");
        expect(resp.data).toEqual({sendQuery: expect.any(String)});
        expect(resp.data.sendQuery).toContain("HTTPStatusCode=200");
        await responseHandlerPromise;
    }, 20_000);

    it("sends a message with a different configuration", async () => {
        const model = "amazon.titan-text-express-v1";
        const sessionId = uuidv4();
        const myModule = {
            async returnMessageHandler(messageIterator) {
                const message = await messageIterator.next();
                const data = JSON.parse(message.value.receiveMessages.data);
                expect(data.data.sessionId).toEqual(sessionId);
                expect(data.data.content).toContain("United Arab Emirates");
                expect(data.data.content).toContain("Abu Dhabi");
                expect(data.data.content).toContain("capital");
            }
        };
        const returnMessageHandlerSpy = jest.spyOn(myModule, "returnMessageHandler");
        const responseHandlerPromise = myModule.returnMessageHandler(
            chatbotClient.responseMessagesListener(sessionId)
        );
        const resp = await chatbotClient.send(
            "Where is Abu Dhabi?",
            sessionId,
            {
                modelName: model,
                provider: "bedrock",
                workspaceId: "",
            }
        );
        expect(resp).toHaveProperty("data");
        expect(resp.data).toEqual({sendQuery: expect.any(String)});
        expect(resp.data.sendQuery).toContain("HTTPStatusCode=200");
        await responseHandlerPromise;
    }, 20_000);

});
