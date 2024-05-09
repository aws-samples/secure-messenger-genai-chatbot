import { v4 as uuidv4 } from "uuid";
import {ChatbotClient} from "./components/chatbot.js";

function handleQqlData(data) {
    console.log("test-node16 - data received.");
    console.log("data: ", JSON.stringify(data, null, 4));
}

// Create a chatbot client and set model, model provider and RAG workspace as default
// configuration.
const awsChatbot = new ChatbotClient({
    modelName: "anthropic.claude-v2",
    provider: "bedrock",
    workspaceId: "",
});

// create uniquie ID for the conversation
const sessionId = uuidv4();

// Subscribe to receive response messages from AWS GenAI Chatbot.
awsChatbot.subscribeChatbotReceiveMsg(sessionId, handleQqlData);

// Send message with default configuration.
awsChatbot.send(sessionId, "Where is Berlin?");

// Send message with different configuration.
awsChatbot.send(sessionId, "Where is Berlin?", {
    modelName: "amazon.titan-text-express-v1",
    provider: "bedrock",
    workspaceId: "",
});
