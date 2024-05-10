// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const WickrIOAPI = require('wickrio_addon');
const WickrIOBotAPI = require('wickrio-bot-api');
const fs = require('fs');
const util = require('util');
const logger = require('wickrio-bot-api').logger;


console.log = function () {
    logger.info(util.format.apply(null, arguments))
}
console.error = function () {
    logger.error(util.format.apply(null, arguments))
}


// module-level variables
let bot;
const activeVGroupIDs = [];
let awsChatbot;
const defaultConfig = {
    modelName: "anthropic.claude-v2",
    provider: "bedrock",
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
    console.info('entered startWickrIoBot()');
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
        console.error(err);
    }
}

async function handleQqlData(data) {
    console.log("handleQqlData() - response from chatbot API received.");
    try {
        const resp = await WickrIOAPI.cmdSendRoomMessage(
            data.id.toString(),
            JSON.parse(data.payload.data.receiveMessages.data).data.content);
        console.log(`resp = ${JSON.stringify(resp, null, 4)}`);
    } catch (err) {
        console.error('Error sending message back to Wickr client.');
        console.error(err);
    }
}


async function listen(rMessage) { // starts a listener. Message payload accessible as 'message'
    console.info('entered listen()')
    var parsedMessage = bot.parseMessage(rMessage);
    var userEmail = parsedMessage.userEmail;
    var vGroupID = parsedMessage.vgroupid;
    var userArr = [];
    userArr.push(userEmail);
    if (parsedMessage.message) {
        if (!activeVGroupIDs.includes(vGroupID)) {
            activeVGroupIDs.push(vGroupID);
            console.info("sending message to chatbot API");
            awsChatbot.subscribeChatbotReceiveMsg(vGroupID, handleQqlData);
        }
        awsChatbot.send(vGroupID, parsedMessage.message);
    }
}


async function main() { // entry point
    console.info('entered main()');
    const {default: ChatbotClient} = await import('./components/chatbot.mjs');
    awsChatbot = new ChatbotClient(defaultConfig);
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
