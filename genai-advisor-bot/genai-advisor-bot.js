// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const WickrIOAPI = require('wickrio_addon');
const {WickrIOBot, logger} = require('wickrio-bot-api');
const fs = require('fs');
const util = require('util');

const {ChatbotClient} = require("./components/chatbot-graphql-api");
const {CommandInterpreter} = require('./components/commands.js');


console.log = function () {
    logger.info(util.format.apply(null, arguments))
}
console.error = function () {
    logger.error(util.format.apply(null, arguments))
}

console.log("---------- starting bot ... ----------");

// module-level variables
let bot;
const activeVGroupIDs = [];
let awsChatbot;
let commands;
const defaultConfig = {
    modelName: "anthropic.claude-v2",
    provider: "bedrock",
    workspaceName: "",
    workspaceId: "",
};


process.stdin.resume(); // so the program will not close instantly


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
            console.error('Exit error:', err);
            process.exit();
        }
        const closed = await bot.close();
        console.log(closed);
        if (options.exit) {
            process.exit();
        } else if (options.pid) {
            process.kill(process.pid);
        }
    } catch (err) {
        console.error(err);
    }
}


async function startWickrIoBot() {
    console.log('entered startWickrIoBot()');
    try {
        let status;
        if (process.argv[2] === undefined) {
            let bot_username = fs.readFileSync('client_bot_username.txt', 'utf-8');
            bot_username = bot_username.trim();
            bot = new WickrIOBot();
            status = await bot.start(bot_username)
        } else {
            bot = new WickrIOBot();
            status = await bot.start(process.argv[2])
        }
        if (!status) {
            await exitHandler(null, {
                exit: true,
                reason: 'Client not able to start.'
            });
        }
        await bot.startListening(listen); // passes a callback function that will receive incoming messages into the bot client
    } catch (err) {
        console.error(err);
    }
}

async function returnMessageHandler(messageIterator) {
    for await (const message of await messageIterator) {
        console.log("returnMessageHandler() - response from chatbot GraphQL subscription received.");
        const data = JSON.parse(message.receiveMessages.data);
        try {
            const resp = await WickrIOAPI.cmdSendRoomMessage(
                data.data.sessionId.toString(),
                data.data.content.toString(),
            );
            console.log(`WickrIOAPI resp = ${JSON.stringify(resp, null, 4)}`);
        } catch (err) {
            console.error('Error sending message back to Wickr client.');
            console.error(err);
        }
    }
}


async function listen(rMessage) { // starts a listener. Message payload accessible as 'message'
    console.log('entered listen()');
    const parsedMessage = bot.parseMessage(rMessage);
    const vGroupID = parsedMessage.vgroupid;
    if (parsedMessage.message) {
        const cmdResp = await commands.processCommand(parsedMessage.message);
        if (cmdResp) {
            console.log('responding to command input');
            await WickrIOAPI.cmdSendRoomMessage(vGroupID, cmdResp.message, "", "", "", [], cmdResp.metaMessage);
        } else {
            if (!activeVGroupIDs.includes(vGroupID)) {
                activeVGroupIDs.push(vGroupID);
                console.log("creating response message iterator");
                const messageIterator = awsChatbot.responseMessagesListener(vGroupID);
                returnMessageHandler(messageIterator).then(() => {
                    console.log("returnMessageHandler().then()");
                });
            }
            console.log("sending message to chatbot API");
            awsChatbot.send(parsedMessage.message, vGroupID);
        }
    }
}


async function main() { // entry point
    console.log('entered main()');
    awsChatbot = new ChatbotClient(defaultConfig);
    commands = new CommandInterpreter(awsChatbot);
    try {
        await startWickrIoBot();
    } catch (err) {
        console.error(err);
    }
}

main().then();


module.exports = WickrIOAPI;
module.exports.listen = listen;
module.exports.main = main;  // exported to for unit testing
