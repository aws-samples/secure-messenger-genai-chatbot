import {describe, it, expect, jest, beforeEach} from '@jest/globals';

const {v4: uuidv4} = require('uuid');
import {ChatbotClient} from '../components/chatbot-graphql-api.js';
import {CommandInterpreter} from '../components/commands.js';


describe("communication with LLM chatbot", () => {

    let chatbotClient;

    beforeEach(async () => {
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
    }, 15_000);

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


describe("bot commands", () => {

    let commands;

    beforeEach(async () => {
        commands = new CommandInterpreter(
            await new ChatbotClient({
                modelName: "anthropic.claude-v2",
                provider: "bedrock",
                workspaceId: "",
            }).ready()
        );
    });

    it("checks the command interpreter has been initialized", () => {
        expect(commands).toHaveProperty("chatbotClient");
        expect(commands.chatbotClient.config).toEqual({
            modelName: "anthropic.claude-v2",
            provider: "bedrock",
            workspaceId: "",
        });
        expect(commands.chatbotClient.appSyncClient).toBeDefined();
    }, 10_000);

    it("creates the menu for selecting the model", async () => {
        const testCmd = "/list-models  ";
        const resp = await commands.processCommand(testCmd);
        expect(resp).toHaveProperty("message");
        expect(resp.message).toEqual(" ");
        expect(resp).toHaveProperty("metaMessage");
        const metaMessage = JSON.parse(resp.metaMessage);
        expect(metaMessage).toHaveProperty("table");
        expect(metaMessage.table).toEqual({
            firstcolname: expect.any(String),
            actioncolname: expect.any(String),
            name: expect.any(String),
            rows: expect.any(Array),
        });
        metaMessage.table.rows.forEach((item) => {
            expect(item).toHaveProperty("firstcolvalue");
            expect(item).toHaveProperty("response");
            expect(item.firstcolvalue).not.toEqual("");
            expect(item.response).not.toEqual("");
        });
    }, 10_000);

    it("selects a valid large language model", async () => {
        const testCmd = "/select-model 0";
        expect(commands.chatbotClient.config.modelName).toEqual("anthropic.claude-v2");
        expect(commands.chatbotClient.config.provider).toEqual("bedrock");
        const resp = await commands.processCommand(testCmd);
        expect(resp).toEqual({
            message: "active large language model: **amazon.titan-text-express-v1**",
            metaMessage: ""
        });
        expect(commands.chatbotClient.config.modelName).toEqual("amazon.titan-text-express-v1");
        expect(commands.chatbotClient.config.provider).toEqual("bedrock");
    }, 10_000);

    it("selects an invalid menu item for a large language model", async () => {
        const testCmd = "/select-model 999";
        expect(commands.chatbotClient.config.modelName).toEqual("anthropic.claude-v2");
        const resp = await commands.processCommand(testCmd);
        expect(resp).toEqual({
            message: "invalid menu item selected: 999",
            metaMessage: ""
        });
        expect(commands.chatbotClient.config.modelName).toEqual("anthropic.claude-v2");
    }, 10_000);

    it("creates the menu for selecting the workspace", async () => {
        const testCmd = "/list-rag-workspaces  ";
        const resp = await commands.processCommand(testCmd);
        expect(resp).toHaveProperty("message");
        expect(resp.message).toEqual(" ");
        expect(resp).toHaveProperty("metaMessage");
        const metaMessage = JSON.parse(resp.metaMessage);
        expect(metaMessage).toHaveProperty("table");
        expect(metaMessage.table).toEqual({
            firstcolname: expect.any(String),
            actioncolname: expect.any(String),
            name: expect.any(String),
            rows: expect.any(Array),
        });
        metaMessage.table.rows.forEach((item) => {
            expect(item).toHaveProperty("firstcolvalue");
            expect(item).toHaveProperty("response");
            expect(item.firstcolvalue).not.toEqual("");
            expect(item.response).not.toEqual("");
        });
    }, 10_000);

    it("selects a valid workspace", async () => {
        const testCmd = "/select-rag-workspace 0";
        expect(commands.chatbotClient.config.workspaceId).toEqual("");
        const resp = await commands.processCommand(testCmd);
        expect(resp).toEqual({
            message: "active workspace: **WickrIO-Bot-Advisor**",
            metaMessage: ""
        });
        expect(commands.chatbotClient.config.workspaceId).toEqual("WickrIO-Bot-Advisor");
    }, 10_000);

    it("selects an invalid menu item for a workspace", async () => {
        const testCmd = "/select-rag-workspace 994";
        expect(commands.chatbotClient.config.workspaceId).toEqual("");
        const resp = await commands.processCommand(testCmd);
        expect(resp).toEqual({
            message: "invalid menu item selected: 994",
            metaMessage: ""
        });
        expect(commands.chatbotClient.config.workspaceId).toEqual("");
    }, 10_000);

    it("requests the current configuration", async () => {
        const testCmd = "/current-config";
        let resp = await commands.processCommand(testCmd);
        expect(resp).toEqual({
            message: "active large language model: **anthropic.claude-v2**\n" +
                "active workspace: **<none selected>**",
            metaMessage: ""
        });
        await commands.processCommand("/select-model 0");
        await commands.processCommand("/select-rag-workspace 0");
        resp = await commands.processCommand(testCmd);
        expect(resp).toEqual({
            message: "active large language model: **amazon.titan-text-express-v1**\n" +
                "active workspace: **WickrIO-Bot-Advisor**",
            metaMessage: ""
        });
    }, 10_000);

    it("submits various non-commands", async () => {
        let testCmd = "this is not a command";
        let resp = await commands.processCommand(testCmd);
        expect(resp).toEqual(false);
        testCmd = "/ this is also not a command";
        resp = await commands.processCommand(testCmd);
        expect(resp).toEqual(false);
    }, 10_000);

    it("submits an unknown command and receives the help text", async () => {
        const startOfHelpText = "You can use the following commands:";
        let testCmd = "/help";
        let resp = await commands.processCommand(testCmd);
        expect(resp.message).toContain(startOfHelpText);
        expect(resp.metaMessage).toEqual("");
        testCmd = "/anything directly after the slash sign";
        resp = await commands.processCommand(testCmd);
        expect(resp.message).toContain(startOfHelpText);
    }, 10_000);

});
