import {describe, it, expect, jest, beforeEach} from '@jest/globals';

const {v4: uuidv4} = require('uuid');
import {ChatbotClient} from '../components/chatbot-graphql-api.js';
import {CommandInterpreter} from '../components/commands.js';


function handleQqlData(data) {
    console.log("handleQqlData() - data received.");
    console.log("sessionId: ", data.id);
    console.log("content: ", JSON.parse(data.payload.data.receiveMessages.data).data.content);
}


async function returnMessageHandler(messageIterator) {
    for await (const message of await messageIterator) {
        const data = JSON.parse(message.receiveMessages.data);
        console.log("Received message.");
        console.log("Session ID: ", data.data.sessionId);
        console.log("Model ID: ", data.data.metadata.modelId);
        console.log("Content: ", data.data.content);
    }
}


async function test_chatbotGraphqlApi() {
    chatbotApi = await import('../components/chatbot-graphql-api.js');
    await chatbotApi.listModels().then((data) => {
        console.log("listModels() - data: ", JSON.stringify(data, null, 4));
    });
    // await chatbotApi.listRagEngines();
    // await chatbotApi.listWorkspaces();
    // await chatbotApi.listKendraIndexes();

    // awsChatbot = new chatbotApi.ChatbotClient({
    //     modelName: "anthropic.claude-v2",
    //     provider: "bedrock",
    //     workspaceId: "",
    // });
    //
    // // send a message
    // const sessionId1 = uuidv4();
    // console.log("sessionId1: ", sessionId1);
    // const messageIterator1 = chatbotApi.responseMessagesListener(sessionId1);
    // returnMessageHandler(messageIterator1).then();
    //
    // awsChatbot.send(
    //     "Where is Berlin?",
    //     sessionId1,
    // ).then();
    //
    // const sessionId2 = uuidv4();
    // console.log("sessionId1: ", sessionId2);
    // const messageIterator2 = chatbotApi.responseMessagesListener(sessionId2);
    // returnMessageHandler(messageIterator2).then();
    //
    // awsChatbot.send(
    //     "Where is Berlin?",
    //     sessionId2,
    //     {
    //         modelName: "amazon.titan-text-express-v1",
    //         provider: "bedrock",
    //         workspaceId: "",
    //     }
    // ).then();
}


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
    });

    it("creates the menu for selecting the model", async () => {
        jest.setTimeout(10000);
        const testCmd = "/list-models  ";
        const resp = await commands.processCommand(testCmd);
        expect(resp).toHaveProperty("message");
        expect(resp.message).toEqual("");
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
    });

    it("selects a valid large language model", async () => {
        jest.setTimeout(10000);
        const testCmd = "/select-model 0";
        expect(commands.chatbotClient.config.modelName).toEqual("anthropic.claude-v2");
        expect(commands.chatbotClient.config.provider).toEqual("bedrock");
        const resp = await commands.processCommand(testCmd);
        expect(resp).toEqual({
            message: "active large language model: amazon.titan-text-express-v1"
        });
        expect(commands.chatbotClient.config.modelName).toEqual("amazon.titan-text-express-v1");
        expect(commands.chatbotClient.config.provider).toEqual("bedrock");
    });

    it("selects an invalid menu item for a large language model", async () => {
        jest.setTimeout(10000);
        const testCmd = "/select-model 999";
        expect(commands.chatbotClient.config.modelName).toEqual("anthropic.claude-v2");
        const resp = await commands.processCommand(testCmd);
        expect(resp).toEqual({
            message: "invalid menu item selected: 999"
        });
        expect(commands.chatbotClient.config.modelName).toEqual("anthropic.claude-v2");
    });

    it("creates the menu for selecting the workspace", async () => {
        jest.setTimeout(10000);
        const testCmd = "/list-rag-workspaces  ";
        const resp = await commands.processCommand(testCmd);
        expect(resp).toHaveProperty("message");
        expect(resp.message).toEqual("");
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
    });

    it("selects a valid workspace", async () => {
        jest.setTimeout(10000);
        const testCmd = "/select-rag-workspace 0";
        expect(commands.chatbotClient.config.workspaceId).toEqual("");
        const resp = await commands.processCommand(testCmd);
        expect(resp).toEqual({
            message: "active workspace: WickrIO-Bot-Advisor"
        });
        expect(commands.chatbotClient.config.workspaceId).toEqual("WickrIO-Bot-Advisor");
    });

    it("selects an invalid menu item for a workspace", async () => {
        jest.setTimeout(10000);
        const testCmd = "/select-rag-workspace 994";
        expect(commands.chatbotClient.config.workspaceId).toEqual("");
        const resp = await commands.processCommand(testCmd);
        expect(resp).toEqual({
            message: "invalid menu item selected: 994"
        });
        expect(commands.chatbotClient.config.workspaceId).toEqual("");
    });

    it("requests the current configuration", async () => {
        jest.setTimeout(10000);
        const testCmd = "/current-config";
        let resp = await commands.processCommand(testCmd);
        expect(resp).toEqual({
            message: "active large language model: anthropic.claude-v2, active workspace: "
        });
        await commands.processCommand("/select-model 0");
        await commands.processCommand("/select-rag-workspace 0");
        resp = await commands.processCommand(testCmd);
        expect(resp).toEqual({
            message: "active large language model: amazon.titan-text-express-v1, active workspace: WickrIO-Bot-Advisor"
        });
    });

    it("submits various non-commands", async () => {
        jest.setTimeout(10000);
        let testCmd = "this is not a command";
        let resp = await commands.processCommand(testCmd);
        expect(resp).toEqual(false);
        testCmd = "/ this is also not a command";
        resp = await commands.processCommand(testCmd);
        expect(resp).toEqual(false);
    });

    it("submits an unknown command and receives the help text", async () => {
        jest.setTimeout(10000);
        const startOfHelpText = "You can use the following commands:";
        let testCmd = "/help";
        let resp = await commands.processCommand(testCmd);
        expect(resp).toContain(startOfHelpText);
        testCmd = "/anything directly after the slash sign";
        resp = await commands.processCommand(testCmd);
        expect(resp).toContain(startOfHelpText);
    });

});
