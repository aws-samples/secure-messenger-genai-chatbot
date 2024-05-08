import { v4 as uuidv4 } from "uuid";
import {ChatbotClient} from "./components/chatbot.js";

const awsChatbot = new ChatbotClient();
const sessionId = uuidv4();
awsChatbot.subscribeChatbotReceiveMsg(sessionId);
awsChatbot.send(sessionId, "Where is Berlin?");
