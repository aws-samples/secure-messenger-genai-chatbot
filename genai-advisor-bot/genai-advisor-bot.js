// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const { v4: uuidv4 } = require('uuid');
const WickrIOAPI = require('wickrio_addon');
const WickrIOBotAPI = require('wickrio-bot-api');
const util = require('util')
const logger = require('wickrio-bot-api').logger

console.log = function () {
    logger.info(util.format.apply(null, arguments))
}
console.error = function () {
    logger.error(util.format.apply(null, arguments))
}

const fs = require('fs');
const path = require('path');


module.exports = WickrIOAPI;
process.stdin.resume(); // so the program will not close instantly

let bot;

//catches ctrl+c and stop.sh events
process.on('SIGINT', exitHandler.bind(null, {
    exit: true
}));

// catches "kill pid" (for example: nodemon restart)
process.on('SIGUSR1', exitHandler.bind(null, {
    pid: true
}));
process.on('SIGUSR2', exitHandler.bind(null, {
    pid: true
}));

//catches uncaught exceptions
process.on('uncaughtException', exitHandler.bind(null, {
    exit: true
}));

async function exitHandler(options, err) {
    try {
        if (err) {
            logger.error('Exit error:', err);
            process.exit();
        }
        const closed = await bot.close();
        logger.log(closed);
        if (options.exit) {
            process.exit();
        } else if (options.pid) {
            process.kill(process.pid);
        }
    } catch (err) {
        logger.error(err);
    }
}


async function startWickrIoBot() {
    logger.info('entered startWickrIoBot()');
    try {
        var status;
        if (process.argv[2] === undefined) {
            var bot_username = fs.readFileSync('client_bot_username.txt', 'utf-8');
            bot_username = bot_username.trim();
            bot = new WickrIOBotAPI.WickrIOBot();
            status = await bot.start(bot_username)
        } else {
            bot = new WickrIOBotAPI.WickrIOBot();
            status = await bot.start(process.argv[2])
        }
        if (!status) {
            exitHandler(null, {
                exit: true,
                reason: 'Client not able to start.'
            });
        }
        await bot.startListening(listen); // passes a callback function that will receive incoming messages into the bot client
    } catch (err) {
        logger.error(err);
    }
}


async function listen(rMessage) { // starts a listener. Message payload accessible as 'message'
    logger.info('entered listen()')
    var parsedMessage = bot.parseMessage(rMessage);
    var userEmail = parsedMessage.userEmail;
    var vGroupID = parsedMessage.vgroupid;
    var userArr = [];
    userArr.push(userEmail);
    if (parsedMessage.message) {
        // for testing purposes do an echo, just sent the same message back
        logger.info('for testing purposes do an echo, just sent the same message back');
        logger.info(`parsedMessage.message = ${parsedMessage.message}`);
        logger.info(`vGroupID = ${vGroupID}`);
        const resp = await WickrIOAPI.cmdSendRoomMessage(vGroupID, parsedMessage.message);
        logger.info(`resp = ${JSON.stringify(resp)}`);
        // await sendMessageToGenAiChatbot(parsedMessage.message, vGroupID)
    }
}

module.exports.listen = listen;

function handleQqlData(data) {
    console.log("test-node16 - data received.");
    console.log("data: ", JSON.stringify(data, null, 4));
}

async function main() { // entry point
    const { default: ChatbotClient } = await import('./components/chatbot.mjs');
    logger.info('entered main()');
    try {
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
        await startWickrIoBot();
    } catch (err) {
        logger.error(err);
    }
}

module.exports.main = main;

main().then();
