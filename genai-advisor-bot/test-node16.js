import {ChatbotClient} from "./components/chatbot.js";

const awsChatbot = new ChatbotClient();
await awsChatbot.subscribeChatbotReceiveMsg("0871ef0b-e48a-44eb-a394-04173d62689b");
