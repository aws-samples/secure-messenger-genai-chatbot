const {v4: uuidv4} = require('uuid');


// module variables
let awsChatbot;


function handleQqlData(data) {
    console.log("handleQqlData() - data received.");
    console.log("sessionId: ", data.id);
    console.log("content: ", JSON.parse(data.payload.data.receiveMessages.data).data.content);
}


async function test_chatbotGraphqlApi() {
    const chatbotApi = await import('../components/chatbot-graphql-api.mjs');
    // await chatbotApi.listModels();
    // await chatbotApi.listRagEngines();
    // await chatbotApi.listWorkspaces();
    // await chatbotApi.listKendraIndexes();

    awsChatbot = new chatbotApi.ChatbotClient({
        modelName: "anthropic.claude-v2",
        provider: "bedrock",
        workspaceId: "",
    });

    // send a message
    const sessionId = uuidv4();
    const messageIterator = chatbotApi.responseMessagesListener(sessionId);

    awsChatbot.send(
        "Where is Berlin?",
        sessionId,
    ).then();

    const {value: message1, done: isDone1} = await messageIterator.next();
    if (!isDone1) {
        console.log("Received message:", JSON.stringify(message1));
    } else {
        console.log("No messages received.");
    }

    awsChatbot.send(
        "Where is Berlin?",
        sessionId,
        {
            modelName: "amazon.titan-text-express-v1",
            provider: "bedrock",
            workspaceId: "",
        }
    ).then();

    const {value: message2, done: isDone2} = await messageIterator.next();
    if (!isDone2) {
        console.log("Received message:", JSON.stringify(message2));
    } else {
        console.log("No messages received.");
    }

    console.log("end");
}

async function main() {
    await test_chatbotGraphqlApi();
}

main().then();
