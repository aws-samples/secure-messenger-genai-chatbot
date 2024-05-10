const {v4: uuidv4} = require('uuid');

function handleQqlData(data) {
    console.log("handleQqlData() - data received.");
    console.log("sessionId: ", data.id);
    console.log("content: ", JSON.parse(data.payload.data.receiveMessages.data).data.content);
}


let awsChatbot;


async function main() {
    // Create a chatbot client and set model, model provider and RAG workspace as default
    // configuration.
    const {default: ChatbotClient} = await import('../components/chatbot.mjs');
    awsChatbot = new ChatbotClient({
        modelName: "anthropic.claude-v2",
        provider: "bedrock",
        workspaceId: "",
    });

    // create uniquie ID for the conversation
    const sessionId1 = uuidv4();

    // Subscribe to receive response messages from AWS GenAI Chatbot.
    awsChatbot.subscribeChatbotReceiveMsg(sessionId1, (data) => handleQqlData(data));

    // Send message with default configuration.
    console.log("Sending message with sessionId1 = ", sessionId1);
    awsChatbot.send(sessionId1, "Where is Berlin?");

    // Send message with different configuration and different session ID.
    const sessionId2 = uuidv4();
    awsChatbot.subscribeChatbotReceiveMsg(sessionId2, (data) => handleQqlData(data));
    console.log("Sending message with sessionId2 = ", sessionId2);
    awsChatbot.send(sessionId2, "Where is Berlin?", {
        modelName: "amazon.titan-text-express-v1",
        provider: "bedrock",
        workspaceId: "",
    });
}

main().then();
